import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { compressContext } from '../lib/bear1';
import { generateReschedule, RescheduleOperation } from '../lib/gemini';
import { listEvents, getWeekRange, updateEvent, deleteEvent, createEvent, getOrCreateEbkCalendar } from '../lib/google-calendar';
import { firestore } from '../lib/firebase-admin';

function parseIsoDate(value?: string): Date {
  if (!value) {
    throw new Error('Expected ISO 8601 timestamp');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid ISO 8601 timestamp provided by AI');
  }
  return date;
}

// Convert day names or ISO strings to ISO timestamps, ensuring future dates
function convertToFutureIsoTimestamp(value: string, referenceDate?: Date): string {
  const now = referenceDate || new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lowerValue = value.toLowerCase().trim();
  
  // Check if it's a day name
  const dayIndex = dayNames.indexOf(lowerValue);
  if (dayIndex !== -1) {
    // Find next occurrence of this day
    const currentDay = now.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil <= 0) {
      daysUntil += 7; // Next week
    }
    
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    targetDate.setHours(9, 0, 0, 0); // Default to 9 AM
    
    // Ensure it's in the future (add buffer for time of day)
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 7);
    }
    
    return targetDate.toISOString();
  }
  
  // Try parsing as ISO timestamp
  try {
    const date = parseIsoDate(value);
    // Ensure it's in the future
    if (date <= now) {
      throw new Error(`Date ${value} is in the past`);
    }
    return date.toISOString();
  } catch (error) {
    throw new Error(`Cannot convert "${value}" to a future ISO timestamp: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper: Convert a time in user's timezone to UTC Date object
function createDateInTimezone(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  // Strategy: Find what UTC time, when displayed in the target timezone, equals hour:minute
  // We'll use a reference UTC time and calculate the offset
  
  // Create a reference UTC date for this day at noon
  const refUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
  
  // Format it in the target timezone to see what time it is there
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const refParts = formatter.formatToParts(refUTC);
  const refTzHour = parseInt(refParts.find(p => p.type === 'hour')!.value);
  const refTzMinute = parseInt(refParts.find(p => p.type === 'minute')!.value);
  
  // Calculate the difference: we want hour:minute, reference shows refTzHour:refTzMinute
  // So we need to adjust the UTC time by (hour - refTzHour) hours and (minute - refTzMinute) minutes
  const hourDiff = hour - refTzHour;
  const minDiff = minute - refTzMinute;
  const totalDiffMs = (hourDiff * 60 + minDiff) * 60 * 1000;
  
  // Create the UTC date that will display as hour:minute in the target timezone
  const resultUTC = new Date(refUTC.getTime() + totalDiffMs);
  
  // Verify it's correct (for debugging)
  const verifyParts = formatter.formatToParts(resultUTC);
  const verifyHour = parseInt(verifyParts.find(p => p.type === 'hour')!.value);
  const verifyMinute = parseInt(verifyParts.find(p => p.type === 'minute')!.value);
  
  if (verifyHour !== hour || verifyMinute !== minute) {
    console.warn(`[Reschedule] Timezone conversion warning: wanted ${hour}:${minute}, got ${verifyHour}:${verifyMinute} in ${timezone}`);
  }
  
  return resultUTC;
}

// Validate and adjust time to be within working hours for a given day
function adjustToWorkingHours(date: Date, workingWindow: Record<string, { enabled: boolean; start: string; end: string }> | null, timezone?: string): Date {
  if (!workingWindow) {
    return date; // No working window configured, return as-is
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Get the date components in the user's timezone
  const userTimezone = timezone || 'America/New_York';
  
  // Convert the UTC date to user's timezone to get the day and time
  const userDateStr = date.toLocaleString('en-US', { timeZone: userTimezone });
  const userDate = new Date(userDateStr);
  const dayName = dayNames[userDate.getDay()];
  const dayConfig = workingWindow[dayName];

  if (!dayConfig || !dayConfig.enabled) {
    return date; // Day is disabled or not configured, return as-is (will trigger confirm_outside_hours)
  }

  // Parse working hours (format: "09:00" -> hours: 9, minutes: 0)
  // These are in USER'S timezone
  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);

  // Get time components in user's timezone using Intl API
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')!.value);
  const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1; // 0-indexed
  const day = parseInt(parts.find(p => p.type === 'day')!.value);
  const userHour = parseInt(parts.find(p => p.type === 'hour')!.value);
  const userMin = parseInt(parts.find(p => p.type === 'minute')!.value);
  
  // Log for debugging
  console.log(`[Reschedule] adjustToWorkingHours: ${date.toISOString()} -> User TZ (${userTimezone}): ${userHour}:${userMin}, Day: ${dayName}, Window: ${startHour}:${startMin}-${endHour}:${endMin}`);

  let targetHour = userHour;
  let targetMin = userMin;
  let needsAdjustment = false;

  // If time is before start of working hours, move to start
  if (userHour < startHour || (userHour === startHour && userMin < startMin)) {
    targetHour = startHour;
    targetMin = startMin;
    needsAdjustment = true;
  }
  // If time is after end of working hours, clamp to end time
  else if (userHour > endHour || (userHour === endHour && userMin >= endMin)) {
    targetHour = endHour;
    targetMin = endMin;
    needsAdjustment = true;
  }

  if (needsAdjustment) {
    const beforeAdjust = date.toISOString();
    // Create a new date in user's timezone with the target time, then convert to UTC
    const adjustedDate = createDateInTimezone(year, month, day, targetHour, targetMin, userTimezone);
    console.log(`[Reschedule] ⚠️ CLAMPED: ${beforeAdjust} -> ${adjustedDate.toISOString()} (${dayName} ${targetHour}:${targetMin.toString().padStart(2, '0')} ${userTimezone})`);
    return adjustedDate;
  }

  return date;
}

// Convert and validate operations, ensuring all dates are in the future and within working hours
async function convertOperations(operations: RescheduleOperation[], userId: string): Promise<RescheduleOperation[]> {
  const now = new Date();
  
  // Log how many operations we received
  console.log(`[Reschedule] Received ${operations.length} operation(s) to convert`);
  const moveOps = operations.filter(op => op.op === 'move');
  console.log(`[Reschedule] Move operations: ${moveOps.length}`);
  if (moveOps.length > 0) {
    console.log(`[Reschedule] Block IDs to move:`, moveOps.map(op => op.blockId).filter(Boolean));
  }
  
  // Fetch working window settings
  const settingsDoc = await firestore.collection('settings').doc(userId).get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;
  const workingWindow = settings?.workingWindow as Record<string, { enabled: boolean; start: string; end: string }> | null;
  const timezone = settings?.timezone as string | undefined;
  const blockLengthMinutes = (settings?.blockLengthMinutes as number) || 30;
  const minGapMinutes = (settings?.minGapMinutes as number) || 5;
  
  // Fetch original blocks to get their durations
  const blockIds = moveOps.map(op => op.blockId).filter(Boolean) as string[];
  const blockDurations = new Map<string, number>(); // blockId -> duration in milliseconds
  
  if (blockIds.length > 0) {
    // Use getAll() to fetch documents directly by ID - more efficient and doesn't require composite index
    // Firestore getAll() has a limit, so batch if needed
    const batchSize = 10;
    for (let i = 0; i < blockIds.length; i += batchSize) {
      const batch = blockIds.slice(i, i + batchSize);
      const docRefs = batch.map(id => firestore.collection('focusBlocks').doc(id));
      
      try {
        const docs = await firestore.getAll(...docRefs);
        
        for (const doc of docs) {
          // Verify the block belongs to this user (security check)
          const block = doc.data();
          if (block && block.userId === userId) {
            if (block.start && block.end) {
              const duration = new Date(block.end).getTime() - new Date(block.start).getTime();
              blockDurations.set(doc.id, duration);
            } else {
              // Fallback to default block length
              blockDurations.set(doc.id, blockLengthMinutes * 60 * 1000);
            }
          }
        }
      } catch (error) {
        console.warn(`[Reschedule] Failed to fetch block batch:`, error);
        // Continue with other batches
      }
    }
  }
  
  // Track scheduled time slots to prevent overlaps: Map<dayKey, Array<{start: number, end: number}>>
  // dayKey format: "YYYY-MM-DD", times are minutes since midnight in user's timezone
  const scheduledSlots = new Map<string, Array<{ start: number; end: number }>>();
  
  // Fetch existing focus blocks to check for conflicts
  // First, determine the date range we need to check
  const moveOpsWithDates = moveOps.filter(op => op.to).map(op => {
    try {
      return { op, date: parseIsoDate(convertToFutureIsoTimestamp(op.to!, now)) };
    } catch {
      return null;
    }
  }).filter(Boolean) as Array<{ op: RescheduleOperation; date: Date }>;
  
  if (moveOpsWithDates.length > 0) {
    // Get date range: earliest date to latest date + 1 day buffer
    const dates = moveOpsWithDates.map(item => item.date);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    minDate.setDate(minDate.getDate() - 1); // Buffer before
    maxDate.setDate(maxDate.getDate() + 1); // Buffer after
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);
    
    // Fetch existing focus blocks in this range (excluding blocks being moved)
    const blockIdsToExclude = new Set(blockIds);
    const existingBlocksSnapshot = await firestore.collection('focusBlocks')
      .where('userId', '==', userId)
      .where('start', '>=', minDate.toISOString())
      .where('start', '<=', maxDate.toISOString())
      .get();
    
    const userTimezone = timezone || 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    // Add existing blocks to scheduled slots (excluding blocks being moved)
    for (const doc of existingBlocksSnapshot.docs) {
      const block = doc.data();
      // Skip blocks that are being moved
      if (blockIdsToExclude.has(doc.id)) {
        continue;
      }
      
      // Only include blocks that are scheduled or completed (not skipped/deleted)
      if (block.status === 'skipped' || block.status === 'deleted') {
        continue;
      }
      
      if (block.start && block.end) {
        const startDate = new Date(block.start);
        const endDate = new Date(block.end);
        
        // Convert to user's timezone to get day key and time slots
        const startParts = formatter.formatToParts(startDate);
        const endParts = formatter.formatToParts(endDate);
        
        const year = parseInt(startParts.find(p => p.type === 'year')!.value);
        const month = parseInt(startParts.find(p => p.type === 'month')!.value) - 1;
        const day = parseInt(startParts.find(p => p.type === 'day')!.value);
        const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const startHour = parseInt(startParts.find(p => p.type === 'hour')!.value);
        const startMin = parseInt(startParts.find(p => p.type === 'minute')!.value);
        const endHour = parseInt(endParts.find(p => p.type === 'hour')!.value);
        const endMin = parseInt(endParts.find(p => p.type === 'minute')!.value);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        // Add to scheduled slots
        const existingSlots = scheduledSlots.get(dayKey) || [];
        existingSlots.push({ start: startMinutes, end: endMinutes });
        scheduledSlots.set(dayKey, existingSlots);
        
        console.log(`[Reschedule] Added existing block ${doc.id} to scheduled slots: ${dayKey} ${startHour}:${startMin.toString().padStart(2, '0')}-${endHour}:${endMin.toString().padStart(2, '0')}`);
      }
    }
    
    console.log(`[Reschedule] Loaded ${existingBlocksSnapshot.docs.length} existing focus blocks for conflict detection`);
    
    // Also fetch calendar events to check for conflicts
    const selectedCalendars = settings?.selectedCalendars as string[] | null;
    const ebkCalendarId = settings?.ebkCalendarId as string | null;
    
    try {
      const calendarEvents = await listEvents(userId, minDate, maxDate, selectedCalendars, ebkCalendarId);
      
      // Add calendar events to scheduled slots (excluding EBK focus blocks which we already handled)
      for (const event of calendarEvents) {
        // Skip EBK focus blocks (we already added those above)
        if (event.isEliteBall) {
          continue;
        }
        
        if (event.start && event.end) {
          const startDate = new Date(event.start);
          const endDate = new Date(event.end);
          
          // Convert to user's timezone
          const startParts = formatter.formatToParts(startDate);
          const endParts = formatter.formatToParts(endDate);
          
          const year = parseInt(startParts.find(p => p.type === 'year')!.value);
          const month = parseInt(startParts.find(p => p.type === 'month')!.value) - 1;
          const day = parseInt(startParts.find(p => p.type === 'day')!.value);
          const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          const startHour = parseInt(startParts.find(p => p.type === 'hour')!.value);
          const startMin = parseInt(startParts.find(p => p.type === 'minute')!.value);
          const endHour = parseInt(endParts.find(p => p.type === 'hour')!.value);
          const endMin = parseInt(endParts.find(p => p.type === 'minute')!.value);
          
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          // Add to scheduled slots
          const existingSlots = scheduledSlots.get(dayKey) || [];
          existingSlots.push({ start: startMinutes, end: endMinutes });
          scheduledSlots.set(dayKey, existingSlots);
          
          console.log(`[Reschedule] Added calendar event "${event.title}" to scheduled slots: ${dayKey} ${startHour}:${startMin.toString().padStart(2, '0')}-${endHour}:${endMin.toString().padStart(2, '0')}`);
        }
      }
      
      console.log(`[Reschedule] Loaded ${calendarEvents.length} calendar events for conflict detection`);
    } catch (error) {
      console.warn(`[Reschedule] Failed to fetch calendar events for conflict detection:`, error);
      // Continue without calendar events - focus blocks are more important
    }
  }
  
  // Helper: Find next available slot that doesn't overlap
  const findNextAvailableSlot = (
    proposedDate: Date,
    blockDurationMs: number,
    workingWindow: Record<string, { enabled: boolean; start: string; end: string }> | null,
    timezone: string | undefined
  ): Date => {
    const userTimezone = timezone || 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(proposedDate);
    const year = parseInt(parts.find(p => p.type === 'year')!.value);
    const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
    const day = parseInt(parts.find(p => p.type === 'day')!.value);
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[proposedDate.getDay()];
    const dayConfig = workingWindow?.[dayName];
    
    if (!dayConfig || !dayConfig.enabled) {
      return proposedDate; // Can't find slot if day is disabled
    }
    
    const [startHour, startMin] = dayConfig.start.split(':').map(Number);
    const [endHour, endMin] = dayConfig.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Get current proposed time in minutes
    const proposedHour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const proposedMin = parseInt(parts.find(p => p.type === 'minute')!.value);
    let currentMinutes = proposedHour * 60 + proposedMin;
    
    // Ensure we start at or after working hours start
    if (currentMinutes < startMinutes) {
      currentMinutes = startMinutes;
    }
    
    const blockDurationMinutes = Math.ceil(blockDurationMs / (60 * 1000));
    const blockEndMinutes = currentMinutes + blockDurationMinutes;
    
    // Get existing slots for this day
    const existingSlots = scheduledSlots.get(dayKey) || [];
    
    // Check if current slot overlaps with any existing slot
    const hasOverlap = existingSlots.some(slot => {
      // Check if blocks overlap: current block starts before existing ends AND current block ends after existing starts
      return currentMinutes < slot.end && blockEndMinutes > slot.start;
    });
    
    if (!hasOverlap && blockEndMinutes <= endMinutes) {
      // No overlap and fits within working hours - use this slot
      scheduledSlots.set(dayKey, [...existingSlots, { start: currentMinutes, end: blockEndMinutes }]);
      return createDateInTimezone(year, month, day, Math.floor(currentMinutes / 60), currentMinutes % 60, userTimezone);
    }
    
    // Find next available slot
    // Sort existing slots by start time
    const sortedSlots = [...existingSlots].sort((a, b) => a.start - b.start);
    
    // Try slots: start of day, after each existing slot, or at proposed time if it fits
    const candidateSlots: number[] = [startMinutes];
    
    // Add slots after each existing block (with gap)
    for (const slot of sortedSlots) {
      candidateSlots.push(slot.end + minGapMinutes);
    }
    
    // Add proposed time if it's valid
    if (proposedHour * 60 + proposedMin >= startMinutes && proposedHour * 60 + proposedMin < endMinutes) {
      candidateSlots.push(proposedHour * 60 + proposedMin);
    }
    
    // Sort and find first available slot
    candidateSlots.sort((a, b) => a - b);
    
    for (const candidateStart of candidateSlots) {
      if (candidateStart < startMinutes) continue;
      
      const candidateEnd = candidateStart + blockDurationMinutes;
      if (candidateEnd > endMinutes) continue; // Would exceed working hours
      
      // Check if this slot overlaps
      const overlaps = existingSlots.some(slot => {
        return candidateStart < slot.end && candidateEnd > slot.start;
      });
      
      if (!overlaps) {
        // Found available slot
        scheduledSlots.set(dayKey, [...existingSlots, { start: candidateStart, end: candidateEnd }]);
        return createDateInTimezone(year, month, day, Math.floor(candidateStart / 60), candidateStart % 60, userTimezone);
      }
    }
    
    // If no slot found, return the original (will be handled by validation)
    console.warn(`[Reschedule] Could not find non-overlapping slot for block on ${dayKey}`);
    return proposedDate;
  };
  
  const converted: RescheduleOperation[] = [];
  const skipped: RescheduleOperation[] = [];
  
  for (const op of operations) {
    const convertedOp: RescheduleOperation = { ...op };
    
    if (op.op === 'move') {
      // For "from", just validate it's a valid ISO timestamp (don't require it to be future)
      if (op.from) {
        try {
          const fromDate = parseIsoDate(op.from);
          convertedOp.from = fromDate.toISOString();
        } catch (error) {
          // If from is invalid, we can still proceed - it's just metadata
          console.warn(`[Reschedule] Invalid "from" timestamp: ${op.from}`, error);
        }
      }
      
      // For "to", ensure it's a future date and within working hours, and doesn't overlap
      if (op.to) {
        try {
          const originalTo = op.to;
          const toDate = parseIsoDate(convertToFutureIsoTimestamp(op.to, now));
          let adjustedDate = adjustToWorkingHours(toDate, workingWindow, timezone);
          
          // Get block duration
          const blockDuration = op.blockId ? (blockDurations.get(op.blockId) || blockLengthMinutes * 60 * 1000) : blockLengthMinutes * 60 * 1000;
          
          // Find next available non-overlapping slot (handles both working hours and overlaps)
          const finalAdjustedDate = findNextAvailableSlot(adjustedDate, blockDuration, workingWindow, timezone);
          
          // Log if adjustment was made
          if (finalAdjustedDate.getTime() !== toDate.getTime()) {
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[finalAdjustedDate.getDay()];
            console.log(`[Reschedule] Adjusted time for block ${op.blockId}: ${originalTo} -> ${finalAdjustedDate.toISOString()} (${dayName})`);
          }
          
          convertedOp.to = finalAdjustedDate.toISOString();
        } catch (error) {
          console.error(`[Reschedule] Failed to convert "to" timestamp for block ${op.blockId}:`, op.to, error);
          skipped.push(op);
          continue; // Skip this operation
        }
      } else {
        console.warn(`[Reschedule] Move operation missing "to" field for block ${op.blockId}`);
        skipped.push(op);
        continue; // Skip operations without "to"
      }
      
      // Validate blockId exists
      if (!op.blockId) {
        console.warn(`[Reschedule] Move operation missing blockId`);
        skipped.push(op);
        continue;
      }
    } else if (op.op === 'create') {
      if (op.start) {
        const startDate = parseIsoDate(convertToFutureIsoTimestamp(op.start, now));
        const adjustedStart = adjustToWorkingHours(startDate, workingWindow, timezone);
        convertedOp.start = adjustedStart.toISOString();
        
        // Adjust end time to maintain block duration, but ensure it doesn't exceed working hours
        if (op.end) {
          const originalStart = parseIsoDate(op.start);
          const originalEnd = parseIsoDate(convertToFutureIsoTimestamp(op.end, now));
          const blockDuration = originalEnd.getTime() - originalStart.getTime();
          const adjustedEnd = new Date(adjustedStart.getTime() + blockDuration);
          
          // Ensure end time is also within working hours
          const finalEnd = adjustToWorkingHours(adjustedEnd, workingWindow, timezone);
          
          // If end was clamped back, ensure it's still after start
          if (finalEnd <= adjustedStart) {
            // Block duration would exceed working hours - clamp end to end of working hours
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[adjustedStart.getDay()];
            const dayConfig = workingWindow?.[dayName];
            if (dayConfig && dayConfig.enabled) {
              const [endHour, endMin] = dayConfig.end.split(':').map(Number);
              const clampedEnd = new Date(adjustedStart);
              clampedEnd.setHours(endHour, endMin, 0, 0);
              convertedOp.end = clampedEnd.toISOString();
            } else {
              convertedOp.end = finalEnd.toISOString();
            }
          } else {
            convertedOp.end = finalEnd.toISOString();
          }
        }
      } else if (op.end) {
        const endDate = parseIsoDate(convertToFutureIsoTimestamp(op.end, now));
        const adjustedEnd = adjustToWorkingHours(endDate, workingWindow, timezone);
        convertedOp.end = adjustedEnd.toISOString();
      }
    }
    
    converted.push(convertedOp);
  }
  
  if (skipped.length > 0) {
    console.warn(`[Reschedule] Skipped ${skipped.length} invalid operation(s):`, skipped.map(op => ({ op: op.op, blockId: op.blockId })));
  }
  
  console.log(`[Reschedule] Successfully converted ${converted.length} operation(s) out of ${operations.length} total`);
  
  return converted;
}

const router = Router();

// Build context string for AI
async function buildContext(userId: string): Promise<string> {
  // Fetch settings first to get selectedCalendars
  const settingsDoc = await firestore.collection('settings').doc(userId).get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;

  const selectedCalendars = settings?.selectedCalendars || null;

  // Fetch a wider date range (2 weeks before and 3 weeks after) to handle reschedule requests
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 14); // 2 weeks ago
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setDate(end.getDate() + 21); // 3 weeks from now
  end.setHours(23, 59, 59, 999);

  // Fetch calendar events with selectedCalendars filter
  const events = await listEvents(userId, start, end, selectedCalendars);

  // Fetch focus blocks for the same range
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const focusSnapshot = await firestore.collection('focusBlocks')
    .where('userId', '==', userId)
    .where('start', '>=', startIso)
    .where('end', '<=', endIso)
    .get();
  const focusBlocks = focusSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as any[];

  const goalsSnapshot = await firestore.collection('goals')
    .where('userId', '==', userId)
    .get();
  const goalsById = new Map(goalsSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data()]));

  // Fetch goals
  const goals = goalsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as any[];

  // Build context string
  let context = `Current date/time: ${new Date().toISOString()}\n\n`;
  
  context += `=== GOALS ===\n`;
  for (const goal of goals) {
    context += `- ${goal.name}: ${goal.targetMinutesPerWeek / 60}h/week (ID: ${goal.id})\n`;
  }
  
  context += `\n=== SETTINGS ===\n`;
  if (settings) {
    context += `Block length: ${settings.blockLengthMinutes} minutes\n`;
    context += `Timezone: ${settings.timezone}\n`;
    context += `Working window: ${JSON.stringify(settings.workingWindow)}\n`;
    context += `\nCRITICAL: WORKING WINDOW RULES - YOU MUST FOLLOW THESE EXACTLY:\n`;
    
    // Parse and display working window in a more readable format
    const workingWindow = settings.workingWindow as Record<string, { enabled: boolean; start: string; end: string }> | null;
    if (workingWindow) {
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const dayName of dayNames) {
        const dayConfig = workingWindow[dayName];
        if (dayConfig) {
          if (dayConfig.enabled) {
            // Convert 24-hour format to readable format
            const [startHour, startMin] = dayConfig.start.split(':').map(Number);
            const [endHour, endMin] = dayConfig.end.split(':').map(Number);
            const start12 = startHour > 12 ? `${startHour - 12}:${startMin.toString().padStart(2, '0')} PM` : `${startHour}:${startMin.toString().padStart(2, '0')} AM`;
            const end12 = endHour > 12 ? `${endHour - 12}:${endMin.toString().padStart(2, '0')} PM` : `${endHour}:${endMin.toString().padStart(2, '0')} AM`;
            context += `- ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}: ENABLED from ${dayConfig.start} (${start12}) to ${dayConfig.end} (${end12})\n`;
            context += `  → Valid ISO timestamps for ${dayName}: Hours must be between ${startHour}:${startMin.toString().padStart(2, '0')} and ${endHour}:${endMin.toString().padStart(2, '0')}\n`;
            context += `  → Example valid time: "2026-02-01T${startHour.toString().padStart(2, '0')}:00:00.000Z" (start) or "2026-02-01T${Math.floor((startHour + endHour) / 2).toString().padStart(2, '0')}:00:00.000Z" (middle)\n`;
          } else {
            context += `- ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}: DISABLED (can schedule but will trigger confirm_outside_hours)\n`;
          }
        }
      }
    }
    
    context += `\nVALIDATION CHECKLIST before outputting any timestamp:\n`;
    context += `1. Identify which day of the week the timestamp falls on\n`;
    context += `2. Look up that day in the working window above\n`;
    context += `3. Extract the hour and minute from your ISO timestamp (format: YYYY-MM-DDTHH:MM:SS.sssZ)\n`;
    context += `4. If the day is enabled, verify: hour >= start hour AND hour <= end hour\n`;
    context += `5. If hour equals start hour, verify: minute >= start minute\n`;
    context += `6. If hour equals end hour, verify: minute <= end minute\n`;
    context += `7. If any check fails, adjust the time to be within the working window\n`;
    context += `\nEXAMPLE: If scheduling to Saturday and Saturday is enabled 09:00-17:00:\n`;
    context += `- "2026-02-01T14:00:00.000Z" is VALID (2 PM, within 9 AM - 5 PM)\n`;
    context += `- "2026-02-01T18:00:00.000Z" is INVALID (6 PM, after 5 PM) → Use "2026-02-01T17:00:00.000Z" instead\n`;
    context += `- "2026-02-01T08:00:00.000Z" is INVALID (8 AM, before 9 AM) → Use "2026-02-01T09:00:00.000Z" instead\n`;
  }
  
  context += `\n=== FOCUS BLOCKS (${start.toLocaleDateString()} to ${end.toLocaleDateString()}) ===\n`;
  context += `Total focus blocks available: ${focusBlocks.length}\n`;
  
  // Identify recently moved blocks (within last 24 hours) with their original positions
  const recentlyMovedBlocks: Array<{ block: any; originalStart: string; originalEnd: string; lastMovedAt: string }> = [];
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  for (const block of focusBlocks) {
    if (block.status === 'moved' && block.originalStart && block.originalEnd && block.lastMovedAt) {
      const movedAt = new Date(block.lastMovedAt);
      if (movedAt >= oneDayAgo) {
        recentlyMovedBlocks.push({
          block,
          originalStart: block.originalStart,
          originalEnd: block.originalEnd,
          lastMovedAt: block.lastMovedAt,
        });
      }
    }
  }
  
  // Sort by most recently moved first
  recentlyMovedBlocks.sort((a, b) => new Date(b.lastMovedAt).getTime() - new Date(a.lastMovedAt).getTime());
  
  if (recentlyMovedBlocks.length > 0) {
    context += `\n⚠️ RECENTLY MOVED BLOCKS (can be moved back to original position):\n`;
    for (let i = 0; i < recentlyMovedBlocks.length; i++) {
      const { block, originalStart, originalEnd, lastMovedAt } = recentlyMovedBlocks[i];
      const goal = goalsById.get(block.goalId) as any;
      const goalName = goal?.name || 'Unknown';
      const movedAtDate = new Date(lastMovedAt);
      const hoursAgo = Math.round((now.getTime() - movedAtDate.getTime()) / (60 * 60 * 1000) * 10) / 10;
      context += `${i === 0 ? '⭐ MOST RECENT: ' : ''}[${block.id}] ${goalName}: Currently at ${block.start} to ${block.end}, originally at ${originalStart} to ${originalEnd} (moved ${hoursAgo}h ago)\n`;
    }
    context += `\nIMPORTANT: When the user says "move back", "move it back", "undo", "revert", or similar phrases, they are referring to the MOST RECENTLY MOVED block (marked with ⭐). Use the originalStart and originalEnd times from that block.\n`;
  }
  
  let blockIndex = 1;
  for (const block of focusBlocks) {
    const goal = goalsById.get(block.goalId) as any;
    const goalName = goal?.name || 'Unknown';
    const isRecentlyMoved = recentlyMovedBlocks.some(rmb => rmb.block.id === block.id);
    const movedMarker = isRecentlyMoved ? ' (recently moved)' : '';
    context += `${blockIndex}. [${block.id}] ${goalName}: ${block.start} to ${block.end} (status: ${block.status})${movedMarker}\n`;
    blockIndex++;
  }
  context += `\nCRITICAL INSTRUCTION: When the user asks to reschedule blocks (especially with numbers like "3 blocks", "all blocks", "my blocks", or plural language), you MUST:\n`;
  context += `1. COUNT how many blocks match the user's request\n`;
  context += `2. Include a move operation for EVERY SINGLE matching block - no exceptions\n`;
  context += `3. If the user says "move 3 blocks", you must return exactly 3 move operations\n`;
  context += `4. If the user says "move all my CS340 blocks" and there are 3 CS340 blocks listed, you must return exactly 3 move operations\n`;
  context += `5. NEVER skip blocks or return fewer operations than requested - this is a critical error\n`;

  context += `\n=== OTHER CALENDAR EVENTS (${start.toLocaleDateString()} to ${end.toLocaleDateString()}) ===\n`;
  const nonFocusEvents = events.filter(e => !e.isEliteBall);
  for (const event of nonFocusEvents) {
    context += `- ${event.title}: ${event.start} to ${event.end}\n`;
  }

  return context;
}

