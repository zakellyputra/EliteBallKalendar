import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { firestore } from '../lib/firebase-admin';
import { createEbkCalendar, renameCalendar } from '../lib/google-calendar';

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
        ebkCalendarName: 'EliteBall Focus Blocks',
        ebkCalendarId: null,
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
    const { workingWindow, blockLengthMinutes, timezone, minGapMinutes, selectedCalendars, ebkCalendarName } = req.body;

    const settingsRef = firestore.collection('settings').doc(req.userId!);
    const existingSettings = await settingsRef.get();
    const existingData = existingSettings.exists ? existingSettings.data() : null;

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
    if (ebkCalendarName !== undefined) {
      updateData.ebkCalendarName = ebkCalendarName;

      // If calendar name changed and we have an existing calendar, rename it
      if (existingData?.ebkCalendarId && existingData.ebkCalendarName !== ebkCalendarName) {
        try {
          await renameCalendar(req.userId!, existingData.ebkCalendarId, ebkCalendarName);
          console.log(`Renamed EBK calendar to: ${ebkCalendarName}`);
        } catch (renameErr: any) {
          console.error('Failed to rename calendar:', renameErr);
          // Continue anyway - the calendar ID might be stale
        }
      }
    }

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

// Reset EBK calendar (create a new one and switch settings)
router.post('/reset-ebk-calendar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settingsRef = firestore.collection('settings').doc(req.userId!);
    const snapshot = await settingsRef.get();
    const settings = snapshot.exists ? snapshot.data() : null;
    const ebkCalendarName = settings?.ebkCalendarName || 'EliteBall Focus Blocks';
    const oldCalendarId = settings?.ebkCalendarId || null;

    const newCalendar = await createEbkCalendar(req.userId!, ebkCalendarName);

    let selectedCalendars = settings?.selectedCalendars ?? null;
    if (Array.isArray(selectedCalendars)) {
      selectedCalendars = selectedCalendars.filter(id => id !== oldCalendarId);
      if (!selectedCalendars.includes(newCalendar.id)) {
        selectedCalendars.push(newCalendar.id);
      }
    }

    await settingsRef.set({
      userId: req.userId!,
      ebkCalendarId: newCalendar.id,
      ebkCalendarName: newCalendar.name,
      selectedCalendars,
    }, { merge: true });

    res.json({ newCalendar, oldCalendarId });
  } catch (err: any) {
    console.error('Error resetting EBK calendar:', err);
    res.status(500).json({ error: err.message || 'Failed to reset calendar' });
  }
});

export default router;
