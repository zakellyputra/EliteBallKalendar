import { Router, Response } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

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

    const focusBlocks = await prisma.focusBlock.findMany({
      where: {
        userId: req.userId!,
        start: { gte: startOfMonth },
        end: { lte: endOfMonth },
      },
      include: { goal: true },
    });

    // Calculate stats
    const completedBlocks = focusBlocks.filter(b => b.status === 'completed' || b.status === 'scheduled');
    const skippedBlocks = focusBlocks.filter(b => b.status === 'skipped');
    
    const totalFocusedMinutes = completedBlocks.reduce((sum, block) => {
      return sum + (block.end.getTime() - block.start.getTime()) / 60000;
    }, 0);

    // Goal breakdown
    const goalBreakdown: Record<string, { name: string; minutes: number }> = {};
    for (const block of completedBlocks) {
      const goalId = block.goalId;
      if (!goalBreakdown[goalId]) {
        goalBreakdown[goalId] = { name: block.goal.name, minutes: 0 };
      }
      goalBreakdown[goalId].minutes += (block.end.getTime() - block.start.getTime()) / 60000;
    }

    // Reschedule logs
    const rescheduleLogs = await prisma.rescheduleLog.findMany({
      where: {
        userId: req.userId!,
        timestamp: { gte: startOfMonth, lte: endOfMonth },
      },
    });

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
    const focusBlocks = await prisma.focusBlock.findMany({
      where: {
        userId: req.userId!,
        start: { gte: startOfMonth },
        end: { lte: endOfMonth },
      },
      include: { goal: true },
    });

    const completedBlocks = focusBlocks.filter(b => b.status === 'completed' || b.status === 'scheduled');
    const skippedBlocks = focusBlocks.filter(b => b.status === 'skipped');

    const totalFocusedMinutes = completedBlocks.reduce((sum, block) => {
      return sum + (block.end.getTime() - block.start.getTime()) / 60000;
    }, 0);

    // Goal breakdown
    const goalBreakdown: Record<string, { name: string; minutes: number }> = {};
    for (const block of completedBlocks) {
      const goalId = block.goalId;
      if (!goalBreakdown[goalId]) {
        goalBreakdown[goalId] = { name: block.goal.name, minutes: 0 };
      }
      goalBreakdown[goalId].minutes += (block.end.getTime() - block.start.getTime()) / 60000;
    }

    // Find peak productivity day and hour
    const dayCount: Record<string, number> = {};
    const hourCount: Record<number, number> = {};
    
    for (const block of completedBlocks) {
      const day = block.start.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = block.start.getHours();
      
      dayCount[day] = (dayCount[day] || 0) + 1;
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    }

    const peakDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '10';
    const peakHourFormatted = `${parseInt(peakHour) > 12 ? parseInt(peakHour) - 12 : parseInt(peakHour)}:00 ${parseInt(peakHour) >= 12 ? 'PM' : 'AM'}`;

    // Reschedule logs
    const rescheduleLogs = await prisma.rescheduleLog.findMany({
      where: {
        userId: req.userId!,
        timestamp: { gte: startOfMonth, lte: endOfMonth },
      },
    });

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
