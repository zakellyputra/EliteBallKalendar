import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { compressContext } from '../lib/bear1';
import { generateReschedule, RescheduleOperation } from '../lib/gemini';
import { listEvents, getWeekRange, updateEvent, deleteEvent, createEvent, getOrCreateEbkCalendar } from '../lib/google-calendar';
import { firestore } from '../lib/firebase-admin';

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
  }
  
  context += `\n=== FOCUS BLOCKS (${start.toLocaleDateString()} to ${end.toLocaleDateString()}) ===\n`;
  for (const block of focusBlocks) {
    const goal = goalsById.get(block.goalId) as any;
    const goalName = goal?.name || 'Unknown';
    context += `- [${block.id}] ${goalName}: ${block.start} to ${block.end} (status: ${block.status})\n`;
  }

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

    res.json({
      ...result,
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

    let blocksMovedCount = 0;
    let minutesRecovered = 0;

    for (const op of operations) {
      switch (op.op) {
        case 'move':
          if (op.blockId && op.to) {
            // Find the focus block
            const blockRef = firestore.collection('focusBlocks').doc(op.blockId);
            const blockSnap = await blockRef.get();
            const block = blockSnap.exists ? blockSnap.data() : null;

            if (block && block.userId === req.userId! && block.calendarEventId) {
              // Calculate duration
              const duration = new Date(block.end).getTime() - new Date(block.start).getTime();
              const newStart = new Date(op.to);
              const newEnd = new Date(newStart.getTime() + duration);

              // Update calendar event using stored calendarId (or primary as fallback)
              const calendarId = block.calendarId || 'primary';
              await updateEvent(req.userId!, block.calendarEventId, {
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
              }, calendarId);

              // Update database
              await blockRef.set({
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
                status: 'moved',
              }, { merge: true });

              blocksMovedCount++;
              minutesRecovered += duration / 60000;
            }
          }
          break;

        case 'create':
          if (op.goalName && op.start && op.end) {
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
                start: op.start,
                end: op.end,
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
      applied: operations.length,
      blocksMovedCount,
      minutesRecovered: Math.round(minutesRecovered),
    });
  } catch (err: any) {
    console.error('Error applying reschedule:', err);
    res.status(500).json({ error: err.message || 'Failed to apply reschedule' });
  }
});

export default router;
