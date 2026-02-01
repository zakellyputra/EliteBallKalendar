import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';

const router = Router();

// Get all goals for the current user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await firestore.collection('goals')
      .where('userId', '==', req.userId!)
      .orderBy('createdAt', 'desc')
      .get();

    const goals = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    res.json({ goals });
  } catch (err: any) {
    console.error('Error fetching goals:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch goals' });
  }
});

// Create a new goal
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, targetMinutesPerWeek, preferredTime, sessionsPerWeek } = req.body;

    if (!name || targetMinutesPerWeek === undefined) {
      return res.status(400).json({ error: 'Name and targetMinutesPerWeek are required' });
    }

    const docRef = await firestore.collection('goals').add({
      userId: req.userId!,
      name,
      targetMinutesPerWeek: parseInt(targetMinutesPerWeek),
      preferredTime: preferredTime || null,
      sessionsPerWeek: sessionsPerWeek ? parseInt(sessionsPerWeek) : null,
      createdAt: new Date().toISOString(),
    });

    const docSnap = await docRef.get();
    res.json({ goal: { id: docSnap.id, ...docSnap.data() } });
  } catch (err: any) {
    console.error('Error creating goal:', err);
    res.status(500).json({ error: err.message || 'Failed to create goal' });
  }
});

// Update a goal
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid goal id' });
    }
    const { name, targetMinutesPerWeek, preferredTime, sessionsPerWeek } = req.body;

    // Verify ownership
    const docRef = firestore.collection('goals').doc(id);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.userId !== req.userId!) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (targetMinutesPerWeek !== undefined) {
      updateData.targetMinutesPerWeek = parseInt(targetMinutesPerWeek);
    }
    if (preferredTime !== undefined) updateData.preferredTime = preferredTime;
    if (sessionsPerWeek !== undefined) updateData.sessionsPerWeek = sessionsPerWeek ? parseInt(sessionsPerWeek) : null;

    await docRef.set(updateData, { merge: true });
    const updated = await docRef.get();
    res.json({ goal: { id: updated.id, ...updated.data() } });
  } catch (err: any) {
    console.error('Error updating goal:', err);
    res.status(500).json({ error: err.message || 'Failed to update goal' });
  }
});

// Delete a goal
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid goal id' });
    }

    // Verify ownership
    const docRef = firestore.collection('goals').doc(id);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.userId !== req.userId!) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await docRef.delete();

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting goal:', err);
    res.status(500).json({ error: err.message || 'Failed to delete goal' });
  }
});

export default router;
