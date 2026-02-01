import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, BookOpen, Clock, Zap, Trash2, Loader2, Play, X, Check, AlertTriangle, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../components/AuthProvider';
import { useGoals } from '../hooks/useGoals';
import { useScheduler } from '../hooks/useScheduler';
import { useSettings } from '../hooks/useSettings';
import { calendar, CalendarEvent, Goal, ProposedBlock } from '../lib/api';
import { DndContext, DragEndEvent, useDraggable, useDroppable, DragOverlay } from '@dnd-kit/core';
import { useTheme } from '../components/ThemeProvider';
import matchaLatte from '../assets/matcha/matcha-latte-152.png';
import matchaSet from '../assets/matcha/matcha-set-186.png';
import newjeansHeader from '../assets/newjeans/newjeans-header-40.png';
import marioHeader from '../assets/mario/mario-header-40.png';
import lebronHeader from '../assets/lebron/lebron-header-40.png';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500', 'bg-cyan-500'];

// Generate a cache key for a week offset
function getWeekCacheKey(offset: number): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offset * 7));
  // Use ISO week format: YYYY-Www
  const year = monday.getFullYear();
  const weekNum = getISOWeek(monday);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const { colorTheme } = useTheme();
  const { goals, loading: goalsLoading, createGoal, deleteGoal } = useGoals();
  const { 
    proposedBlocks, 
    insufficientTime, 
    availableMinutes,
    requestedMinutes,
    loading: schedulerLoading, 
    applying, 
    generate, 
    apply, 
    clear,
    setProposedBlocks,
    hasProposedBlocks 
  } = useScheduler();
  
  const { settings } = useSettings();
  
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ 
    name: '', 
    hours: '',
    preferredStart: '',
    preferredEnd: '',
    sessionsPerWeek: ''
  });
  const [saving, setSaving] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = previous, +1 = next
  
  // Client-side cache for week events
  const weekCacheRef = useRef<Map<string, CalendarEvent[]>>(new Map());
  const pendingCalendarRefreshRef = useRef(false);
  const prevAuthRef = useRef<boolean>(false);
  const calendarRetryRef = useRef(0);

  // Redirect to onboarding if not completed
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('ebk-onboarding-complete');
    if (!onboardingComplete && !authLoading && !isAuthenticated) {
      navigate('/onboarding');
    }
  }, [navigate, authLoading, isAuthenticated]);

  const getWeekDates = useCallback((offset: number = 0) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { monday, sunday };
  }, []);

  // Fetch events for a specific week offset (with caching)
  const fetchWeekEvents = useCallback(async (offset: number, skipCache = false): Promise<CalendarEvent[]> => {
    const cacheKey = getWeekCacheKey(offset);
    
    // Check cache first (unless explicitly skipping)
    if (!skipCache && weekCacheRef.current.has(cacheKey)) {
      return weekCacheRef.current.get(cacheKey)!;
    }
    
    const { monday, sunday } = getWeekDates(offset);
    const result = await calendar.getEvents(monday.toISOString(), sunday.toISOString());
    
    if (result.data?.events) {
      // Store in cache
      weekCacheRef.current.set(cacheKey, result.data.events);
      calendarRetryRef.current = 0;
      return result.data.events;
    }

    if (result.error) {
      setCalendarError(result.error);
      if (calendarRetryRef.current < 1) {
        calendarRetryRef.current += 1;
        setTimeout(() => {
          fetchCalendarEvents(true);
        }, 1000);
      }
    }
    
    return [];
  }, [getWeekDates]);

  // Prefetch adjacent weeks in background
  const prefetchAdjacentWeeks = useCallback(async (currentOffset: number) => {
    // Prefetch previous and next week silently
    const prefetchOffsets = [currentOffset - 1, currentOffset + 1];
    
    for (const offset of prefetchOffsets) {
      const cacheKey = getWeekCacheKey(offset);
      if (!weekCacheRef.current.has(cacheKey)) {
        // Fetch in background without awaiting
        fetchWeekEvents(offset).catch(() => {
          // Silently ignore prefetch errors
        });
      }
    }
  }, [fetchWeekEvents]);

  // Fetch calendar events when authenticated or week changes
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchCalendarEvents();
    }
  }, [authLoading, isAuthenticated, weekOffset]);

  useEffect(() => {
    if (prevAuthRef.current !== isAuthenticated) {
      if (isAuthenticated) {
        weekCacheRef.current.clear();
        fetchCalendarEvents(true);
        if (pendingCalendarRefreshRef.current) {
          pendingCalendarRefreshRef.current = false;
        }
      }
      prevAuthRef.current = isAuthenticated;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      pendingCalendarRefreshRef.current = true;
      if (isAuthenticated) {
        weekCacheRef.current.clear();
        fetchCalendarEvents(true);
        pendingCalendarRefreshRef.current = false;
      }
      params.delete('calendar');
      const nextUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (calendarError === 'Calendar not connected') {
      toast.error('Connect Google Calendar in Settings to load events.');
    } else if (calendarError) {
      toast.error(calendarError);
    }
  }, [calendarError]);

  const fetchCalendarEvents = async (forceRefresh = false) => {
    const cacheKey = getWeekCacheKey(weekOffset);
    
    // Use cache if available and not forcing refresh
    if (!forceRefresh && weekCacheRef.current.has(cacheKey)) {
      setCalendarEvents(weekCacheRef.current.get(cacheKey)!);
      // Still prefetch adjacent weeks
      prefetchAdjacentWeeks(weekOffset);
      return;
    }
    
    setEventsLoading(true);
    setCalendarError(null);
    const events = await fetchWeekEvents(weekOffset, forceRefresh);
    setCalendarEvents(events);
    setEventsLoading(false);
    
    // Prefetch adjacent weeks after loading current week
    prefetchAdjacentWeeks(weekOffset);
  };

  const handleAddGoal = async () => {
    if (!newGoal.name || !newGoal.hours) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!isAuthenticated) {
      toast.error('Please sign in to create goals');
      return;
    }

    setSaving(true);
    const goalData: any = {
      name: newGoal.name,
      targetMinutesPerWeek: parseInt(newGoal.hours) * 60,
    };

    if (newGoal.preferredStart && newGoal.preferredEnd) {
      goalData.preferredTime = {
        start: newGoal.preferredStart,
        end: newGoal.preferredEnd,
      };
    }

    if (newGoal.sessionsPerWeek) {
      goalData.sessionsPerWeek = parseInt(newGoal.sessionsPerWeek);
    }

    const goal = await createGoal(goalData);
    setSaving(false);

    if (goal) {
      setNewGoal({ name: '', hours: '', preferredStart: '', preferredEnd: '', sessionsPerWeek: '' });
      setShowAddGoal(false);
      toast.success('Goal added!');
    } else {
      toast.error('Failed to create goal');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    const success = await deleteGoal(id);
    if (success) {
      toast.success('Goal deleted');
    } else {
      toast.error('Failed to delete goal');
    }
  };

  const handleGenerate = async () => {
    const { monday, sunday } = getWeekDates(weekOffset);
    const success = await generate(monday.toISOString(), sunday.toISOString());
    if (success) {
      toast.success('Schedule generated! Review the proposed blocks below.');
    } else {
      toast.error('Failed to generate schedule');
    }
  };

  const handleApply = async () => {
    const success = await apply();
    if (success) {
      toast.success('Focus blocks added to your calendar!');
      // Clear cache for this week and force refresh
      weekCacheRef.current.delete(getWeekCacheKey(weekOffset));
      fetchCalendarEvents(true);
    } else {
      toast.error('Failed to apply schedule');
    }
  };

  const getGoalColor = (index: number) => COLORS[index % COLORS.length];
  
  const getGoalColorByName = (goalName: string) => {
    const index = goals.findIndex(g => g.name === goalName);
    return COLORS[index >= 0 ? index % COLORS.length : 0];
  };

  const timeToMinutes = (time: string) => {
    const date = new Date(time);
    return date.getHours() * 60 + date.getMinutes();
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDayFromISO = (isoString: string) => {
    const date = new Date(isoString);
    const dayIndex = date.getDay();
    // Convert from 0=Sunday to 0=Monday
    const mondayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    return DAYS_OF_WEEK[mondayIndex];
  };

  // Get week date range based on offset
  const getWeekDateRange = () => {
    const { monday, sunday } = getWeekDates(weekOffset);
    
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString('en-US', options)} - ${sunday.toLocaleDateString('en-US', options)}, ${monday.getFullYear()}`;
  };

  const goToPreviousWeek = () => setWeekOffset(prev => prev - 1);
  const goToNextWeek = () => setWeekOffset(prev => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  const handleDeleteAllBlocks = async () => {
    if (focusBlocks.length === 0) {
      toast.info('No focus blocks to delete');
      return;
    }

    const blockCount = focusBlocks.length;
    let deletedCount = 0;
    const batchSize = 4;
    const perDeleteDelayMs = 800;
    const batchDelayMs = 3000;
    const maxDeletesPerRun = 20;
    setDeletingBlocks(true);
    try {
      // Delete all focus blocks for the current week (batched + throttled)
      for (let startIndex = 0; startIndex < focusBlocks.length; startIndex += batchSize) {
        const batch = focusBlocks.slice(startIndex, startIndex + batchSize);
        for (const block of batch) {
          const result = await calendar.deleteEvent(block.id, block.calendarId);
          if (result.error) {
            throw new Error(result.error);
          }
          deletedCount += 1;
          if (deletedCount >= maxDeletesPerRun && focusBlocks.length > deletedCount) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, perDeleteDelayMs));
        }
        if (deletedCount >= maxDeletesPerRun) {
          break;
        }
        if (startIndex + batchSize < focusBlocks.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelayMs));
        }
      }

      // Small delay for Google Calendar API eventual consistency
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clear cache for this week and refresh calendar events
      weekCacheRef.current.delete(getWeekCacheKey(weekOffset));
      await fetchCalendarEvents(true);

      if (deletedCount < blockCount) {
        toast.info(`Deleted ${deletedCount} of ${blockCount}. Rate limits require multiple passes—run delete again in a minute.`);
        return;
      }
      toast.success(`Deleted ${blockCount} focus block${blockCount > 1 ? 's' : ''}`);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting blocks:', error);
      const partial = deletedCount > 0 ? ` (deleted ${deletedCount} of ${blockCount})` : '';
      toast.error(`Failed to delete all blocks${partial}. Try again in a minute.`);
    } finally {
      setDeletingBlocks(false);
    }
  };

  const totalGoalHours = goals.reduce((sum, g) => sum + g.targetMinutesPerWeek / 60, 0);
  const focusBlocks = calendarEvents.filter(e => e.isEliteBall);

  // Drag and drop state
  const [activeDragBlock, setActiveDragBlock] = useState<ProposedBlock | null>(null);

  // Delete all blocks state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBlocks, setDeletingBlocks] = useState(false);

  // Handle drag end for pending blocks
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragBlock(null);
    
    if (!over) return;
    
    // Parse the drop target ID (format: "slot-{day}-{hour}")
    const overId = over.id as string;
    if (!overId.startsWith('slot-')) return;
    
    const [, day, hourStr] = overId.split('-');
    const hour = parseInt(hourStr);
    
    // Get the block index from active id (format: "block-{index}")
    const activeId = active.id as string;
    if (!activeId.startsWith('block-')) return;
    
    const blockIndex = parseInt(activeId.split('-')[1]);
    const block = proposedBlocks[blockIndex];
    if (!block) return;
    
    // Calculate new start/end times
    const { monday } = getWeekDates(weekOffset);
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    const newDate = new Date(monday);
    newDate.setDate(monday.getDate() + dayIndex);
    newDate.setHours(hour, 0, 0, 0);
    
    const newStart = new Date(newDate);
    const newEnd = new Date(newDate.getTime() + block.duration * 60000);
    
    // Check for overlap with calendar events
    const hasOverlap = calendarEvents.some(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return newStart < eventEnd && newEnd > eventStart;
    });
    
    if (hasOverlap) {
      toast.error('Cannot place block here - overlaps with existing event');
      return;
    }
    
    // Update the block
    const updatedBlocks = [...proposedBlocks];
    updatedBlocks[blockIndex] = {
      ...block,
      start: newStart.toISOString(),
      end: newEnd.toISOString(),
    };
    setProposedBlocks(updatedBlocks);
    toast.success('Block moved successfully');
  };

  // Calculate working hours range from settings
  const getWorkingHoursRange = useCallback(() => {
    if (!settings?.workingWindow) {
      return { startHour: 9, endHour: 17 }; // Default 9 AM - 5 PM
    }
    
    let earliestStart = 24;
    let latestEnd = 0;
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const dayWindow = settings.workingWindow[day];
      if (dayWindow?.enabled) {
        const [startH] = dayWindow.start.split(':').map(Number);
        const [endH] = dayWindow.end.split(':').map(Number);
        if (startH < earliestStart) earliestStart = startH;
        if (endH > latestEnd) latestEnd = endH;
      }
    }
    
    // If no days enabled, use defaults
    if (earliestStart === 24) earliestStart = 9;
    if (latestEnd === 0) latestEnd = 17;
    
    return { startHour: earliestStart, endHour: latestEnd };
  }, [settings]);

  const { startHour: workingStartHour, endHour: workingEndHour } = getWorkingHoursRange();

  // Calculate total schedulable time in the week (matching scheduler logic)
  const calculateFreeTime = useCallback(() => {
    if (!settings?.workingWindow) {
      return { totalWorkingMinutes: 0, busyMinutes: 0, freeMinutes: 0 };
    }

    const { monday } = getWeekDates(weekOffset);
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const minGapMinutes = settings.minGapMinutes || 5;
    const blockLengthMinutes = settings.blockLengthMinutes || 30;

    // Collect all free slots
    const allFreeSlots: { start: Date; end: Date }[] = [];

    // For each day, compute free slots like the scheduler does
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const dayName = dayNames[dayIdx];
      const dayWindow = settings.workingWindow[dayName];

      if (!dayWindow?.enabled) continue;

      // Get working window for this day
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + dayIdx);

      const [startH, startM] = dayWindow.start.split(':').map(Number);
      const [endH, endM] = dayWindow.end.split(':').map(Number);

      const windowStart = new Date(dayDate);
      windowStart.setHours(startH, startM || 0, 0, 0);

      const windowEnd = new Date(dayDate);
      windowEnd.setHours(endH, endM || 0, 0, 0);

      // Get busy events for this day (include ALL events including focus blocks)
      // This ensures existing focus blocks reduce available time
      const dayEvents = calendarEvents
        .filter(e => {
          const eventStart = new Date(e.start);
          const eventEnd = new Date(e.end);
          // Event overlaps with this day's working window
          return eventEnd > windowStart && eventStart < windowEnd;
        })
        .map(e => ({
          start: new Date(Math.max(new Date(e.start).getTime(), windowStart.getTime())),
          end: new Date(Math.min(new Date(e.end).getTime(), windowEnd.getTime())),
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      // Compute free slots for this day
      let current = new Date(windowStart);

      for (const busy of dayEvents) {
        if (current < busy.start) {
          // Free slot before this busy period (minus gap)
          const gapEnd = new Date(busy.start.getTime() - minGapMinutes * 60 * 1000);
          if (gapEnd > current) {
            allFreeSlots.push({ start: new Date(current), end: gapEnd });
          }
        }
        // Move past busy period plus gap
        const afterBusy = new Date(busy.end.getTime() + minGapMinutes * 60 * 1000);
        if (afterBusy > current) {
          current = afterBusy;
        }
      }

      // Add remaining time after last busy period
      if (current < windowEnd) {
        allFreeSlots.push({ start: current, end: new Date(windowEnd) });
      }
    }

    // Calculate schedulable minutes (only counting time that can actually fit blocks)
    let totalSchedulableMinutes = 0;
    for (const slot of allFreeSlots) {
      const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
      if (slotDuration >= blockLengthMinutes) {
        // Calculate how many blocks can fit (accounting for gaps between blocks)
        const blockWithGap = blockLengthMinutes + minGapMinutes;
        const numBlocks = Math.floor((slotDuration + minGapMinutes) / blockWithGap);
        totalSchedulableMinutes += numBlocks * blockLengthMinutes;
      }
    }

    return { totalWorkingMinutes: 0, busyMinutes: 0, freeMinutes: Math.max(0, totalSchedulableMinutes) };
  }, [settings, calendarEvents, weekOffset, getWeekDates]);

  const { freeMinutes } = calculateFreeTime();
  const freeHours = Math.floor(freeMinutes / 60);
  const freeRemainingMinutes = Math.round(freeMinutes % 60);

  // Draggable Block Component
  const DraggableBlock = ({ block, index }: { block: ProposedBlock; index: number }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `block-${index}`,
    });
    
    const style = transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      opacity: isDragging ? 0.5 : 1,
    } : undefined;
    
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="absolute inset-x-0 rounded-md p-2 bg-green-500/30 border-2 border-dashed border-green-500 cursor-grab active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <div className="flex items-start gap-1">
          <GripVertical className="h-3 w-3 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{block.goalName}</p>
            <p className="text-xs opacity-75">
              {formatTime(block.start)} - {formatTime(block.end)}
            </p>
            <span className="text-[10px] text-green-600 dark:text-green-400">Drag to move</span>
          </div>
        </div>
      </div>
    );
  };

  // Droppable Time Slot Component
  const DroppableSlot = ({ day, hour, children }: { day: string; hour: number; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: `slot-${day}-${hour}`,
    });
    
    return (
      <div 
        ref={setNodeRef} 
        className={`relative min-h-[60px] ${isOver ? 'bg-green-500/20 ring-2 ring-green-500 ring-inset' : ''}`}
      >
        {children}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Your Weekly Plan</h1>
          <p className="text-muted-foreground">
            Week of {getWeekDateRange()}
          </p>
        </div>

        {!isAuthenticated && (
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="py-4">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Sign in with Google Calendar to see your real events and create focus blocks.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Goals</CardDescription>
              <CardTitle className="text-3xl">{goals.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Focus Blocks</CardDescription>
              <CardTitle className="text-3xl">{focusBlocks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Target Hours</CardDescription>
              <CardTitle className="text-3xl">{totalGoalHours}h</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Calendar Events</CardDescription>
              <CardTitle className="text-3xl">{calendarEvents.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Goals Management */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <CardTitle>Weekly Goals</CardTitle>
                  {colorTheme === 'matcha' && (
                    <img
                      src={matchaLatte}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none h-10 w-10 bg-transparent"
                    />
                  )}
                  {colorTheme === 'newjeans' && (
                    <img
                      src={newjeansHeader}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none h-10 w-10 bg-transparent"
                    />
                  )}
                  {colorTheme === 'mario' && (
                    <img
                      src={marioHeader}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none h-10 w-10 bg-transparent"
                    />
                  )}
                  {colorTheme === 'lebron' && (
                    <img
                      src={lebronHeader}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none h-10 w-auto bg-transparent"
                    />
                  )}
                </div>
                <CardDescription>Manage your focus areas for this week</CardDescription>
              </div>
              <Dialog open={showAddGoal} onOpenChange={setShowAddGoal}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={!isAuthenticated}>
                    <Plus className="h-4 w-4" />
                    Add Goal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Goal</DialogTitle>
                    <DialogDescription>
                      Set a new focus area and target hours for the week
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Subject/Goal Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., CS251, Math Homework, Project X"
                        value={newGoal.name}
                        onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hours">Hours Per Week</Label>
                        <Input
                          id="hours"
                          type="number"
                          min="1"
                          max="40"
                          placeholder="e.g., 10"
                          value={newGoal.hours}
                          onChange={(e) => setNewGoal({ ...newGoal, hours: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sessions">Sessions / Week (Optional)</Label>
                        <Input
                          id="sessions"
                          type="number"
                          min="1"
                          max="14"
                          placeholder="e.g., 3"
                          value={newGoal.sessionsPerWeek}
                          onChange={(e) => setNewGoal({ ...newGoal, sessionsPerWeek: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="preferredStart">Preferred Start (Optional)</Label>
                        <Input
                          id="preferredStart"
                          type="time"
                          value={newGoal.preferredStart}
                          onChange={(e) => setNewGoal({ ...newGoal, preferredStart: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="preferredEnd">Preferred End (Optional)</Label>
                        <Input
                          id="preferredEnd"
                          type="time"
                          value={newGoal.preferredEnd}
                          onChange={(e) => setNewGoal({ ...newGoal, preferredEnd: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button onClick={handleAddGoal} className="w-full" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add Goal'
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative z-10">
              {goalsLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading goals...</p>
                </div>
              ) : goals.length === 0 ? (
                <div className="py-12 text-center">
                  <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No goals yet. Add your first goal to get started!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {goals.map((goal, index) => (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${getGoalColor(index)}`} />
                        <div>
                          <p className="font-medium">{goal.name}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="outline" className="text-xs font-normal">
                              Target: {goal.targetMinutesPerWeek / 60}h/week
                            </Badge>
                            {goal.sessionsPerWeek && (
                              <Badge variant="secondary" className="text-xs font-normal">
                                {goal.sessionsPerWeek} sessions/week
                              </Badge>
                            )}
                            {goal.preferredTime && (
                              <Badge variant="secondary" className="text-xs font-normal">
                                🕒 {goal.preferredTime.start} - {goal.preferredTime.end}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteGoal(goal.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Scheduler Section */}
        {isAuthenticated && goals.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-green-500" />
                    Schedule Generator
                  </CardTitle>
                  <CardDescription>
                    {hasProposedBlocks ? (
                      <span>
                        {Math.round(availableMinutes / 60)}h free time available • 
                        {Math.round(requestedMinutes / 60)}h requested • 
                        {proposedBlocks.length} blocks generated
                      </span>
                    ) : (
                      'Automatically fill your free time with focus blocks for your goals'
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {hasProposedBlocks && (
                    <Button variant="outline" onClick={clear} disabled={applying}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                  {!hasProposedBlocks && (
                    <Button 
                      onClick={handleGenerate}
                      disabled={schedulerLoading}
                      className="bg-gradient-to-r from-purple-500 to-blue-500"
                    >
                      {schedulerLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Generate Schedule
                        </>
                      )}
                    </Button>
                  )}
                  <Button 
                    onClick={handleApply} 
                    disabled={applying || !hasProposedBlocks}
                  >
                    {applying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Apply to Calendar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {hasProposedBlocks && (
              <CardContent>
                {insufficientTime && (
                  <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-600 dark:text-yellow-400">
                          Not enough time for all goals
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Requested {Math.round(insufficientTime.requested / 60)}h, but only {Math.round(insufficientTime.available / 60)}h available.
                        </p>
                        <ul className="mt-2 text-sm text-muted-foreground">
                          {insufficientTime.unscheduledGoals.map(g => (
                            <li key={g.goalId}>
                              {g.name}: missing {Math.round(g.remainingMinutes / 60)}h
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-3">
                    {proposedBlocks.length} focus blocks to be created:
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {proposedBlocks.slice(0, 12).map((block, index) => {
                      const startDate = new Date(block.start);
                      const endDate = new Date(block.end);
                      return (
                        <div 
                          key={index} 
                          className={`rounded-lg border p-3 ${getGoalColorByName(block.goalName)}/10 border-l-4`}
                          style={{ borderLeftColor: getGoalColorByName(block.goalName).replace('bg-', '') }}
                        >
                          <p className="font-medium text-sm">{block.goalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {proposedBlocks.length > 12 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      ...and {proposedBlocks.length - 12} more blocks
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Weekly Calendar View */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-3">
                  Weekly Schedule
                  {isAuthenticated && settings?.workingWindow && (
                    <span className="text-sm font-normal text-green-600 dark:text-green-400">
                      {freeHours}h {freeRemainingMinutes}m available
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {isAuthenticated
                    ? `${getWeekDateRange()} • ${calendarEvents.length} events`
                    : 'Sign in to see your real calendar events'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={eventsLoading || focusBlocks.length === 0}
                      title="Delete all focus blocks"
                      className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete All Focus Blocks?</DialogTitle>
                      <DialogDescription>
                        This will delete {focusBlocks.length} focus block{focusBlocks.length !== 1 ? 's' : ''} from this week.
                        This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deletingBlocks}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDeleteAllBlocks} disabled={deletingBlocks}>
                        {deletingBlocks ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Delete All
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPreviousWeek}
                  disabled={eventsLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToCurrentWeek}
                  disabled={eventsLoading || weekOffset === 0}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNextWeek}
                  disabled={eventsLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading calendar...</p>
              </div>
            ) : (
              <DndContext onDragEnd={handleDragEnd} onDragStart={(event) => {
                const activeId = event.active.id as string;
                if (activeId.startsWith('block-')) {
                  const blockIndex = parseInt(activeId.split('-')[1]);
                  setActiveDragBlock(proposedBlocks[blockIndex] || null);
                }
              }}>
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Days Header */}
                  <div className="mb-4 grid grid-cols-8 gap-2">
                    <div className="text-sm font-medium text-muted-foreground">Time</div>
                    {DAYS_OF_WEEK.map((day, idx) => {
                      const { monday } = getWeekDates(weekOffset);
                      const dayDate = new Date(monday);
                      dayDate.setDate(monday.getDate() + idx);
                      const isToday = dayDate.toDateString() === new Date().toDateString();
                      
                      return (
                        <div 
                          key={day} 
                          className={`text-center text-sm font-medium ${isToday ? 'text-purple-500' : ''}`}
                        >
                          <div>{day.slice(0, 3)}</div>
                          <div className={`text-xs ${isToday ? 'bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto' : 'text-muted-foreground'}`}>
                            {dayDate.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Time Slots */}
                  <div className="space-y-1">
                    {Array.from({ length: workingEndHour - workingStartHour }, (_, i) => {
                      const hour = workingStartHour + i;
                      const timeStr = `${hour.toString().padStart(2, '0')}:00`;

                      return (
                        <div key={hour} className="grid grid-cols-8 gap-2">
                          <div className="py-2 text-xs text-muted-foreground">
                            {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                          </div>
                          {DAYS_OF_WEEK.map((day) => {
                            // Find calendar events for this day/time
                            const dayEvents = calendarEvents.filter((event) => {
                              const eventDay = getDayFromISO(event.start);
                              const eventStartMinutes = timeToMinutes(event.start);
                              const eventEndMinutes = timeToMinutes(event.end);
                              const slotMinutes = hour * 60;
                              
                              return (
                                eventDay === day &&
                                eventStartMinutes <= slotMinutes &&
                                eventEndMinutes > slotMinutes
                              );
                            });

                            // Find proposed blocks for this day/time (preview before applying)
                            const dayProposedBlocks = proposedBlocks.filter((block) => {
                              const blockDay = getDayFromISO(block.start);
                              const blockStartMinutes = timeToMinutes(block.start);
                              const blockEndMinutes = timeToMinutes(block.end);
                              const slotMinutes = hour * 60;
                              
                              return (
                                blockDay === day &&
                                blockStartMinutes <= slotMinutes &&
                                blockEndMinutes > slotMinutes
                              );
                            });

                            return (
                              <DroppableSlot key={day} day={day} hour={hour}>
                                {/* Existing calendar events */}
                                {dayEvents.map((event) => (
                                  <div
                                    key={event.id}
                                    className={`absolute inset-x-0 rounded-md p-2 ${
                                      event.isEliteBall
                                        ? 'bg-purple-500/20 border-l-4 border-purple-500'
                                        : 'border-2 border-dashed border-muted-foreground bg-muted/30'
                                    }`}
                                  >
                                    <p className="text-xs font-medium truncate">{event.title}</p>
                                    <p className="text-xs opacity-75">
                                      {formatTime(event.start)} - {formatTime(event.end)}
                                    </p>
                                  </div>
                                ))}

                                {/* Proposed blocks (pending - draggable) */}
                                {dayProposedBlocks.map((block) => {
                                  const blockIndex = proposedBlocks.findIndex(
                                    b => b.start === block.start && b.goalId === block.goalId
                                  );
                                  return (
                                    <DraggableBlock key={`proposed-${blockIndex}`} block={block} index={blockIndex} />
                                  );
                                })}

                                {dayEvents.length === 0 && dayProposedBlocks.length === 0 && (
                                  <div className="h-full rounded-md border border-dashed border-border bg-muted/10" />
                                )}
                              </DroppableSlot>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              </DndContext>
            )}

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm text-muted-foreground">Focus Blocks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-md border-2 border-dashed border-muted-foreground" />
                <span className="text-sm text-muted-foreground">Calendar Events</span>
              </div>
              {hasProposedBlocks && (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-md border-2 border-dashed border-green-500 bg-green-500/30" />
                  <span className="text-sm text-muted-foreground">Pending - drag to reposition, then Apply</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card className="cursor-pointer transition-all hover:border-purple-500" onClick={() => navigate('/reschedule')}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10">
                <Zap className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h3 className="font-medium">AI Rescheduler</h3>
                <p className="text-sm text-muted-foreground">
                  Need to adjust your schedule? Chat with AI
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-all hover:border-blue-500" onClick={() => navigate('/stats')}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-medium">View Statistics</h3>
                <p className="text-sm text-muted-foreground">
                  See your productivity insights
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
