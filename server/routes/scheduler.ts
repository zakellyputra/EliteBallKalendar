import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { generateSchedule, applySchedule } from '../lib/scheduler';

const router = Router();

// Generate proposed focus blocks
router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { weekStart, weekEnd } = req.body;
    
    const startDate = weekStart ? new Date(weekStart) : undefined;
    const endDate = weekEnd ? new Date(weekEnd) : undefined;
    
    const result = await generateSchedule(req.userId!, startDate, endDate);
    
    res.json({
      blocks: result.proposedBlocks,
      insufficientTime: result.insufficientTime,
    });
  } catch (err: any) {
    console.error('Error generating schedule:', err);
    res.status(500).json({ error: err.message || 'Failed to generate schedule' });
  }
});

// Apply proposed blocks to calendar
router.post('/apply', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { blocks } = req.body;

    if (!blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ error: 'Blocks array is required' });
    }

    const applied = await applySchedule(req.userId!, blocks);
    
    res.json({ applied });
  } catch (err: any) {
    console.error('Error applying schedule:', err);
    res.status(500).json({ error: err.message || 'Failed to apply schedule' });
  }
});

export default router;
