import { Router, Response } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get all goals for the current user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ goals });
  } catch (err: any) {
    console.error('Error fetching goals:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch goals' });
  }
});

// Create a new goal
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, targetMinutesPerWeek } = req.body;

    if (!name || targetMinutesPerWeek === undefined) {
      return res.status(400).json({ error: 'Name and targetMinutesPerWeek are required' });
    }

    const goal = await prisma.goal.create({
      data: {
        userId: req.userId!,
        name,
        targetMinutesPerWeek: parseInt(targetMinutesPerWeek),
      },
    });

    res.json({ goal });
  } catch (err: any) {
    console.error('Error creating goal:', err);
    res.status(500).json({ error: err.message || 'Failed to create goal' });
  }
});

// Update a goal
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, targetMinutesPerWeek } = req.body;

    // Verify ownership
    const existing = await prisma.goal.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (targetMinutesPerWeek !== undefined) {
      updateData.targetMinutesPerWeek = parseInt(targetMinutesPerWeek);
    }

    const goal = await prisma.goal.update({
      where: { id },
      data: updateData,
    });

    res.json({ goal });
  } catch (err: any) {
    console.error('Error updating goal:', err);
    res.status(500).json({ error: err.message || 'Failed to update goal' });
  }
});

// Delete a goal
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.goal.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await prisma.goal.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting goal:', err);
    res.status(500).json({ error: err.message || 'Failed to delete goal' });
  }
});

export default router;
