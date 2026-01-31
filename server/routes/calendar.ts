import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { listEvents, createEvent, updateEvent, deleteEvent, getWeekRange } from '../lib/google-calendar';

const router = Router();

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

    const events = await listEvents(req.userId!, timeMin, timeMax);
    res.json({ events });
  } catch (err: any) {
    console.error('Error fetching calendar events:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch events' });
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
    await deleteEvent(req.userId!, id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting calendar event:', err);
    res.status(500).json({ error: err.message || 'Failed to delete event' });
  }
});

export default router;
