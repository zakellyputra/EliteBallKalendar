import { CalendarEvent, listEvents, createEvent, getWeekRange, getOrCreateEbkCalendar } from './google-calendar';
import { firestore } from './firebase-admin';

// Get date components in a specific timezone
function getDateInTimezone(date: Date, timezone: string): { year: number; month: number; day: number; hours: number; minutes: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: get('year'),
    month: get('month') - 1,
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
    dayOfWeek: dayMap[weekdayStr] ?? 1,
  };
}

// Create a Date for a specific time in a timezone
function createDateInTimezone(year: number, month: number, day: number, hours: number, minutes: number, timezone: string): Date {
  // Create a date string and parse it with the timezone
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  // Use Intl to find the offset for this timezone at this time
  const testDate = new Date(dateStr + 'Z');

  // Binary search to find the correct UTC time that corresponds to our local time
  let low = testDate.getTime() - 14 * 60 * 60 * 1000; // UTC-14
  let high = testDate.getTime() + 14 * 60 * 60 * 1000; // UTC+14

  for (let i = 0; i < 20; i++) {
    const mid = Math.floor((low + high) / 2);
    const midDate = new Date(mid);
    const inTz = getDateInTimezone(midDate, timezone);

    if (inTz.hours === hours && inTz.minutes === minutes && inTz.day === day) {
      return midDate;
    }

    // Compare as minutes since midnight
    const targetMinutes = hours * 60 + minutes;
    const midMinutes = inTz.hours * 60 + inTz.minutes;
    const dayDiff = inTz.day - day;

    if (dayDiff > 0 || (dayDiff === 0 && midMinutes > targetMinutes)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return new Date(Math.floor((low + high) / 2));
}

export interface ProposedBlock {
  goalId: string;
  goalName: string;
  start: string; // ISO string
  end: string; // ISO string
  duration: number; // minutes
}

export interface ScheduleResult {
  proposedBlocks: ProposedBlock[];
  availableMinutes: number; // Total free time in working window
  requestedMinutes: number; // Total time requested by goals
  insufficientTime?: {
    requested: number;
    available: number;
    unscheduledGoals: { goalId: string; name: string; remainingMinutes: number }[];
  };
}

interface TimeSlot {
  start: Date;
  end: Date;
}

interface WorkingWindowDay {
  enabled: boolean;
  start: string; // HH:mm
  end: string;
}

// Convert HH:mm string to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Get working window for a specific day
function getWorkingWindowForDay(
  date: Date,
  workingWindow: Record<string, WorkingWindowDay>,
  timezone: string
): TimeSlot | null {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Get the day of week in the user's timezone
  const dateInTz = getDateInTimezone(date, timezone);
  const dayName = dayNames[dateInTz.dayOfWeek];
  const dayWindow = workingWindow[dayName];

  if (!dayWindow || !dayWindow.enabled) {
    return null;
  }

  const startMinutes = timeToMinutes(dayWindow.start);
  const endMinutes = timeToMinutes(dayWindow.end);

  // Create start/end times in the user's timezone
  const start = createDateInTimezone(
    dateInTz.year, dateInTz.month, dateInTz.day,
    Math.floor(startMinutes / 60), startMinutes % 60,
    timezone
  );

  const end = createDateInTimezone(
    dateInTz.year, dateInTz.month, dateInTz.day,
    Math.floor(endMinutes / 60), endMinutes % 60,
    timezone
  );

  return { start, end };
}

// Convert calendar events to busy intervals
function eventsToBusyIntervals(events: CalendarEvent[]): TimeSlot[] {
  return events.map(event => ({
    start: new Date(event.start),
    end: new Date(event.end),
  })).sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Compute free slots within a time range, excluding busy intervals
function computeFreeSlots(
  rangeStart: Date,
  rangeEnd: Date,
  busyIntervals: TimeSlot[],
  minGapMinutes: number
): TimeSlot[] {
  const freeSlots: TimeSlot[] = [];
  let current = new Date(rangeStart);

  // Sort busy intervals by start time
  const sortedBusy = busyIntervals
    .filter(b => b.end > rangeStart && b.start < rangeEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const busy of sortedBusy) {
    // If there's a gap before this busy period
    if (current < busy.start) {
      const gapEnd = new Date(busy.start.getTime() - minGapMinutes * 60 * 1000);
      if (gapEnd > current) {
        freeSlots.push({ start: new Date(current), end: gapEnd });
      }
    }
    // Move current to end of busy period plus gap
    const afterBusy = new Date(busy.end.getTime() + minGapMinutes * 60 * 1000);
    if (afterBusy > current) {
      current = afterBusy;
    }
  }

  // Add remaining time after last busy period
  if (current < rangeEnd) {
    freeSlots.push({ start: current, end: new Date(rangeEnd) });
  }

  return freeSlots;
}

// Main scheduling algorithm
export async function generateSchedule(
  userId: string,
  weekStart?: Date,
  weekEnd?: Date
): Promise<ScheduleResult> {
  // Fetch user's goals
  const goalsSnapshot = await firestore.collection('goals')
    .where('userId', '==', userId)
    .orderBy('targetMinutesPerWeek', 'desc')
    .get();
  const goals = goalsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as any[];

  if (goals.length === 0) {
    return { proposedBlocks: [], availableMinutes: 0, requestedMinutes: 0 };
  }

  // Fetch user's settings
  const settingsDoc = await firestore.collection('settings').doc(userId).get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;

  if (!settings) {
    throw new Error('Settings not found. Please configure your working hours first.');
  }

  const workingWindow = settings.workingWindow as Record<string, WorkingWindowDay>;
  const blockLengthMinutes = settings.blockLengthMinutes as number;
  const minGapMinutes = settings.minGapMinutes as number;
  const selectedCalendars = settings.selectedCalendars as string[] | null;
  const timezone = (settings.timezone as string) || 'America/New_York';

  // Fetch calendar events for the week (use provided dates or default to current week)
  const { start: defaultStart, end: defaultEnd } = getWeekRange();
  const actualWeekStart = weekStart || defaultStart;
  const actualWeekEnd = weekEnd || defaultEnd;
  const calendarEvents = await listEvents(userId, actualWeekStart, actualWeekEnd, selectedCalendars);

  // Include ALL events as busy (including existing focus blocks)
  // This ensures we don't double-book or overlap with existing focus blocks
  const busyIntervals = eventsToBusyIntervals(calendarEvents);

  // Collect all free slots for the week
  const allFreeSlots: TimeSlot[] = [];
  
  for (let day = new Date(actualWeekStart); day < actualWeekEnd; day.setDate(day.getDate() + 1)) {
    const dayWindow = getWorkingWindowForDay(day, workingWindow, timezone);
    if (dayWindow) {
      const dayFreeSlots = computeFreeSlots(
        dayWindow.start,
        dayWindow.end,
        busyIntervals,
        minGapMinutes
      );
      allFreeSlots.push(...dayFreeSlots);
    }
  }

  // Calculate total available minutes (only counting time that can actually fit blocks)
  // A slot must be at least blockLengthMinutes to be usable
  let totalAvailableMinutes = 0;
  for (const slot of allFreeSlots) {
    const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
    if (slotDuration >= blockLengthMinutes) {
      // Calculate how many blocks can fit (accounting for gaps between blocks)
      const blockWithGap = blockLengthMinutes + minGapMinutes;
      const numBlocks = Math.floor((slotDuration + minGapMinutes) / blockWithGap);
      totalAvailableMinutes += numBlocks * blockLengthMinutes;
    }
  }

  // Calculate total requested minutes
  const totalRequestedMinutes = goals.reduce((sum, g) => sum + g.targetMinutesPerWeek, 0);

  // Greedy allocation: place blocks for each goal
  const proposedBlocks: ProposedBlock[] = [];
  const unscheduledGoals: { goalId: string; name: string; remainingMinutes: number }[] = [];

  for (const goal of goals) {
    let remainingMinutes = goal.targetMinutesPerWeek;
    
    // Try to allocate blocks
    for (const slot of allFreeSlots) {
      if (remainingMinutes <= 0) break;

      const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
      if (slotDuration < blockLengthMinutes) continue;

      // How many blocks can fit in this slot?
      let slotStart = new Date(slot.start);
      
      while (remainingMinutes > 0) {
        const blockEnd = new Date(slotStart.getTime() + blockLengthMinutes * 60000);
        
        // Check if block fits in slot
        if (blockEnd > slot.end) break;

        // Check for overlap with already proposed blocks
        const hasOverlap = proposedBlocks.some(
          b => new Date(b.start) < blockEnd && new Date(b.end) > slotStart
        );
        
        if (hasOverlap) {
          slotStart = new Date(slotStart.getTime() + blockLengthMinutes * 60000 + minGapMinutes * 60000);
          continue;
        }

        proposedBlocks.push({
          goalId: goal.id,
          goalName: goal.name,
          start: slotStart.toISOString(),
          end: blockEnd.toISOString(),
          duration: blockLengthMinutes,
        });

        remainingMinutes -= blockLengthMinutes;
        slotStart = new Date(blockEnd.getTime() + minGapMinutes * 60000);
      }
    }

    if (remainingMinutes > 0) {
      unscheduledGoals.push({
        goalId: goal.id,
        name: goal.name,
        remainingMinutes,
      });
    }
  }

  // Sort blocks by start time
  proposedBlocks.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const result: ScheduleResult = { 
    proposedBlocks,
    availableMinutes: totalAvailableMinutes,
    requestedMinutes: totalRequestedMinutes,
  };

  if (unscheduledGoals.length > 0) {
    result.insufficientTime = {
      requested: totalRequestedMinutes,
      available: totalAvailableMinutes,
      unscheduledGoals,
    };
  }

  return result;
}

// Apply proposed blocks to Google Calendar and database
export async function applySchedule(
  userId: string,
  blocks: ProposedBlock[]
): Promise<{ id: string; calendarEventId: string; goalId: string; start: string; end: string }[]> {
  const appliedBlocks: { id: string; calendarEventId: string; goalId: string; start: string; end: string }[] = [];

  // Get settings to retrieve EBK calendar info
  const settingsRef = firestore.collection('settings').doc(userId);
  const settingsDoc = await settingsRef.get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;

  const ebkCalendarName = settings?.ebkCalendarName || 'EliteBall Focus Blocks';
  const existingCalendarId = settings?.ebkCalendarId || null;

  // Get or create the EBK calendar
  const { id: calendarId, created } = await getOrCreateEbkCalendar(
    userId,
    ebkCalendarName,
    existingCalendarId
  );

  // Save the calendar ID to settings if newly created or if it changed
  if (created || calendarId !== existingCalendarId) {
    await settingsRef.set({
      ebkCalendarId: calendarId,
    }, { merge: true });
  }

  for (const block of blocks) {
    // Create calendar event in the EBK calendar
    const calendarEvent = await createEvent(userId, {
      title: `Focus Block: ${block.goalName}`,
      description: `eliteball=true\ngoalId=${block.goalId}\nblockId=pending`,
      start: block.start,
      end: block.end,
    }, calendarId);

    // Create FocusBlock in database with calendarId
    const focusBlockRef = await firestore.collection('focusBlocks').add({
      userId,
      goalId: block.goalId,
      start: block.start,
      end: block.end,
      calendarEventId: calendarEvent.id,
      calendarId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    });

    appliedBlocks.push({
      id: focusBlockRef.id,
      calendarEventId: calendarEvent.id,
      goalId: block.goalId,
      start: block.start,
      end: block.end,
    });
  }

  return appliedBlocks;
}
