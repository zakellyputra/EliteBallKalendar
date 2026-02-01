import { auth as firebaseAuth } from './firebase';

const API_BASE = '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function getIdToken(): Promise<string | undefined> {
  return firebaseAuth.currentUser ? firebaseAuth.currentUser.getIdToken() : undefined;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = await getIdToken();
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const rawText = isJson ? null : await response.text();
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      if (isJson && data) {
        return { error: data.error || 'Request failed' };
      }
      return { error: rawText || 'Request failed' };
    }

    return { data: (data ?? {}) as T };
  } catch (err: any) {
    return { error: err.message || 'Network error' };
  }
}

// Calendar
export const calendar = {
  listCalendars: () => request<{ calendars: CalendarInfo[] }>('/calendar/list'),
  getEvents: (timeMin?: string, timeMax?: string) => {
    const params = new URLSearchParams();
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
    const query = params.toString();
    return request<{ events: CalendarEvent[] }>(`/calendar/events${query ? `?${query}` : ''}`);
  },
  createEvent: (event: CreateEventInput) =>
    request<{ event: CalendarEvent }>('/calendar/events', {
      method: 'POST',
      body: JSON.stringify(event),
    }),
  updateEvent: (id: string, event: Partial<CreateEventInput>) =>
    request<{ event: CalendarEvent }>(`/calendar/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event),
    }),
  deleteEvent: (id: string, calendarId?: string) =>
    request<{ success: boolean }>(`/calendar/events/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ calendarId }),
    }),
};

// Server auth helpers
export const auth = {
  startCalendarConnect: () => request<{ url: string }>('/auth/google/start', { method: 'POST' }),
};

// Goals
export const goals = {
  list: () => request<{ goals: Goal[] }>('/goals'),
  create: (goal: CreateGoalInput) =>
    request<{ goal: Goal }>('/goals', {
      method: 'POST',
      body: JSON.stringify(goal),
    }),
  update: (id: string, goal: Partial<CreateGoalInput>) =>
    request<{ goal: Goal }>(`/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(goal),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/goals/${id}`, {
      method: 'DELETE',
    }),
};

// Settings
export const settings = {
  get: () => request<{ settings: Settings | null }>('/settings'),
  update: (data: UpdateSettingsInput) =>
    request<{ settings: Settings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  resetEbkCalendar: () =>
    request<{ newCalendar: { id: string; name: string }; oldCalendarId: string | null }>('/settings/reset-ebk-calendar', {
      method: 'POST',
    }),
};

// Scheduler
export const scheduler = {
  generate: (weekStart?: string, weekEnd?: string) => 
    request<{ 
      blocks: ProposedBlock[]; 
      availableMinutes: number;
      requestedMinutes: number;
      insufficientTime?: InsufficientTimeInfo;
    }>('/scheduler/generate', {
      method: 'POST',
      body: JSON.stringify({ weekStart, weekEnd }),
    }),
  apply: (blocks: ProposedBlock[]) =>
    request<{ applied: AppliedBlock[] }>('/scheduler/apply', {
      method: 'POST',
      body: JSON.stringify({ blocks }),
    }),
};

// Reschedule
export const reschedule = {
  request: (message: string) =>
    request<RescheduleResponse>('/reschedule', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  apply: (operations: RescheduleOperation[], reason?: string) =>
    request<{ success: boolean; applied: number; blocksMovedCount: number; minutesRecovered: number }>('/reschedule/apply', {
      method: 'POST',
      body: JSON.stringify({ operations, reason: reason || 'User confirmed changes' }),
    }),
};

// Voice
export const voice = {
  stt: async (audioBlob: Blob) => {
    const token = await getIdToken();
    const formData = new FormData();
    formData.append('audio', audioBlob);
    const response = await fetch(`${API_BASE}/voice/stt`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return response.json();
  },
  tts: async (text: string) => {
    const token = await getIdToken();
    const response = await fetch(`${API_BASE}/voice/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
    return response.blob();
  },
};

// Stats
export const stats = {
  get: (month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month.toString());
    if (year) params.set('year', year.toString());
    const query = params.toString();
    return request<StatsData>(`/stats${query ? `?${query}` : ''}`);
  },
  wrapped: (month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month.toString());
    if (year) params.set('year', year.toString());
    const query = params.toString();
    return request<WrappedData>(`/stats/wrapped${query ? `?${query}` : ''}`);
  },
  availableMonths: () =>
    request<{ availableMonths: AvailableMonth[] }>('/stats/available-months'),
};

export interface AvailableMonth {
  month: number;
  year: number;
  label: string;
  blockCount: number;
}

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  isEliteBall?: boolean;
  goalId?: string;
  blockId?: string;
  calendarId?: string;
  calendarName?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  start: string;
  end: string;
}

export interface Goal {
  id: string;
  userId: string;
  name: string;
  targetMinutesPerWeek: number;
  createdAt: string;
  preferredTime?: {
    start: string; // HH:mm
    end: string;   // HH:mm
  };
  sessionsPerWeek?: number;
}

export interface CreateGoalInput {
  name: string;
  targetMinutesPerWeek: number;
  preferredTime?: {
    start: string;
    end: string;
  };
  sessionsPerWeek?: number;
}

export interface Settings {
  id: string;
  userId: string;
  workingWindow: WorkingWindow;
  blockLengthMinutes: number;
  timezone: string;
  minGapMinutes: number;
  selectedCalendars: string[] | null; // null means all calendars
  ebkCalendarName?: string;  // Custom name for EBK calendar
  ebkCalendarId?: string;    // ID of created EBK calendar
}

export interface WorkingWindow {
  [day: string]: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

export interface UpdateSettingsInput {
  workingWindow?: WorkingWindow;
  blockLengthMinutes?: number;
  timezone?: string;
  minGapMinutes?: number;
  selectedCalendars?: string[] | null;
  ebkCalendarName?: string;
}

export interface ProposedBlock {
  goalId: string;
  goalName: string;
  start: string;
  end: string;
  duration: number;
}

export interface AppliedBlock {
  id: string;
  calendarEventId: string;
  goalId: string;
  start: string;
  end: string;
}

export interface InsufficientTimeInfo {
  requested: number;
  available: number;
  unscheduledGoals: { goalId: string; name: string; remainingMinutes: number }[];
}

export interface RescheduleOperation {
  op: 'move' | 'create' | 'delete';
  blockId?: string;
  goalName?: string;
  from?: string;
  to?: string;
  start?: string;
  end?: string;
}

export interface RescheduleResponse {
  intent: string;
  reason: string;
  operations: RescheduleOperation[];
  user_message: string;
  rawContextChars: number;
  compressedChars: number;
}

export interface StatsData {
  totalFocusedHours: number;
  blocksCompleted: number;
  blocksSkipped: number;
  rescheduleCount: number;
  recoveredMinutes: number;
  goalBreakdown: { goalId: string; name: string; hours: number }[];
}

export interface WrappedData {
  month: string;
  totalFocusedHours: number;
  blocksCompleted: number;
  blocksSkipped: number;
  rescheduleCount: number;
  recoveredMinutes: number;
  peakProductivityDay: string;
  peakProductivityHour: string;
  goalBreakdown: { goalId: string; name: string; hours: number }[];
  achievements: string[];
  weeklyHours: { week: number; hours: number; label: string }[];
  weekdayWeekendSplit: {
    weekdayHours: number;
    weekdayPercent: number;
    weekendHours: number;
    weekendPercent: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  persona: {
    name: string;
    description: string;
    image: string;
  };
}
