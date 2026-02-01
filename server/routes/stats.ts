import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';
import { listEvents } from '../lib/google-calendar';

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

    // Get user settings for calendar filtering
    const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
    const settings = settingsDoc.data() || {};
    const selectedCalendars = settings.selectedCalendars as string[] | undefined;
    const ebkCalendarId = settings.ebkCalendarId as string | undefined;

    // Fetch events from Google Calendar instead of Firestore
    const allEvents = await listEvents(
      req.userId!,
      startOfMonth,
      endOfMonth,
      selectedCalendars,
      ebkCalendarId
    );

    // Filter for EBK focus blocks
    const focusBlocks = allEvents
      .filter(e => e.isEliteBall)
      .map(e => ({
        id: e.id,
        start: e.start,
        end: e.end,
        goalId: e.goalId || '',
        status: 'scheduled', // Treat all calendar events as "scheduled"
      }));

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

    // Get user settings for calendar filtering
    const startIso = startOfMonth.toISOString();
    const endIso = endOfMonth.toISOString();

    const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
    const settings = settingsDoc.data() || {};
    const selectedCalendars = settings.selectedCalendars as string[] | undefined;
    const ebkCalendarId = settings.ebkCalendarId as string | undefined;

    // Fetch events from Google Calendar instead of Firestore
    const allEvents = await listEvents(
      req.userId!,
      startOfMonth,
      endOfMonth,
      selectedCalendars,
      ebkCalendarId
    );

    // Filter for EBK focus blocks
    const focusBlocks = allEvents
      .filter(e => e.isEliteBall)
      .map(e => ({
        id: e.id,
        start: e.start,
        end: e.end,
        goalId: e.goalId || '',
        status: 'scheduled', // Treat all calendar events as "scheduled"
      }));

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

    // Reschedule logs
    const rescheduleSnapshot = await firestore.collection('rescheduleLogs')
      .where('userId', '==', req.userId!)
      .where('timestamp', '>=', startIso)
      .where('timestamp', '<=', endIso)
      .get();
    const rescheduleLogs = rescheduleSnapshot.docs.map(docSnap => docSnap.data()) as any[];

    const rescheduleCount = rescheduleLogs.length;
    const recoveredMinutes = rescheduleLogs.reduce((sum, log) => sum + (log.minutesRecovered || 0), 0);

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
    const currentWeekStart = new Date(startOfMonth);
    let weekNum = 1;

    while (currentWeekStart <= endOfMonth) {
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
      
      // Cap at end of month
      const effectiveEnd = currentWeekEnd > endOfMonth ? endOfMonth : currentWeekEnd;
      // Set to end of day
      effectiveEnd.setHours(23, 59, 59, 999);
      
      const weekBlocks = completedBlocks.filter(block => {
        const blockStart = new Date(block.start);
        return blockStart >= currentWeekStart && blockStart <= effectiveEnd;
      });

      const weekMinutes = weekBlocks.reduce((sum, block) => {
        return sum + (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
      }, 0);

      const startLabel = currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = effectiveEnd.toLocaleDateString('en-US', { day: 'numeric' });

      weeklyHours.push({
        week: weekNum,
        hours: Math.round(weekMinutes / 60 * 10) / 10,
        label: `${startLabel}-${endLabel}`,
      });

      // Move to next week
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNum++;
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

    // Generate achievements
    const achievements: string[] = [];

    if (completedBlocks.length > 0) {
      const completionRate = completedBlocks.length / (completedBlocks.length + skippedBlocks.length);
      if (completionRate >= 0.95) {
        achievements.push('Focus Master - 95%+ completion rate');
      } else if (completionRate >= 0.8) {
        achievements.push(`Reliable - ${Math.round(completionRate * 100)}% completion rate`);
      }
    }

    if (totalFocusedMinutes > 1000) {
      achievements.push('Deep Worker - Over 1000 minutes focused');
    }

    if (Object.keys(goalBreakdown).length >= 4) {
      achievements.push('Renaissance Mind - Worked on 4+ different goals');
    }

    if (weekendMinutes / 60 > 5) {
      achievements.push('Weekend Warrior - Over 5 hours on weekends');
    }

    // Check for Night Owl (blocks starting after 8 PM)
    const nightBlocks = completedBlocks.filter(b => new Date(b.start).getHours() >= 20);
    if (nightBlocks.length >= 3) {
      achievements.push('Night Owl - 3+ late night sessions');
    }

    // Check for Early Bird (blocks starting before 7 AM)
    const earlyBlocks = completedBlocks.filter(b => new Date(b.start).getHours() < 7);
    if (earlyBlocks.length >= 3) {
      achievements.push('Early Bird - 3+ early morning sessions');
    }
    
    // Marathon Runner (blocks > 90 mins)
    const longBlocks = completedBlocks.filter(b => (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000 >= 90);
    if (longBlocks.length >= 2) {
      achievements.push('Marathon Runner - 2+ long sessions (>90m)');
    }

    if (achievements.length === 0) {
      achievements.push('Start scheduling focus blocks to earn achievements!');
    }

    // Determine Persona
    let persona = {
      name: 'The Apprentice',
      description: 'You are just getting started on your journey. Greatness awaits!',
      image: 'mario-ai-104.png'
    };

    const distinctDays = new Set(completedBlocks.map(b => new Date(b.start).toDateString())).size;
    const completionRate = completedBlocks.length > 0 
      ? completedBlocks.length / (completedBlocks.length + skippedBlocks.length)
      : 0;
    
    // 1. Time Perfectionist
    if (completionRate >= 0.95 && completedBlocks.length >= 5) {
      persona = {
        name: 'Time Perfectionist',
        description: 'You stick to your schedule with incredible precision. Nothing slips through the cracks.',
        image: 'lebron-ai-104.png'
      };
    } 
    // 2. Crammy Jammy
    else {
        let nightMinutes = 0;
        let lastWeekMinutes = 0;
        const lastWeekStart = new Date(endOfMonth);
        lastWeekStart.setDate(endOfMonth.getDate() - 7);
        
        for (const block of completedBlocks) {
            const start = new Date(block.start);
            if (start.getHours() >= 20 || start.getHours() < 4) {
                nightMinutes += (new Date(block.end).getTime() - start.getTime()) / 60000;
            }
            if (start >= lastWeekStart) {
                lastWeekMinutes += (new Date(block.end).getTime() - start.getTime()) / 60000;
            }
        }
        
        if (totalFocusedMinutes > 0 && ((nightMinutes / totalFocusedMinutes > 0.3) || (lastWeekMinutes / totalFocusedMinutes > 0.4))) {
             persona = {
                name: 'Crammy Jammy',
                description: 'You thrive under pressure and burn the midnight oil. Deadlines are your fuel.',
                image: 'newjeans-ai-104.png'
            };
        }
        // 3. Weekend Warrior
        else if (weekendPercent > 40 && totalFocusedMinutes > 180) {
             persona = {
                name: 'Weekend Warrior',
                description: 'While others rest, you grind. Your weekends are legendary for productivity.',
                image: 'matcha-cup-104.png'
            };
        }
        // 4. Steady Eddie
        else if (distinctDays >= 15) {
             persona = {
                name: 'Steady Eddie',
                description: 'Consistency is your middle name. You show up every single day.',
                image: 'mario-ai-104.png'
            };
        }
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
      persona,
    });
  } catch (err: any) {
    console.error('Error fetching wrapped data:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wrapped data' });
  }
});

export default router;
