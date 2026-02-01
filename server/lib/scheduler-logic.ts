
// Pure business logic for the scheduler
// No external dependencies on Firebase or Google APIs

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO string
  end: string; // ISO string
  isEliteBall?: boolean;
  goalId?: string;
  blockId?: string;
  calendarId?: string;
  calendarName?: string;
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
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const testDate = new Date(dateStr + 'Z');

  let low = testDate.getTime() - 14 * 60 * 60 * 1000;
  let high = testDate.getTime() + 14 * 60 * 60 * 1000;

  for (let i = 0; i < 20; i++) {
    const mid = Math.floor((low + high) / 2);
    const midDate = new Date(mid);
    const inTz = getDateInTimezone(midDate, timezone);

    if (inTz.hours === hours && inTz.minutes === minutes && inTz.day === day) {
      return midDate;
    }

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
  const dateInTz = getDateInTimezone(date, timezone);
  const dayName = dayNames[dateInTz.dayOfWeek];
  const dayWindow = workingWindow[dayName];

  if (!dayWindow || !dayWindow.enabled) {
    return null;
  }

  const startMinutes = timeToMinutes(dayWindow.start);
  const endMinutes = timeToMinutes(dayWindow.end);

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

  const sortedBusy = busyIntervals
    .filter(b => b.end > rangeStart && b.start < rangeEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const busy of sortedBusy) {
    if (current < busy.start) {
      const gapEnd = new Date(busy.start.getTime() - minGapMinutes * 60 * 1000);
      if (gapEnd > current) {
        freeSlots.push({ start: new Date(current), end: gapEnd });
      }
    }
    const afterBusy = new Date(busy.end.getTime() + minGapMinutes * 60 * 1000);
    if (afterBusy > current) {
      current = afterBusy;
    }
  }

  if (current < rangeEnd) {
    freeSlots.push({ start: current, end: new Date(rangeEnd) });
  }

  return freeSlots;
}

function getIdealDays(availableDays: string[], sessions: number): Set<string> {
  const ideal = new Set<string>();
  if (sessions <= 0 || availableDays.length === 0) return ideal;

  if (sessions >= availableDays.length) {
    availableDays.forEach(d => ideal.add(d));
    return ideal;
  }

  for (let i = 0; i < sessions; i++) {
    const index = Math.floor(i * availableDays.length / sessions);
    ideal.add(availableDays[index]);
  }
  return ideal;
}

