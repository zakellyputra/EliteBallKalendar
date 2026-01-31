import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, BookOpen, Clock, Zap, Trash2, Loader2, Play, X, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../components/AuthProvider';
import { useGoals } from '../hooks/useGoals';
import { useScheduler } from '../hooks/useScheduler';
import { calendar, CalendarEvent, Goal } from '../lib/api';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500', 'bg-cyan-500'];

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const { goals, loading: goalsLoading, createGoal, deleteGoal } = useGoals();
  const { 
    proposedBlocks, 
    insufficientTime, 
    loading: schedulerLoading, 
    applying, 
    generate, 
    apply, 
    clear, 
    hasProposedBlocks 
  } = useScheduler();
  
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', hours: '' });
  const [saving, setSaving] = useState(false);

  // Redirect to onboarding if not completed
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('ebk-onboarding-complete');
    if (!onboardingComplete && !authLoading && !isAuthenticated) {
      navigate('/onboarding');
    }
  }, [navigate, authLoading, isAuthenticated]);

  // Fetch calendar events when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendarEvents();
    }
  }, [isAuthenticated]);

  const fetchCalendarEvents = async () => {
    setEventsLoading(true);
    const result = await calendar.getEvents();
    if (result.data?.events) {
      setCalendarEvents(result.data.events);
    }
    setEventsLoading(false);
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
    const goal = await createGoal({
      name: newGoal.name,
      targetMinutesPerWeek: parseInt(newGoal.hours) * 60,
    });
    setSaving(false);

    if (goal) {
      setNewGoal({ name: '', hours: '' });
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
    const success = await generate();
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
      fetchCalendarEvents();
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

  // Get current week date range
  const getWeekDateRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString('en-US', options)} - ${sunday.toLocaleDateString('en-US', options)}, ${now.getFullYear()}`;
  };

  const totalGoalHours = goals.reduce((sum, g) => sum + g.targetMinutesPerWeek / 60, 0);
  const focusBlocks = calendarEvents.filter(e => e.isEliteBall);

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
                <CardTitle>Weekly Goals</CardTitle>
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
                        <p className="text-sm text-muted-foreground">
                          Target: {goal.targetMinutesPerWeek / 60} hours/week
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{goal.targetMinutesPerWeek / 60}h/week</Badge>
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
                    Automatically fill your free time with focus blocks for your goals
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {hasProposedBlocks && (
                    <>
                      <Button variant="outline" onClick={clear} disabled={applying}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleApply} 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={applying}
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
                    </>
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
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>
              {isAuthenticated 
                ? 'Your calendar events and focus blocks'
                : 'Sign in to see your real calendar events'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading calendar...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Days Header */}
                  <div className="mb-4 grid grid-cols-8 gap-2">
                    <div className="text-sm font-medium text-muted-foreground">Time</div>
                    {DAYS_OF_WEEK.map((day) => (
                      <div key={day} className="text-center text-sm font-medium">
                        {day.slice(0, 3)}
                      </div>
                    ))}
                  </div>

                  {/* Time Slots */}
                  <div className="space-y-1">
                    {Array.from({ length: 12 }, (_, i) => {
                      const hour = 8 + i;
                      const timeStr = `${hour.toString().padStart(2, '0')}:00`;

                      return (
                        <div key={hour} className="grid grid-cols-8 gap-2">
                          <div className="py-2 text-xs text-muted-foreground">
                            {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                          </div>
                          {DAYS_OF_WEEK.map((day) => {
                            // Find events for this day/time
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

                            return (
                              <div key={day} className="relative min-h-[60px]">
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

                                {dayEvents.length === 0 && (
                                  <div className="h-full rounded-md border border-dashed border-border bg-muted/10" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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
