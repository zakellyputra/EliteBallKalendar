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
      tokensSaved,
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
    });
  } catch (err: any) {
    console.error('Error fetching wrapped data:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wrapped data' });
  }
});

export default router;
