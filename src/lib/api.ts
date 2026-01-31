const API_BASE = '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Request failed' };
    }

    return { data };
  } catch (err: any) {
    return { error: err.message || 'Network error' };
  }
}

// Auth
export const auth = {
  me: () => request<{ user: User | null }>('/auth/me'),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  loginUrl: () => `${API_BASE}/auth/google`,
};

// Calendar
export const calendar = {
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
  deleteEvent: (id: string) =>
    request<{ success: boolean }>(`/calendar/events/${id}`, {
      method: 'DELETE',
    }),
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
};

// Scheduler
export const scheduler = {
  generate: () => request<{ blocks: ProposedBlock[]; insufficientTime?: InsufficientTimeInfo }>('/scheduler/generate', {
    method: 'POST',
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
  apply: (operations: RescheduleOperation[]) =>
    request<{ success: boolean; applied: number }>('/reschedule/apply', {
      method: 'POST',
      body: JSON.stringify({ operations }),
    }),
};

// Voice
export const voice = {
  stt: (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    return fetch(`${API_BASE}/voice/stt`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then(res => res.json());
  },
  tts: (text: string) =>
    fetch(`${API_BASE}/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      credentials: 'include',
    }).then(res => res.blob()),
};

// Stats
export const stats = {
  get: () => request<StatsData>('/stats'),
  wrapped: () => request<WrappedData>('/stats/wrapped'),
};

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
}

export interface CreateGoalInput {
  name: string;
  targetMinutesPerWeek: number;
}

export interface Settings {
  id: string;
  userId: string;
  workingWindow: WorkingWindow;
  blockLengthMinutes: number;
  timezone: string;
  minGapMinutes: number;
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
  tokensSaved: number;
  peakProductivityDay: string;
  peakProductivityHour: string;
  goalBreakdown: { goalId: string; name: string; hours: number }[];
  achievements: string[];
}
