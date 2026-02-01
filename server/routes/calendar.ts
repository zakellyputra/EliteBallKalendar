import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { listEvents, createEvent, updateEvent, deleteEvent, getWeekRange, getAvailableCalendars } from '../lib/google-calendar';
import { firestore } from '../lib/firebase-admin';

const router = Router();

// Get list of available calendars
router.get('/list', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const calendars = await getAvailableCalendars(req.userId!);
    res.json({ calendars });
  } catch (err: any) {
    console.error('Error fetching calendar list:', err);
    const message = err.message || 'Failed to fetch calendars';
    if (message === 'Calendar not connected') {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// Get calendar events for the current week
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = getWeekRange();
    
    // Allow custom date range via query params
    const timeMin = req.query.timeMin 
      ? new Date(req.query.timeMin as string) 
      : start;
    const timeMax = req.query.timeMax 
      ? new Date(req.query.timeMax as string) 
      : end;

    // Get user's selected calendars from settings
    const settingsDoc = await firestore.collection('settings').doc(req.userId!).get();
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    const selectedCalendars = settings?.selectedCalendars ?? null;
    const ebkCalendarId = settings?.ebkCalendarId ?? null;

    const events = await listEvents(req.userId!, timeMin, timeMax, selectedCalendars, ebkCalendarId);
    res.json({ events });
  } catch (err: any) {
    console.error('Error fetching calendar events:', err);
    const message = err.message || 'Failed to fetch events';
    if (message === 'Calendar not connected') {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// Create a calendar event
router.post('/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, start, end } = req.body;

    if (!title || !start || !end) {
      return res.status(400).json({ error: 'Missing required fields: title, start, end' });
    }

    const event = await createEvent(req.userId!, {
      title,
      description,
      start,
      end,
    });

    res.json({ event });
  } catch (err: any) {
    console.error('Error creating calendar event:', err);
    res.status(500).json({ error: err.message || 'Failed to create event' });
  }
});

// Update a calendar event
router.put('/events/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }
    const { title, description, start, end } = req.body;

    const event = await updateEvent(req.userId!, id, {
      title,
      description,
      start,
      end,
    });

    res.json({ event });
  } catch (err: any) {
    console.error('Error updating calendar event:', err);
    res.status(500).json({ error: err.message || 'Failed to update event' });
  }
});

// Delete a calendar event
router.delete('/events/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }
    const { calendarId } = req.body || {};
    await deleteEvent(req.userId!, id, calendarId || 'primary');

    // Mark associated focusBlock as deleted
    const focusBlocksSnapshot = await firestore.collection('focusBlocks')
      .where('userId', '==', req.userId!)
      .where('calendarEventId', '==', id)
      .get();

    const updatePromises = focusBlocksSnapshot.docs.map(doc =>
      doc.ref.update({ status: 'deleted' })
    );
    await Promise.all(updatePromises);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting calendar event:', err);
    res.status(500).json({ error: err.message || 'Failed to delete event' });
  }
});

export default router;
