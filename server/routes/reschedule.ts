import { Router, Response } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { compressContext } from '../lib/bear1';
import { generateReschedule, RescheduleOperation } from '../lib/gemini';
import { listEvents, getWeekRange, updateEvent, deleteEvent, createEvent } from '../lib/google-calendar';

const router = Router();

// Build context string for AI
async function buildContext(userId: string): Promise<string> {
  const { start, end } = getWeekRange();
  
  // Fetch calendar events
  const events = await listEvents(userId, start, end);
  
  // Fetch focus blocks
  const focusBlocks = await prisma.focusBlock.findMany({
    where: {
      userId,
      start: { gte: start },
      end: { lte: end },
    },
    include: { goal: true },
  });

  // Fetch settings
  const settings = await prisma.settings.findUnique({
    where: { userId },
  });

  // Fetch goals
  const goals = await prisma.goal.findMany({
    where: { userId },
  });

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
    context += `Working window: ${settings.workingWindow}\n`;
  }
  
  context += `\n=== FOCUS BLOCKS (this week) ===\n`;
  for (const block of focusBlocks) {
    context += `- [${block.id}] ${block.goal.name}: ${block.start.toISOString()} to ${block.end.toISOString()} (status: ${block.status})\n`;
  }
  
  context += `\n=== OTHER CALENDAR EVENTS (this week) ===\n`;
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
            const block = await prisma.focusBlock.findFirst({
              where: { id: op.blockId, userId: req.userId! },
            });
            
            if (block && block.calendarEventId) {
              // Calculate duration
              const duration = block.end.getTime() - block.start.getTime();
              const newStart = new Date(op.to);
              const newEnd = new Date(newStart.getTime() + duration);
              
              // Update calendar event
              await updateEvent(req.userId!, block.calendarEventId, {
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
              });
              
              // Update database
              await prisma.focusBlock.update({
                where: { id: op.blockId },
                data: {
                  start: newStart,
                  end: newEnd,
                  status: 'moved',
                },
              });
              
              blocksMovedCount++;
              minutesRecovered += duration / 60000;
            }
          }
          break;

        case 'create':
          if (op.goalName && op.start && op.end) {
            // Find the goal
            const goal = await prisma.goal.findFirst({
              where: { userId: req.userId!, name: op.goalName },
            });
            
            if (goal) {
              // Create calendar event
              const calendarEvent = await createEvent(req.userId!, {
                title: `Focus Block: ${op.goalName}`,
                description: `eliteball=true\ngoalId=${goal.id}\nblockId=pending`,
                start: op.start,
                end: op.end,
              });
              
              // Create focus block in database
              await prisma.focusBlock.create({
                data: {
                  userId: req.userId!,
                  goalId: goal.id,
                  start: new Date(op.start),
                  end: new Date(op.end),
                  calendarEventId: calendarEvent.id,
                  status: 'scheduled',
                },
              });
              
              const duration = (new Date(op.end).getTime() - new Date(op.start).getTime()) / 60000;
              minutesRecovered += duration;
            }
          }
          break;

        case 'delete':
          if (op.blockId) {
            const block = await prisma.focusBlock.findFirst({
              where: { id: op.blockId, userId: req.userId! },
            });
            
            if (block && block.calendarEventId) {
              // Delete calendar event
              await deleteEvent(req.userId!, block.calendarEventId);
              
              // Update database (mark as skipped instead of deleting)
              await prisma.focusBlock.update({
                where: { id: op.blockId },
                data: { status: 'skipped' },
              });
              
              blocksMovedCount++;
            }
          }
          break;
      }
    }

    // Log the reschedule
    const rawContext = await buildContext(req.userId!);
    await prisma.rescheduleLog.create({
      data: {
        userId: req.userId!,
        reason: reason || 'AI reschedule',
        blocksMovedCount,
        minutesRecovered: Math.round(minutesRecovered),
        rawContextChars: rawContext.length,
        compressedChars: rawContext.length, // Will be updated if Bear1 was used
      },
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
