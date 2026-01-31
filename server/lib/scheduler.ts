import { CalendarEvent, listEvents, createEvent, getWeekRange } from './google-calendar';
import { prisma } from '../index';

export interface ProposedBlock {
  goalId: string;
  goalName: string;
  start: string; // ISO string
  end: string; // ISO string
  duration: number; // minutes
}

export interface ScheduleResult {
  proposedBlocks: ProposedBlock[];
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
  workingWindow: Record<string, WorkingWindowDay>
): TimeSlot | null {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[date.getDay()];
  const dayWindow = workingWindow[dayName];

  if (!dayWindow || !dayWindow.enabled) {
    return null;
  }

  const startMinutes = timeToMinutes(dayWindow.start);
  const endMinutes = timeToMinutes(dayWindow.end);

  const start = new Date(date);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  const end = new Date(date);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

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
export async function generateSchedule(userId: string): Promise<ScheduleResult> {
  // Fetch user's goals
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { targetMinutesPerWeek: 'desc' }, // Prioritize larger goals
  });

  if (goals.length === 0) {
    return { proposedBlocks: [] };
  }

  // Fetch user's settings
  const settings = await prisma.settings.findUnique({
    where: { userId },
  });

  if (!settings) {
    throw new Error('Settings not found. Please configure your working hours first.');
  }

  const workingWindow = JSON.parse(settings.workingWindow) as Record<string, WorkingWindowDay>;
  const blockLengthMinutes = settings.blockLengthMinutes;
  const minGapMinutes = settings.minGapMinutes;

  // Fetch calendar events for the week
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const calendarEvents = await listEvents(userId, weekStart, weekEnd);

  // Filter out existing focus blocks
  const busyEvents = calendarEvents.filter(e => !e.isEliteBall);
  const busyIntervals = eventsToBusyIntervals(busyEvents);

  // Collect all free slots for the week
  const allFreeSlots: TimeSlot[] = [];
  
  for (let day = new Date(weekStart); day < weekEnd; day.setDate(day.getDate() + 1)) {
    const dayWindow = getWorkingWindowForDay(day, workingWindow);
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

  // Calculate total available minutes
  const totalAvailableMinutes = allFreeSlots.reduce(
    (sum, slot) => sum + (slot.end.getTime() - slot.start.getTime()) / 60000,
    0
  );

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

  const result: ScheduleResult = { proposedBlocks };

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

  for (const block of blocks) {
    // Create calendar event
    const calendarEvent = await createEvent(userId, {
      title: `Focus Block: ${block.goalName}`,
      description: `eliteball=true\ngoalId=${block.goalId}\nblockId=pending`,
      start: block.start,
      end: block.end,
    });

    // Create FocusBlock in database
    const focusBlock = await prisma.focusBlock.create({
      data: {
        userId,
        goalId: block.goalId,
        start: new Date(block.start),
        end: new Date(block.end),
        calendarEventId: calendarEvent.id,
        status: 'scheduled',
      },
    });

    appliedBlocks.push({
      id: focusBlock.id,
      calendarEventId: calendarEvent.id,
      goalId: block.goalId,
      start: block.start,
      end: block.end,
    });
  }

  return appliedBlocks;
}
