import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';

const router = Router();

// Get productivity stats
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get focus blocks for this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const startIso = startOfMonth.toISOString();
    const endIso = endOfMonth.toISOString();

    const focusSnapshot = await firestore.collection('focusBlocks')
      .where('userId', '==', req.userId!)
      .where('start', '>=', startIso)
      .where('end', '<=', endIso)
      .get();
    const focusBlocks = focusSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as any[];

    const goalSnapshot = await firestore.collection('goals')
      .where('userId', '==', req.userId!)
      .get();
    const goalsById = new Map(goalSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data()]));

    // Calculate stats
    const completedBlocks = focusBlocks.filter(b => b.status === 'completed' || b.status === 'scheduled');
    const skippedBlocks = focusBlocks.filter(b => b.status === 'skipped');
    
    const totalFocusedMinutes = completedBlocks.reduce((sum, block) => {
      return sum + (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
    }, 0);

    // Goal breakdown
    const goalBreakdown: Record<string, { name: string; minutes: number }> = {};
    for (const block of completedBlocks) {
      const goalId = block.goalId;
      const goal = goalsById.get(goalId) as any;
      if (!goal) {
        continue;
      }
      if (!goalBreakdown[goalId]) {
        goalBreakdown[goalId] = { name: goal.name, minutes: 0 };
      }
      goalBreakdown[goalId].minutes += (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
    }

    // Reschedule logs
    const rescheduleSnapshot = await firestore.collection('rescheduleLogs')
      .where('userId', '==', req.userId!)
      .where('timestamp', '>=', startIso)
      .where('timestamp', '<=', endIso)
      .get();
    const rescheduleLogs = rescheduleSnapshot.docs.map(docSnap => docSnap.data()) as any[];

    const rescheduleCount = rescheduleLogs.length;
    const recoveredMinutes = rescheduleLogs.reduce((sum, log) => sum + log.minutesRecovered, 0);
    const tokensSaved = rescheduleLogs.reduce((sum, log) => sum + (log.rawContextChars - log.compressedChars), 0);

    res.json({
      totalFocusedHours: Math.round(totalFocusedMinutes / 60 * 10) / 10,
      blocksCompleted: completedBlocks.length,
      blocksSkipped: skippedBlocks.length,
      rescheduleCount,
      recoveredMinutes: Math.round(recoveredMinutes),
      tokensSaved,
      goalBreakdown: Object.entries(goalBreakdown).map(([goalId, data]) => ({
        goalId,
        name: data.name,
        hours: Math.round(data.minutes / 60 * 10) / 10,
      })),
    });
  } catch (err: any) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
});

