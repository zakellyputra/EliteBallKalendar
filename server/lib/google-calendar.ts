import { google, calendar_v3 } from 'googleapis';
import { getOAuth2Client, refreshAccessToken } from './auth';
import { prisma } from '../index';

export interface CalendarInfo {
  id: string;
  name: string;
}

// In-memory cache for calendar lists (per user)
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const calendarListCache = new Map<string, CacheEntry<CalendarInfo[]>>();
const CALENDAR_LIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedCalendarList(userId: string): CalendarInfo[] | null {
  const entry = calendarListCache.get(userId);
  if (entry && Date.now() < entry.expiry) {
    return entry.data;
  }
  // Clear expired entry
  if (entry) {
    calendarListCache.delete(userId);
  }
  return null;
}

function setCachedCalendarList(userId: string, calendars: CalendarInfo[]): void {
  calendarListCache.set(userId, {
    data: calendars,
    expiry: Date.now() + CALENDAR_LIST_CACHE_TTL,
  });
}

// Export function to invalidate cache (e.g., when user updates calendar selection)
export function invalidateCalendarListCache(userId: string): void {
  calendarListCache.delete(userId);
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO string
  end: string; // ISO string
  isEliteBall?: boolean;
  goalId?: string;
  blockId?: string;
  calendarId?: string;
  calendarName?: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  start: string; // ISO string
  end: string; // ISO string
}

async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.accessToken) {
    throw new Error('User not authenticated');
  }

  const oauth2Client = getOAuth2Client();
  
  // Check if token is expired
  if (user.tokenExpiry && new Date() >= user.tokenExpiry) {
    if (!user.refreshToken) {
      throw new Error('Refresh token not available');
    }
    
    const { accessToken, expiry } = await refreshAccessToken(user.refreshToken);
    
    // Update user with new access token
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken,
        tokenExpiry: expiry,
      },
    });
    
    oauth2Client.setCredentials({ access_token: accessToken });
  } else {
    oauth2Client.setCredentials({ access_token: user.accessToken });
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function listCalendarsInternal(calendar: calendar_v3.Calendar): Promise<CalendarInfo[]> {
  const response = await calendar.calendarList.list();
  const calendars = response.data.items || [];
  return calendars
    .filter(cal => cal.accessRole === 'owner' || cal.accessRole === 'writer' || cal.accessRole === 'reader')
    .map(cal => ({
      id: cal.id!,
      name: cal.summary || cal.id!,
    }))
    .filter(cal => cal.id);
}

// Public function to get available calendars for a user (with caching)
export async function getAvailableCalendars(userId: string): Promise<CalendarInfo[]> {
  // Check cache first
  const cached = getCachedCalendarList(userId);
  if (cached) {
    return cached;
  }
  
  const calendar = await getCalendarClient(userId);
  const calendars = await listCalendarsInternal(calendar);
  
  // Cache the result
  setCachedCalendarList(userId, calendars);
  
  return calendars;
}

export async function listEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  selectedCalendarIds?: string[] | null
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient(userId);

  // Get all calendars (uses cache if available)
  let calendars = getCachedCalendarList(userId);
  if (!calendars) {
    calendars = await listCalendarsInternal(calendar);
    setCachedCalendarList(userId, calendars);
  }
  
  // Filter to only selected calendars if specified
  if (selectedCalendarIds && selectedCalendarIds.length > 0) {
    calendars = calendars.filter(cal => selectedCalendarIds.includes(cal.id));
  }

  // Fetch events from all calendars in parallel
  const eventsPromises = calendars.map(async (calInfo) => {
    try {
      const response = await calendar.events.list({
        calendarId: calInfo.id,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      return events.map((event) => {
        // Parse eliteball metadata from description
        const description = event.description || '';
        const isEliteBall = description.includes('eliteball=true');
        const goalIdMatch = description.match(/goalId=([^\n]+)/);
        const blockIdMatch = description.match(/blockId=([^\n]+)/);

        return {
          id: event.id!,
          title: event.summary || 'Untitled',
          description: event.description || undefined,
          start: event.start?.dateTime || event.start?.date!,
          end: event.end?.dateTime || event.end?.date!,
          isEliteBall,
          goalId: goalIdMatch?.[1],
          blockId: blockIdMatch?.[1],
          calendarId: calInfo.id,
          calendarName: calInfo.name,
        };
      });
    } catch (error) {
      // Skip calendars that fail (e.g., no access)
      console.error(`Failed to fetch events from calendar ${calInfo.id}:`, error);
      return [];
    }
  });

  const allEventsArrays = await Promise.all(eventsPromises);
  
  // Flatten all events and sort by start time
  const allEvents = allEventsArrays.flat().sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return allEvents;
}

export async function createEvent(
  userId: string,
  input: CreateEventInput
): Promise<CalendarEvent> {
  const calendar = await getCalendarClient(userId);

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: input.title,
      description: input.description,
      start: {
        dateTime: input.start,
        timeZone: 'America/New_York', // TODO: use user's timezone
      },
      end: {
        dateTime: input.end,
        timeZone: 'America/New_York',
      },
    },
  });

  const event = response.data;
  
  return {
    id: event.id!,
    title: event.summary || 'Untitled',
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date!,
    end: event.end?.dateTime || event.end?.date!,
  };
}

export async function updateEvent(
  userId: string,
  eventId: string,
  input: Partial<CreateEventInput>
): Promise<CalendarEvent> {
  const calendar = await getCalendarClient(userId);

  const updateBody: calendar_v3.Schema$Event = {};
  if (input.title) updateBody.summary = input.title;
  if (input.description !== undefined) updateBody.description = input.description;
  if (input.start) {
    updateBody.start = {
      dateTime: input.start,
      timeZone: 'America/New_York',
    };
  }
  if (input.end) {
    updateBody.end = {
      dateTime: input.end,
      timeZone: 'America/New_York',
    };
  }

  const response = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: updateBody,
  });

  const event = response.data;
  
  return {
    id: event.id!,
    title: event.summary || 'Untitled',
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date!,
    end: event.end?.dateTime || event.end?.date!,
  };
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  const calendar = await getCalendarClient(userId);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

export function getWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
