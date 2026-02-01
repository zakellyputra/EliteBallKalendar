import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, BookOpen, Clock, MapPin, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface WorkGoal {
  id: string;
  subject: string;
  hoursPerWeek: number;
  color: string;
  hoursCompleted: number;
}

interface WorkBlock {
  id: string;
  goalId: string;
  day: string;
  startTime: string;
  endTime: string;
  location?: string;
}

const MOCK_CALENDAR_EVENTS = [
  { day: 'Monday', startTime: '10:00', endTime: '11:30', title: 'Team Meeting' },
  { day: 'Tuesday', startTime: '14:00', endTime: '15:00', title: 'Doctor Appointment' },
  { day: 'Wednesday', startTime: '09:00', endTime: '10:00', title: 'Class Lecture' },
  { day: 'Thursday', startTime: '16:00', endTime: '17:30', title: 'Gym' },
  { day: 'Friday', startTime: '11:00', endTime: '12:00', title: 'Lunch with Sarah' },
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500', 'bg-cyan-500'];

export function Dashboard() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<WorkGoal[]>([]);
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([]);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ subject: '', hoursPerWeek: '' });

  useEffect(() => {
    const onboardingComplete = localStorage.getItem('ebk-onboarding-complete');
    if (!onboardingComplete) {
      navigate('/onboarding');
    }
  }, [navigate]);

  const handleAddGoal = () => {
    if (!newGoal.subject || !newGoal.hoursPerWeek) {
      toast.error('Please fill in all fields');
      return;
    }

    const goal: WorkGoal = {
      id: Date.now().toString(),
      subject: newGoal.subject,
      hoursPerWeek: parseInt(newGoal.hoursPerWeek),
      color: COLORS[goals.length % COLORS.length],
      hoursCompleted: 0,
    };

    setGoals([...goals, goal]);
    generateWorkBlocks([...goals, goal]);
    setNewGoal({ subject: '', hoursPerWeek: '' });
    setShowAddGoal(false);
    toast.success('Goal added! Generating work blocks...');
  };

  const generateWorkBlocks = (currentGoals: WorkGoal[]) => {
    const preferences = JSON.parse(localStorage.getItem('ebk-preferences') || '{}');
    const blockLength = parseInt(preferences.blockLength || '30');
    const startTime = preferences.startTime || '09:00';
    const endTime = preferences.endTime || '17:00';
    const workingDays = preferences.workingDays || DAYS_OF_WEEK.slice(0, 5);

    const blocks: WorkBlock[] = [];
    let currentDay = 0;
    let currentTime = startTime;

    for (const goal of currentGoals) {
      const blocksNeeded = Math.ceil((goal.hoursPerWeek * 60) / blockLength);

      for (let i = 0; i < blocksNeeded; i++) {
        // Find next available slot
        let foundSlot = false;
        while (!foundSlot && currentDay < workingDays.length * 2) {
          const day = workingDays[currentDay % workingDays.length];
          
          // Check if slot conflicts with calendar events
          const hasConflict = MOCK_CALENDAR_EVENTS.some(
            (event) =>
              event.day === day &&
              event.startTime <= currentTime &&
              event.endTime > currentTime
          );

          if (!hasConflict) {
            const [hours, minutes] = currentTime.split(':').map(Number);
            const endMinutes = minutes + blockLength;
            const endHours = hours + Math.floor(endMinutes / 60);
            const endMins = endMinutes % 60;
            const blockEndTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

            if (blockEndTime <= endTime) {
              blocks.push({
                id: `${goal.id}-${i}`,
                goalId: goal.id,
                day,
                startTime: currentTime,
                endTime: blockEndTime,
              });

              currentTime = blockEndTime;
              foundSlot = true;
            } else {
              currentDay++;
              currentTime = startTime;
            }
          } else {
            // Skip to after the conflicting event
            const conflictEvent = MOCK_CALENDAR_EVENTS.find(
              (event) => event.day === day && event.startTime <= currentTime
            );
            if (conflictEvent) {
              currentTime = conflictEvent.endTime;
            } else {
              currentDay++;
              currentTime = startTime;
            }
          }
        }
      }
    }

    setWorkBlocks(blocks);
  };

  const getGoalById = (goalId: string) => goals.find((g) => g.id === goalId);

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Your Weekly Plan</h1>
          <p className="text-muted-foreground">
            Week of January 27 - February 2, 2026
          </p>
        </div>

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
              <CardDescription>Work Blocks</CardDescription>
              <CardTitle className="text-3xl">{workBlocks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Hours This Week</CardDescription>
              <CardTitle className="text-3xl">
                {goals.reduce((sum, g) => sum + g.hoursPerWeek, 0)}h
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completion Rate</CardDescription>
              <CardTitle className="text-3xl">
                {goals.length > 0
                  ? Math.round(
                      (goals.reduce((sum, g) => sum + g.hoursCompleted, 0) /
                        goals.reduce((sum, g) => sum + g.hoursPerWeek, 0)) *
                        100
                    )
                  : 0}
                %
              </CardTitle>
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
                  <Button className="gap-2">
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
                      <Label htmlFor="subject">Subject/Class</Label>
                      <Input
                        id="subject"
                        placeholder="e.g., CS251, Math Homework, Project X"
                        value={newGoal.subject}
                        onChange={(e) =>
                          setNewGoal({ ...newGoal, subject: e.target.value })
                        }
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
                        value={newGoal.hoursPerWeek}
                        onChange={(e) =>
                          setNewGoal({ ...newGoal, hoursPerWeek: e.target.value })
                        }
                      />
                    </div>
                    <Button onClick={handleAddGoal} className="w-full">
                      Add Goal
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No goals yet. Add your first goal to get started!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${goal.color}`} />
                      <div>
                        <p className="font-medium">{goal.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {goal.hoursCompleted} / {goal.hoursPerWeek} hours completed
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{goal.hoursPerWeek}h/week</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Calendar View */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>
              Your work blocks are automatically scheduled around your calendar events
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                          // Find blocks for this day/time
                          const dayBlocks = workBlocks.filter(
                            (block) =>
                              block.day === day &&
                              timeToMinutes(block.startTime) <= timeToMinutes(timeStr) &&
                              timeToMinutes(block.endTime) > timeToMinutes(timeStr)
                          );

                          const calendarEvents = MOCK_CALENDAR_EVENTS.filter(
                            (event) =>
                              event.day === day &&
                              timeToMinutes(event.startTime) <= timeToMinutes(timeStr) &&
                              timeToMinutes(event.endTime) > timeToMinutes(timeStr)
                          );

                          return (
                            <div key={day} className="relative min-h-[60px]">
                              {dayBlocks.map((block) => {
                                const goal = getGoalById(block.goalId);
                                if (!goal) return null;

                                return (
                                  <div
                                    key={block.id}
                                    className={`absolute inset-x-0 rounded-md p-2 ${goal.color} bg-opacity-20 border-l-4`}
                                    style={{ borderColor: goal.color.replace('bg-', '') }}
                                  >
                                    <p className="text-xs font-medium">{goal.subject}</p>
                                    <p className="text-xs opacity-75">
                                      {block.startTime} - {block.endTime}
                                    </p>
                                  </div>
                                );
                              })}

                              {calendarEvents.map((event, idx) => (
                                <div
                                  key={idx}
                                  className="absolute inset-x-0 rounded-md border-2 border-dashed border-muted-foreground bg-muted/30 p-2"
                                >
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {event.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground opacity-75">
                                    {event.startTime} - {event.endTime}
                                  </p>
                                </div>
                              ))}

                              {dayBlocks.length === 0 && calendarEvents.length === 0 && (
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

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm text-muted-foreground">Work Blocks</span>
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