function tryPlaceBlockOnDay(
  dayData: any,
  goal: { id: string; name: string; preferredTime?: { start: string; end: string } },
  proposedBlocks: ProposedBlock[],
  blockDurationMinutes: number,
  minGapMinutes: number,
  busyIntervals: TimeSlot[],
  timezone: string
): boolean {
  const validCandidates: { start: Date; score: number }[] = [];
  const stepMinutes = 15;

  const candidatesToScan: TimeSlot[] = [...dayData.slots];

  if (goal.preferredTime?.start && goal.preferredTime?.end) {
    const [pStartH, pStartM] = goal.preferredTime.start.split(':').map(Number);
    const [pEndH, pEndM] = goal.preferredTime.end.split(':').map(Number);
    
    const [y, m, d] = dayData.date.split('-').map(Number);
    
    const pStart = createDateInTimezone(y, m - 1, d, pStartH, pStartM, timezone);
    const pEnd = createDateInTimezone(y, m - 1, d, pEndH, pEndM, timezone);

    const isBusy = busyIntervals.some(busy => {
      return (pStart < busy.end) && (pEnd > busy.start);
    });

    if (!isBusy) {
      candidatesToScan.push({ start: pStart, end: pEnd });
    }
  }

  for (const slot of candidatesToScan) {
    let candidateStart = new Date(slot.start);
    
    while (true) {
      const candidateEnd = new Date(candidateStart.getTime() + blockDurationMinutes * 60000);
      if (candidateEnd > slot.end) break;

      const hasOverlap = proposedBlocks.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        const gapMs = minGapMinutes * 60000;
        return (candidateStart < new Date(bEnd.getTime() + gapMs)) && 
               (candidateEnd > new Date(bStart.getTime() - gapMs));
      });

      if (!hasOverlap) {
        let score = 100;

        if (goal.preferredTime?.start && goal.preferredTime?.end) {
          const [pStartH, pStartM] = goal.preferredTime.start.split(':').map(Number);
          const [pEndH, pEndM] = goal.preferredTime.end.split(':').map(Number);
          
          const [y, m, d] = dayData.date.split('-').map(Number);
          const pStart = createDateInTimezone(y, m - 1, d, pStartH, pStartM, timezone);
          const pEnd = createDateInTimezone(y, m - 1, d, pEndH, pEndM, timezone);

          if (candidateStart >= pStart && candidateEnd <= pEnd) {
            score += 2000;
          } else {
             score -= 500;
          }
        } else {
           const hour = candidateStart.getHours();
           if (hour >= 10 && hour <= 16) {
             score += 50;
           }
           if (hour < 8 || hour > 19) {
             score -= 20;
           }
        }

        validCandidates.push({ start: new Date(candidateStart), score });
      }

      candidateStart = new Date(candidateStart.getTime() + stepMinutes * 60000);
    }
  }

  if (validCandidates.length === 0) return false;

  validCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.start.getTime() - b.start.getTime();
  });

  const best = validCandidates[0];
  const bestEnd = new Date(best.start.getTime() + blockDurationMinutes * 60000);

  proposedBlocks.push({
    goalId: goal.id,
    goalName: goal.name,
    start: best.start.toISOString(),
    end: bestEnd.toISOString(),
    duration: blockDurationMinutes,
  });

  return true;
}

