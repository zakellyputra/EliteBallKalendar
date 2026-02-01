import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';

const router = Router();

// Default working window for all days
const DEFAULT_WORKING_WINDOW: Record<string, { enabled: boolean; start: string; end: string }> = {
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '09:00', end: '17:00' },
  sunday: { enabled: false, start: '09:00', end: '17:00' },
};

// Get user settings
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settingsRef = firestore.collection('settings').doc(req.userId!);
    const snapshot = await settingsRef.get();

    if (!snapshot.exists) {
      const defaults = {
        id: req.userId!,
        userId: req.userId!,
        workingWindow: DEFAULT_WORKING_WINDOW,
        blockLengthMinutes: 30,
        timezone: 'America/New_York',
        minGapMinutes: 5,
        selectedCalendars: null,
      };
      await settingsRef.set(defaults);
      res.json({ settings: defaults });
      return;
    }

    const settings = snapshot.data();
    res.json({ settings: { id: snapshot.id, ...settings } });
  } catch (err: any) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workingWindow, blockLengthMinutes, timezone, minGapMinutes, selectedCalendars } = req.body;

    const updateData: any = {};
    
    if (workingWindow !== undefined) {
      updateData.workingWindow = workingWindow;
    }
    if (blockLengthMinutes !== undefined) {
      updateData.blockLengthMinutes = blockLengthMinutes;
    }
    if (timezone !== undefined) {
      updateData.timezone = timezone;
    }
    if (minGapMinutes !== undefined) {
      updateData.minGapMinutes = minGapMinutes;
    }
    if (selectedCalendars !== undefined) {
      updateData.selectedCalendars = selectedCalendars;
    }

    const settingsRef = firestore.collection('settings').doc(req.userId!);
    await settingsRef.set({
      userId: req.userId!,
      ...updateData,
    }, { merge: true });

    const updated = await settingsRef.get();
    res.json({ settings: { id: updated.id, ...updated.data() } });
  } catch (err: any) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

export default router;