// Get wrapped data (enhanced stats for story mode)
router.get('/wrapped', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Focus blocks
    const startIso = startOfMonth.toISOString();
    const endIso = endOfMonth.toISOString();
    const focusSnapshot = await firestore.collection('focusBlocks')
      .where('userId', '==', req.userId!)
      .where('start', '>=', startIso)
      .where('end', '<=', endIso)
      .get();
    const focusBlocks = focusSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as any[];

    const goalSnapshot = await firestore.collection('goals')
      .where('userId', '==', req.userId!)
      .get();
    const goalsById = new Map(goalSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data()]));

    const completedBlocks = focusBlocks.filter(b => b.status === 'completed' || b.status === 'scheduled');
    const skippedBlocks = focusBlocks.filter(b => b.status === 'skipped');

    const totalFocusedMinutes = completedBlocks.reduce((sum, block) => {
      return sum + (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
    }, 0);

    // Goal breakdown
    const goalBreakdown: Record<string, { name: string; minutes: number }> = {};
    for (const block of completedBlocks) {
      const goalId = block.goalId;
      const goal = goalsById.get(goalId) as any;
      if (!goal) {
        continue;
      }
      if (!goalBreakdown[goalId]) {
        goalBreakdown[goalId] = { name: goal.name, minutes: 0 };
      }
      goalBreakdown[goalId].minutes += (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
    }

    // Find peak productivity day and hour
    const dayCount: Record<string, number> = {};
    const hourCount: Record<number, number> = {};

    for (const block of completedBlocks) {
      const startDate = new Date(block.start);
      const day = startDate.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = startDate.getHours();

      dayCount[day] = (dayCount[day] || 0) + 1;
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    }

    const peakDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '10';
    const peakHourFormatted = `${parseInt(peakHour) > 12 ? parseInt(peakHour) - 12 : parseInt(peakHour)}:00 ${parseInt(peakHour) >= 12 ? 'PM' : 'AM'}`;

    // Calculate week-by-week hours
    const weeklyHours: { week: number; hours: number; label: string }[] = [];
    const weeksInMonth = Math.ceil((endOfMonth.getDate() + startOfMonth.getDay()) / 7);

    for (let week = 0; week < weeksInMonth; week++) {
      const weekStart = new Date(startOfMonth);
      weekStart.setDate(startOfMonth.getDate() + (week * 7) - startOfMonth.getDay());
      if (weekStart < startOfMonth) weekStart.setTime(startOfMonth.getTime());

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (weekEnd > endOfMonth) weekEnd.setTime(endOfMonth.getTime());

      const weekBlocks = completedBlocks.filter(block => {
        const blockStart = new Date(block.start);
        return blockStart >= weekStart && blockStart <= weekEnd;
      });

      const weekMinutes = weekBlocks.reduce((sum, block) => {
        return sum + (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
      }, 0);

      const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = weekEnd.toLocaleDateString('en-US', { day: 'numeric' });

      weeklyHours.push({
        week: week + 1,
        hours: Math.round(weekMinutes / 60 * 10) / 10,
        label: `${startLabel}-${endLabel}`,
      });
    }

    // Calculate weekday vs weekend split
    let weekdayMinutes = 0;
    let weekendMinutes = 0;

    for (const block of completedBlocks) {
      const blockStart = new Date(block.start);
      const dayOfWeek = blockStart.getDay();
      const blockMinutes = (new Date(block.end).getTime() - blockStart.getTime()) / 60000;

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendMinutes += blockMinutes;
      } else {
        weekdayMinutes += blockMinutes;
      }
    }

    const totalMinutesForSplit = weekdayMinutes + weekendMinutes;
    const weekdayPercent = totalMinutesForSplit > 0 ? Math.round((weekdayMinutes / totalMinutesForSplit) * 100) : 0;
    const weekendPercent = 100 - weekdayPercent;

    let sentiment: 'positive' | 'neutral' | 'negative';
    if (weekdayPercent >= 80) {
      sentiment = 'positive';
    } else if (weekdayPercent >= 60) {
      sentiment = 'neutral';
    } else {
      sentiment = 'negative';
    }

    const weekdayWeekendSplit = {
      weekdayHours: Math.round(weekdayMinutes / 60 * 10) / 10,
      weekdayPercent,
      weekendHours: Math.round(weekendMinutes / 60 * 10) / 10,
      weekendPercent,
      sentiment,
    };

    // Reschedule logs
    const rescheduleSnapshot = await firestore.collection('rescheduleLogs')
      .where('userId', '==', req.userId!)
      .where('timestamp', '>=', startIso)
      .where('timestamp', '<=', endIso)
      .get();
    const rescheduleLogs = rescheduleSnapshot.docs.map(docSnap => docSnap.data()) as any[];

    const rescheduleCount = rescheduleLogs.length;
    const recoveredMinutes = rescheduleLogs.reduce((sum, log) => sum + (log.minutesRecovered || 0), 0);

    // Calculate hours added via reschedule (blocks created through reschedule operations)
    const hoursAddedBreakdown: Record<string, { name: string; minutes: number }> = {};
    let totalAddedMinutes = 0;

    for (const log of rescheduleLogs) {
      if (log.operations && Array.isArray(log.operations)) {
        for (const op of log.operations) {
          if (op.op === 'create' && op.start && op.end) {
            const minutes = (new Date(op.end).getTime() - new Date(op.start).getTime()) / 60000;
            totalAddedMinutes += minutes;

            const goalName = op.goalName || 'Unknown';
            if (!hoursAddedBreakdown[goalName]) {
              hoursAddedBreakdown[goalName] = { name: goalName, minutes: 0 };
            }
            hoursAddedBreakdown[goalName].minutes += minutes;
          }
        }
      }
    }

    // Generate achievements
    const achievements: string[] = [];

    if (completedBlocks.length > 0) {
      const completionRate = completedBlocks.length / (completedBlocks.length + skippedBlocks.length);
      if (completionRate >= 0.9) {
        achievements.push(`Completed ${Math.round(completionRate * 100)}% of scheduled blocks`);
      }
    }

    if (totalFocusedMinutes > 100) {
      achievements.push(`Focused for ${Math.round(totalFocusedMinutes)} minutes`);
    }

    if (rescheduleCount > 0) {
      achievements.push(`Used AI to reschedule ${rescheduleCount} times`);
    }

    if (recoveredMinutes > 0) {
      achievements.push(`Recovered ${Math.round(recoveredMinutes)} minutes of focus time`);
    }

    if (Object.keys(goalBreakdown).length >= 3) {
      achievements.push(`Worked on ${Object.keys(goalBreakdown).length} different goals`);
    }

    // New achievements
    if (weekendMinutes / 60 > 5) {
      achievements.push('Weekend Warrior - Over 5 hours on weekends');
    }

    if (weekdayPercent > 90) {
      achievements.push('Weekday Champion - 90%+ of work on weekdays');
    }

    if (totalAddedMinutes / 60 > 2) {
      achievements.push('Flexible Scheduler - Added 2+ hours via reschedule');
    }

    if (achievements.length === 0) {
      achievements.push('Start scheduling focus blocks to earn achievements!');
    }

    res.json({
      month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalFocusedHours: Math.round(totalFocusedMinutes / 60 * 10) / 10,
      blocksCompleted: completedBlocks.length,
      blocksSkipped: skippedBlocks.length,
      rescheduleCount,
      recoveredMinutes: Math.round(recoveredMinutes),
      peakProductivityDay: peakDay,
      peakProductivityHour: peakHourFormatted,
      goalBreakdown: Object.entries(goalBreakdown)
        .map(([goalId, data]) => ({
          goalId,
          name: data.name,
          hours: Math.round(data.minutes / 60 * 10) / 10,
        }))
        .sort((a, b) => b.hours - a.hours),
      achievements,
      weeklyHours,
      weekdayWeekendSplit,
      hoursAddedViaReschedule: Math.round(totalAddedMinutes / 60 * 10) / 10,
      hoursAddedBreakdown: Object.entries(hoursAddedBreakdown)
        .map(([goalName, data]) => ({
          goalId: goalName,
          name: data.name,
          hoursAdded: Math.round(data.minutes / 60 * 10) / 10,
        }))
        .sort((a, b) => b.hoursAdded - a.hoursAdded),
    });
  } catch (err: any) {
    console.error('Error fetching wrapped data:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wrapped data' });
  }
});

export default router;