export function calculateSchedule(
  goals: any[],
  settings: any,
  calendarEvents: CalendarEvent[],
  weekStart: Date,
  weekEnd: Date
): ScheduleResult {
  const workingWindow = settings.workingWindow as Record<string, WorkingWindowDay>;
  const blockLengthMinutes = settings.blockLengthMinutes as number;
  const minGapMinutes = settings.minGapMinutes as number;
  const timezone = (settings.timezone as string) || 'America/New_York';

  const busyIntervals = eventsToBusyIntervals(calendarEvents);

  interface DaySlots {
    date: string;
    slots: TimeSlot[];
    capacity: number;
    usage: number;
  }
  const slotsByDay: Map<string, DaySlots> = new Map();

  const currentDay = new Date(weekStart);
  const endDay = new Date(weekEnd);

  for (let d = new Date(currentDay); d < endDay; d.setDate(d.getDate() + 1)) {
    const dayWindow = getWorkingWindowForDay(d, workingWindow, timezone);
    if (dayWindow) {
      const dayKey = dayWindow.start.toISOString().split('T')[0];
      const dayFreeSlots = computeFreeSlots(
        dayWindow.start,
        dayWindow.end,
        busyIntervals,
        minGapMinutes
      );
      if (dayFreeSlots.length > 0) {
        let capacity = 0;
        for (const slot of dayFreeSlots) {
          const duration = (slot.end.getTime() - slot.start.getTime()) / 60000;
          if (duration >= blockLengthMinutes) {
            capacity += duration;
          }
        }
        
        if (capacity > 0) {
          slotsByDay.set(dayKey, { 
            date: dayKey, 
            slots: dayFreeSlots,
            capacity,
            usage: 0 
          });
        }
      }
    }
  }

  let totalAvailableMinutes = 0;
  for (const dayData of slotsByDay.values()) {
    let effectiveCapacity = 0;
    for (const slot of dayData.slots) {
      const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
      if (slotDuration >= blockLengthMinutes) {
        const blockWithGap = blockLengthMinutes + minGapMinutes;
        const numBlocks = Math.floor((slotDuration + minGapMinutes) / blockWithGap);
        effectiveCapacity += numBlocks * blockLengthMinutes;
      }
    }
    dayData.capacity = effectiveCapacity;
    totalAvailableMinutes += effectiveCapacity;
  }

  const totalRequestedMinutes = goals.reduce((sum, g) => sum + g.targetMinutesPerWeek, 0);

  goals.sort((a, b) => {
    const aHasPref = !!a.preferredTime;
    const bHasPref = !!b.preferredTime;
    if (aHasPref && !bHasPref) return -1;
    if (!aHasPref && bHasPref) return 1;
    return b.targetMinutesPerWeek - a.targetMinutesPerWeek;
  });

  const proposedBlocks: ProposedBlock[] = [];
  const unscheduledGoals: { goalId: string; name: string; remainingMinutes: number }[] = [];

  const availableDays = [...slotsByDay.keys()].sort();
  const goalDayTracker = new Map<string, Set<string>>();
  availableDays.forEach(day => goalDayTracker.set(day, new Set()));

  for (const goal of goals) {
    let remainingMinutes = goal.targetMinutesPerWeek;
    let consecutiveFailures = 0;

    let targetBlockDuration = blockLengthMinutes;
    let targetSessions = 0;

    if (goal.sessionsPerWeek && goal.sessionsPerWeek > 0) {
      targetBlockDuration = Math.round(goal.targetMinutesPerWeek / goal.sessionsPerWeek);
      targetSessions = goal.sessionsPerWeek;
    } else {
      targetSessions = Math.ceil(goal.targetMinutesPerWeek / blockLengthMinutes);
    }

    const idealDays = getIdealDays(availableDays, targetSessions);
    let sessionsPlaced = 0;

    while ((goal.sessionsPerWeek ? sessionsPlaced < targetSessions : remainingMinutes > 0) && consecutiveFailures < availableDays.length) {
      const sortedDays = [...availableDays].sort((a, b) => {
        const dayA = slotsByDay.get(a)!;
        const dayB = slotsByDay.get(b)!;

        const hasGoalA = goalDayTracker.get(a)?.has(goal.id) ? 1 : 0;
        const hasGoalB = goalDayTracker.get(b)?.has(goal.id) ? 1 : 0;
        if (hasGoalA !== hasGoalB) return hasGoalA - hasGoalB;

        const isIdealA = idealDays.has(a) ? 1 : 0;
        const isIdealB = idealDays.has(b) ? 1 : 0;
        if (isIdealA !== isIdealB) return isIdealB - isIdealA;

        const utilA = dayA.capacity > 0 ? dayA.usage / dayA.capacity : 1;
        const utilB = dayB.capacity > 0 ? dayB.usage / dayB.capacity : 1;
        if (Math.abs(utilA - utilB) > 0.1) return utilA - utilB;

        return a.localeCompare(b);
      });

      let placed = false;
      const currentBlockDuration = goal.sessionsPerWeek 
        ? targetBlockDuration 
        : Math.min(blockLengthMinutes, remainingMinutes);
      
      if (currentBlockDuration <= 0) break;

      for (const dayKey of sortedDays) {
        const dayData = slotsByDay.get(dayKey)!;
        
        if (dayData.usage >= dayData.capacity) continue;

        if (tryPlaceBlockOnDay(dayData, goal, proposedBlocks, currentBlockDuration, minGapMinutes, busyIntervals, timezone)) {
          dayData.usage += currentBlockDuration;
          remainingMinutes -= currentBlockDuration;
          sessionsPlaced++;
          placed = true;
          
          goalDayTracker.get(dayKey)?.add(goal.id);
          break; 
        }
      }

      if (!placed) {
        consecutiveFailures++;
        if (consecutiveFailures >= 1) break;
      } else {
        consecutiveFailures = 0;
      }
    }

    if (remainingMinutes > 0 && (!goal.sessionsPerWeek || sessionsPlaced < targetSessions)) {
      unscheduledGoals.push({
        goalId: goal.id,
        name: goal.name,
        remainingMinutes,
      });
    }
  }

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
