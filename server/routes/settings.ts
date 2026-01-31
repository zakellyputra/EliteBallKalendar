import { Router, Response } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

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
    let settings = await prisma.settings.findUnique({
      where: { userId: req.userId! },
    });

    // If no settings exist, create defaults
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          userId: req.userId!,
          workingWindow: JSON.stringify(DEFAULT_WORKING_WINDOW),
          blockLengthMinutes: 30,
          timezone: 'America/New_York',
          minGapMinutes: 5,
        },
      });
    }

    // Parse workingWindow from JSON
    const parsed = {
      ...settings,
      workingWindow: JSON.parse(settings.workingWindow),
    };

    res.json({ settings: parsed });
  } catch (err: any) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workingWindow, blockLengthMinutes, timezone, minGapMinutes } = req.body;

    const updateData: any = {};
    
    if (workingWindow !== undefined) {
      updateData.workingWindow = JSON.stringify(workingWindow);
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

    // Upsert settings
    const settings = await prisma.settings.upsert({
      where: { userId: req.userId! },
      update: updateData,
      create: {
        userId: req.userId!,
        workingWindow: updateData.workingWindow || JSON.stringify(DEFAULT_WORKING_WINDOW),
        blockLengthMinutes: updateData.blockLengthMinutes || 30,
        timezone: updateData.timezone || 'America/New_York',
        minGapMinutes: updateData.minGapMinutes || 5,
      },
    });

    const parsed = {
      ...settings,
      workingWindow: JSON.parse(settings.workingWindow),
    };

    res.json({ settings: parsed });
  } catch (err: any) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

export default router;
