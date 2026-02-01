import { CalendarEvent, listEvents, createEvent, getWeekRange, getOrCreateEbkCalendar } from './google-calendar';
import { firestore } from './firebase-admin';
import { calculateSchedule, ProposedBlock, ScheduleResult } from './scheduler-logic';

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

  const selectedCalendars = settings.selectedCalendars as string[] | null;

  // Fetch calendar events for the week (use provided dates or default to current week)
  const { start: defaultStart, end: defaultEnd } = getWeekRange();
  const actualWeekStart = weekStart || defaultStart;
  const actualWeekEnd = weekEnd || defaultEnd;
  const calendarEvents = await listEvents(userId, actualWeekStart, actualWeekEnd, selectedCalendars);

  // Call pure logic
  return calculateSchedule(goals, settings, calendarEvents, actualWeekStart, actualWeekEnd);
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
    // Check for existing block with same time slot and goal (only active statuses)
    const existingBlocks = await firestore.collection('focusBlocks')
      .where('userId', '==', userId)
      .where('goalId', '==', block.goalId)
      .where('start', '==', block.start)
      .where('end', '==', block.end)
      .where('status', 'in', ['scheduled', 'moved'])
      .get();

    if (!existingBlocks.empty) {
      // Skip this block - already exists with active status
      console.log(`Skipping duplicate block for goal ${block.goalId} at ${block.start}`);
      continue;
    }

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