// Process reschedule request
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build context
    const rawContext = await buildContext(req.userId!);
    
    // Compress context via Bear1
    const { compressed, originalLength, compressedLength } = await compressContext(rawContext);
    
    console.log(`[Reschedule] Context: ${originalLength} chars -> ${compressedLength} chars`);

    // Call Gemini
    const result = await generateReschedule(message, compressed);

    // Log how many operations were returned
    const moveOpsCount = result.operations?.filter((op: RescheduleOperation) => op.op === 'move').length || 0;
    console.log(`[Reschedule] Gemini returned ${result.operations?.length || 0} total operations (${moveOpsCount} move operations)`);
    
    // Check if user mentioned a specific number of blocks
    const numberMatch = message.match(/\b(\d+)\s+blocks?\b/i);
    if (numberMatch) {
      const requestedCount = parseInt(numberMatch[1]);
      if (moveOpsCount < requestedCount) {
        console.warn(`[Reschedule] WARNING: User requested ${requestedCount} blocks but only ${moveOpsCount} move operations returned`);
        // Don't fail, but log the warning - Gemini might have filtered some out
      }
    }

    // Apply working hours validation to proposed changes so user sees correct times
    let validatedOperations = result.operations || [];
    if (validatedOperations.length > 0) {
      try {
        // Fetch settings for final verification
        const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
        const settings = settingsDoc.exists ? settingsDoc.data() : null;
        
        // Log original times before validation
        console.log(`[Reschedule] 📥 Original operations from Gemini:`, 
          validatedOperations.map((op: RescheduleOperation) => ({
            op: op.op,
            blockId: op.blockId,
            to: op.to,
            start: op.start,
            end: op.end
          }))
        );
        
        validatedOperations = await convertOperations(validatedOperations, req.userId!);
        
        // Log validated times after adjustment
        console.log(`[Reschedule] Validated operations after working hours adjustment:`, 
          validatedOperations.map((op: RescheduleOperation) => ({
            op: op.op,
            blockId: op.blockId,
            to: op.to,
            start: op.start,
            end: op.end
          }))
        );
        
        console.log(`[Reschedule] ✅ Applied working hours validation to ${validatedOperations.length} proposed operations`);
        
        // Final verification - check for overlaps within the batch and fix them
        // This handles cases where multiple operations might have been clamped to the same time
        const timezone = settings?.timezone as string | undefined;
        const workingWindow = settings?.workingWindow as Record<string, { enabled: boolean; start: string; end: string }> | null;
        const blockLengthMinutes = (settings?.blockLengthMinutes as number) || 30;
        const minGapMinutes = (settings?.minGapMinutes as number) || 5;
        
        // Fetch block durations for overlap detection
        const moveOps = validatedOperations.filter(op => op.op === 'move' && op.blockId);
        const blockIds = moveOps.map(op => op.blockId!).filter(Boolean);
        const blockDurationsMap = new Map<string, number>();
        
        if (blockIds.length > 0) {
          // Use getAll() to fetch documents directly by ID - more efficient and doesn't require composite index
          // Firestore getAll() has a limit, so batch if needed
          const batchSize = 10;
          for (let i = 0; i < blockIds.length; i += batchSize) {
            const batch = blockIds.slice(i, i + batchSize);
            const docRefs = batch.map(id => firestore.collection('focusBlocks').doc(id));
            
            try {
              const docs = await firestore.getAll(...docRefs);
              
              for (const doc of docs) {
                // Verify the block belongs to this user (security check)
                const block = doc.data();
                if (block && block.userId === req.userId!) {
                  if (block.start && block.end) {
                    const duration = new Date(block.end).getTime() - new Date(block.start).getTime();
                    blockDurationsMap.set(doc.id, duration);
                  } else {
                    blockDurationsMap.set(doc.id, blockLengthMinutes * 60 * 1000);
                  }
                }
              }
            } catch (error) {
              console.warn(`[Reschedule] Failed to fetch block batch:`, error);
              // Continue with other batches
            }
          }
        }
        
        // Track scheduled times per day to detect overlaps
        const daySlots = new Map<string, Array<{ start: number; end: number; opIndex: number }>>();
        const userTimezone = timezone || 'America/New_York';
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        // First pass: collect all scheduled times
        for (let i = 0; i < validatedOperations.length; i++) {
          const op = validatedOperations[i];
          if (op.op === 'move' && op.to) {
            const toDate = new Date(op.to);
            const parts = formatter.formatToParts(toDate);
            const year = parseInt(parts.find(p => p.type === 'year')!.value);
            const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
            const day = parseInt(parts.find(p => p.type === 'day')!.value);
            const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
            const min = parseInt(parts.find(p => p.type === 'minute')!.value);
            const startMinutes = hour * 60 + min;
            const duration = op.blockId ? (blockDurationsMap.get(op.blockId) || blockLengthMinutes * 60 * 1000) : blockLengthMinutes * 60 * 1000;
            const durationMinutes = Math.ceil(duration / (60 * 1000));
            const endMinutes = startMinutes + durationMinutes;
            
            const slots = daySlots.get(dayKey) || [];
            slots.push({ start: startMinutes, end: endMinutes, opIndex: i });
            daySlots.set(dayKey, slots);
          }
        }
        
        // Second pass: fix overlaps by adjusting times sequentially
        for (const [dayKey, slots] of daySlots.entries()) {
          // Sort by start time
          slots.sort((a, b) => a.start - b.start);
          
          // Check for overlaps and adjust
          for (let i = 1; i < slots.length; i++) {
            const prevSlot = slots[i - 1];
            const currentSlot = slots[i];
            
            // Check if current overlaps with previous
            if (currentSlot.start < prevSlot.end + minGapMinutes) {
              // Overlap detected - move current slot after previous
              const newStartMinutes = prevSlot.end + minGapMinutes;
              const op = validatedOperations[currentSlot.opIndex];
              
              if (op.op === 'move' && op.to) {
                const toDate = new Date(op.to);
                const parts = formatter.formatToParts(toDate);
                const year = parseInt(parts.find(p => p.type === 'year')!.value);
                const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
                const day = parseInt(parts.find(p => p.type === 'day')!.value);
                
                // Check if new time fits within working hours
                const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const dayName = dayNames[toDate.getDay()];
                const dayConfig = workingWindow?.[dayName];
                
                if (dayConfig && dayConfig.enabled) {
                  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
                  const [endHour, endMin] = dayConfig.end.split(':').map(Number);
                  const startMinutes = startHour * 60 + startMin;
                  const endMinutes = endHour * 60 + endMin;
                  
                  const duration = op.blockId ? (blockDurationsMap.get(op.blockId) || blockLengthMinutes * 60 * 1000) : blockLengthMinutes * 60 * 1000;
                  const durationMinutes = Math.ceil(duration / (60 * 1000));
                  
                  if (newStartMinutes + durationMinutes <= endMinutes) {
                    // New time fits - update it
                    const newDate = createDateInTimezone(year, month, day, Math.floor(newStartMinutes / 60), newStartMinutes % 60, userTimezone);
                    op.to = newDate.toISOString();
                    currentSlot.start = newStartMinutes;
                    currentSlot.end = newStartMinutes + durationMinutes;
                    console.log(`[Reschedule] 🔄 Fixed overlap: Block ${op.blockId} moved to ${newDate.toISOString()} to avoid conflict`);
                  } else {
                    console.warn(`[Reschedule] ⚠️ Cannot fix overlap for block ${op.blockId} - would exceed working hours`);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Reschedule] Error validating proposed operations:`, error);
        // Continue with original operations if validation fails
      }
    }

    // Update user_message to reflect actual validated times
    let updatedUserMessage = result.user_message;
    if (validatedOperations.length > 0 && result.intent !== 'confirm_outside_hours') {
      const moveOps = validatedOperations.filter(op => op.op === 'move' && op.to);
      if (moveOps.length > 0) {
        // Fetch settings for timezone
        const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
        const settings = settingsDoc.exists ? settingsDoc.data() : null;
        const userTimezone = (settings?.timezone as string) || 'America/New_York';
        
        // Group operations by target day
        const opsByDay = new Map<string, Array<{ time: Date; blockId: string }>>();
        for (const op of moveOps) {
          if (op.to) {
            const toDate = new Date(op.to);
            // Format day key: "Friday, February 6th"
            const dayKey = toDate.toLocaleDateString('en-US', { 
              timeZone: userTimezone,
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            });
            
            if (!opsByDay.has(dayKey)) {
              opsByDay.set(dayKey, []);
            }
            opsByDay.get(dayKey)!.push({ time: toDate, blockId: op.blockId || '' });
          }
        }
        
        // Generate message with actual times
        const timeDescriptions: string[] = [];
        for (const [dayKey, ops] of opsByDay.entries()) {
          // Sort by time
          ops.sort((a, b) => a.time.getTime() - b.time.getTime());
          
          const times = ops.map(op => {
            const timeStr = op.time.toLocaleTimeString('en-US', {
              timeZone: userTimezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
            return timeStr;
          });
          
          if (ops.length === 1) {
            timeDescriptions.push(`${dayKey} at ${times[0]}`);
          } else if (ops.length === 2) {
            timeDescriptions.push(`${dayKey} at ${times[0]} and ${times[1]}`);
          } else {
            // For 3+ blocks: "at 9:00 AM, 9:30 AM, and 10:00 AM"
            const lastTime = times.pop();
            timeDescriptions.push(`${dayKey} at ${times.join(', ')}, and ${lastTime}`);
          }
        }
        
        if (timeDescriptions.length > 0) {
          const blockCount = moveOps.length;
          const blockWord = blockCount === 1 ? 'block' : 'blocks';
          const hasHave = blockCount === 1 ? 'has' : 'have';
          
          if (opsByDay.size === 1) {
            // All blocks on same day
            const dayKey = Array.from(opsByDay.keys())[0];
            const ops = opsByDay.get(dayKey)!;
            ops.sort((a, b) => a.time.getTime() - b.time.getTime());
            const times = ops.map(op => {
              return op.time.toLocaleTimeString('en-US', {
                timeZone: userTimezone,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
            });
            
            if (times.length === 1) {
              updatedUserMessage = `Your ${blockCount} focus ${blockWord} ${hasHave} been moved to ${dayKey} at ${times[0]}.`;
            } else if (times.length === 2) {
              updatedUserMessage = `Your ${blockCount} focus ${blockWord} ${hasHave} been moved to ${dayKey} at ${times[0]} and ${times[1]}.`;
            } else {
              const lastTime = times.pop();
              updatedUserMessage = `Your ${blockCount} focus ${blockWord} ${hasHave} been moved to ${dayKey} at ${times.join(', ')}, and ${lastTime}.`;
            }
          } else {
            // Blocks on multiple days
            updatedUserMessage = `Your ${blockCount} focus ${blockWord} ${hasHave} been moved to ${timeDescriptions.join(', ')}.`;
          }
        }
      }
    }

    res.json({
      ...result,
      operations: validatedOperations, // Return validated operations with working hours applied
      user_message: updatedUserMessage, // Return updated message with actual times
      rawContextChars: originalLength,
      compressedChars: compressedLength,
    });
  } catch (err: any) {
    console.error('Error processing reschedule:', err);
    res.status(500).json({ error: err.message || 'Failed to process reschedule request' });
  }
});

// Apply reschedule operations
router.post('/apply', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { operations, reason } = req.body as { operations: RescheduleOperation[]; reason: string };

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({ error: 'Operations array is required' });
    }

    // Convert operations to ensure all dates are valid ISO timestamps in the future and within working hours
    const convertedOperations = await convertOperations(operations, req.userId!);

    let blocksMovedCount = 0;
    let minutesRecovered = 0;

    for (const op of convertedOperations) {
      switch (op.op) {
        case 'move':
          if (op.blockId && op.to) {
            // Find the focus block
            const blockRef = firestore.collection('focusBlocks').doc(op.blockId);
            const blockSnap = await blockRef.get();
            const block = blockSnap.exists ? blockSnap.data() : null;

            if (block && block.userId === req.userId! && block.calendarEventId) {
              // Parse source/destination
              const toDate = parseIsoDate(op.to);
              // Calculate duration from original block
              const duration = new Date(block.end).getTime() - new Date(block.start).getTime();
              let newStart = toDate;
              let newEnd = new Date(toDate.getTime() + duration);

              // Validate the new date is in the future
              const now = new Date();
              if (newStart <= now) {
                throw new Error(`Cannot move block to past date: ${op.to}`);
              }

              // Ensure both start and end times are within working hours
              const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
              const settings = settingsDoc.exists ? settingsDoc.data() : null;
              const workingWindow = settings?.workingWindow as Record<string, { enabled: boolean; start: string; end: string }> | null;
              const timezone = settings?.timezone as string | undefined;
              
              newStart = adjustToWorkingHours(newStart, workingWindow, timezone);
              newEnd = adjustToWorkingHours(newEnd, workingWindow, timezone);
              
              // If end time was clamped back, ensure start time is adjusted so block fits
              if (newEnd <= newStart) {
                // Block duration would exceed working hours - adjust start time earlier
                const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const dayName = dayNames[newStart.getDay()];
                const dayConfig = workingWindow?.[dayName];
                if (dayConfig && dayConfig.enabled) {
                  const [endHour, endMin] = dayConfig.end.split(':').map(Number);
                  const clampedEnd = new Date(newStart);
                  clampedEnd.setHours(endHour, endMin, 0, 0);
                  // Adjust start time so block fits before end
                  newStart = new Date(clampedEnd.getTime() - duration);
                  // Ensure start is still within working hours  
                  newStart = adjustToWorkingHours(newStart, workingWindow, timezone);
                  newEnd = clampedEnd;
                }
              }

              // Update calendar event using stored calendarId (or primary as fallback)
              const calendarId = block.calendarId || 'primary';
              await updateEvent(req.userId!, block.calendarEventId, {
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
              }, calendarId);

              // Store original position if not already stored (for "move back" functionality)
              const originalStart = block.originalStart || block.start;
              const originalEnd = block.originalEnd || block.end;
              
              // Check if moving back to original position
              const isMovingBack = newStart.toISOString() === originalStart && newEnd.toISOString() === originalEnd;
              
              // Update database
              const updateData: any = {
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
                status: 'moved',
                lastMovedAt: new Date().toISOString(), // Track when it was moved
              };
              
              if (isMovingBack) {
                // Clear original position fields since it's back to original
                updateData.originalStart = null;
                updateData.originalEnd = null;
              } else {
                // Store original position (only if not already stored)
                if (!block.originalStart) {
                  updateData.originalStart = originalStart;
                  updateData.originalEnd = originalEnd;
                } else {
                  // Keep existing original position
                  updateData.originalStart = block.originalStart;
                  updateData.originalEnd = block.originalEnd;
                }
              }
              
              await blockRef.set(updateData, { merge: true });
              

              blocksMovedCount++;
              minutesRecovered += duration / 60000;
            }
          }
          break;

        case 'create':
          if (op.goalName && op.start && op.end) {
            // Validate dates are in the future
            const startDate = parseIsoDate(op.start);
            const endDate = parseIsoDate(op.end);
            const now = new Date();
            
            if (startDate <= now || endDate <= now) {
              throw new Error(`Cannot create block in the past: start=${op.start}, end=${op.end}`);
            }
            
            if (endDate <= startDate) {
              throw new Error(`End date must be after start date: start=${op.start}, end=${op.end}`);
            }

            // Find the goal
            const goalSnapshot = await firestore.collection('goals')
              .where('userId', '==', req.userId!)
              .where('name', '==', op.goalName)
              .get();
            const goalDoc = goalSnapshot.docs[0];
            const goal = goalDoc ? ({ id: goalDoc.id, ...goalDoc.data() } as any) : null;

            if (goal) {
              // Get settings to retrieve EBK calendar info
              const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
              const settings = settingsDoc.exists ? settingsDoc.data() : null;
              const ebkCalendarName = settings?.ebkCalendarName || 'EliteBall Focus Blocks';
              const existingCalendarId = settings?.ebkCalendarId || null;

              // Get or create the EBK calendar
              const { id: calendarId, created } = await getOrCreateEbkCalendar(
                req.userId!,
                ebkCalendarName,
                existingCalendarId
              );

              // Save the calendar ID to settings if newly created
              if (created) {
                await firestore.collection('settings').doc(req.userId!).set({
                  ebkCalendarId: calendarId,
                }, { merge: true });
              }

              // Create calendar event in the EBK calendar
              const calendarEvent = await createEvent(req.userId!, {
                title: `Focus Block: ${op.goalName}`,
                description: `eliteball=true\ngoalId=${goal.id}\nblockId=pending`,
                start: startDate.toISOString(),
                end: endDate.toISOString(),
              }, calendarId);

              // Create focus block in database with calendarId
              await firestore.collection('focusBlocks').add({
                userId: req.userId!,
                goalId: goal.id,
                start: op.start,
                end: op.end,
                calendarEventId: calendarEvent.id,
                calendarId,
                status: 'scheduled',
                createdAt: new Date().toISOString(),
              });

              const duration = (new Date(op.end).getTime() - new Date(op.start).getTime()) / 60000;
              minutesRecovered += duration;
            }
          }
          break;

        case 'delete':
          if (op.blockId) {
            const blockRef = firestore.collection('focusBlocks').doc(op.blockId);
            const blockSnap = await blockRef.get();
            const block = blockSnap.exists ? blockSnap.data() : null;

            if (block && block.userId === req.userId! && block.calendarEventId) {
              // Delete calendar event using stored calendarId (or primary as fallback)
              const calendarId = block.calendarId || 'primary';
              await deleteEvent(req.userId!, block.calendarEventId, calendarId);

              // Update database (mark as skipped instead of deleting)
              await blockRef.set({ status: 'skipped' }, { merge: true });

              blocksMovedCount++;
            }
          }
          break;
      }
    }

    // Log the reschedule
    const rawContext = await buildContext(req.userId!);
    await firestore.collection('rescheduleLogs').add({
      userId: req.userId!,
      reason: reason || 'AI reschedule',
      blocksMovedCount,
      minutesRecovered: Math.round(minutesRecovered),
      rawContextChars: rawContext.length,
      compressedChars: rawContext.length,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      applied: convertedOperations.length,
      blocksMovedCount,
      minutesRecovered: Math.round(minutesRecovered),
    });
  } catch (err: any) {
    console.error('Error applying reschedule:', err);
    res.status(500).json({ error: err.message || 'Failed to apply reschedule' });
  }
});

export default router;
