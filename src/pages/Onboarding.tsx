import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { CalendarIcon, ClockIcon, TargetIcon, CheckCircle2 } from 'lucide-react';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState({
    calendarType: '',
    blockLength: '30',
    workingDays: [] as string[],
    startTime: '09:00',
    endTime: '17:00',
  });

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleDayToggle = (day: string) => {
    setPreferences((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  };

  const handleComplete = () => {
    localStorage.setItem('ebk-preferences', JSON.stringify(preferences));
    localStorage.setItem('ebk-onboarding-complete', 'true');
    toast.success('Setup complete! Welcome to Elite Ball Kalendar');
    navigate('/');
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return preferences.calendarType !== '';
      case 2:
        return preferences.blockLength !== '';
      case 3:
        return preferences.workingDays.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10">
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-4xl font-bold text-transparent">
              Welcome to EBK
            </h1>
            <p className="text-muted-foreground">Let's set up your perfect productivity system</p>
          </div>

          <Progress value={progress} className="mb-8" />

          {/* Step 1: Calendar Connection */}
          {step === 1 && (
            <Card className="border-2">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10">
                  <CalendarIcon className="h-6 w-6 text-purple-500" />
                </div>
                <CardTitle>Connect Your Calendar</CardTitle>
                <CardDescription>
                  Choose which calendar you'd like to sync with EBK
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="calendar">Calendar Provider</Label>
                  <Select
                    value={preferences.calendarType}
                    onValueChange={(value) =>
                      setPreferences((prev) => ({ ...prev, calendarType: value }))
                    }
                  >
                    <SelectTrigger id="calendar">
                      <SelectValue placeholder="Select your calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Calendar</SelectItem>
                      <SelectItem value="outlook">Outlook Calendar</SelectItem>
                      <SelectItem value="samsung">Samsung Calendar</SelectItem>
                      <SelectItem value="apple">Apple Calendar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {preferences.calendarType && (
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <p className="text-sm text-muted-foreground">
                      We'll need permission to read your calendar events and create work blocks.
                      Your data is never shared with third parties.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Block Length */}
          {step === 2 && (
            <Card className="border-2">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                  <ClockIcon className="h-6 w-6 text-blue-500" />
                </div>
                <CardTitle>Work Block Length</CardTitle>
                <CardDescription>
                  How long should each focused work session be?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="blockLength">Block Duration (minutes)</Label>
                  <Select
                    value={preferences.blockLength}
                    onValueChange={(value) =>
                      setPreferences((prev) => ({ ...prev, blockLength: value }))
                    }
                  >
                    <SelectTrigger id="blockLength">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="25">25 minutes (Pomodoro)</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <p className="mb-2 text-sm font-medium">Why this matters:</p>
                  <p className="text-sm text-muted-foreground">
                    Research shows that focused work blocks help maintain concentration and prevent
                    burnout. We'll automatically schedule breaks between blocks.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Working Window */}
          {step === 3 && (
            <Card className="border-2">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10">
                  <TargetIcon className="h-6 w-6 text-pink-500" />
                </div>
                <CardTitle>Your Working Window</CardTitle>
                <CardDescription>
                  Define when you're available to work each week
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Working Days</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {DAYS_OF_WEEK.map((day) => (
                      <div
                        key={day}
                        className="flex items-center space-x-2 rounded-lg border border-border p-3 hover:bg-accent/50"
                      >
                        <Checkbox
                          id={day}
                          checked={preferences.workingDays.includes(day)}
                          onCheckedChange={() => handleDayToggle(day)}
                        />
                        <label
                          htmlFor={day}
                          className="flex-1 cursor-pointer select-none text-sm"
                        >
                          {day}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={preferences.startTime}
                      onChange={(e) =>
                        setPreferences((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={preferences.endTime}
                      onChange={(e) =>
                        setPreferences((prev) => ({ ...prev, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <Card className="border-2">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle>You're All Set!</CardTitle>
                <CardDescription>Review your preferences before we begin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-muted-foreground">Calendar</span>
                    <span className="text-sm font-medium capitalize">{preferences.calendarType}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-muted-foreground">Work Block</span>
                    <span className="text-sm font-medium">{preferences.blockLength} minutes</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-muted-foreground">Working Days</span>
                    <span className="text-sm font-medium">{preferences.workingDays.length} days</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-muted-foreground">Daily Hours</span>
                    <span className="text-sm font-medium">
                      {preferences.startTime} - {preferences.endTime}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-4">
                  <p className="text-sm">
                    You can always change these settings later from the Settings page.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="mt-8 flex items-center justify-between">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < totalSteps ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="ml-auto"
              >
                Continue
              </Button>
            ) : (
              <Button onClick={handleComplete} className="ml-auto bg-gradient-to-r from-purple-500 to-blue-500">
                Complete Setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
