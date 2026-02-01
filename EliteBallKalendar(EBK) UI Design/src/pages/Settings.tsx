import { useState, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Separator } from '../components/ui/separator';
import { Settings as SettingsIcon, Calendar, Bell, Palette, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../components/ThemeProvider';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const COLOR_THEMES = [
  { 
    value: 'default', 
    label: 'Default', 
    description: 'Classic purple and blue',
    colors: ['#a855f7', '#3b82f6']
  },
  { 
    value: 'matcha', 
    label: 'Matcha', 
    description: 'Earthy greens and cream',
    colors: ['#6b8e23', '#8fbc8f']
  },
  { 
    value: 'newjeans', 
    label: 'NewJeans', 
    description: 'Y2K pastel vibes',
    colors: ['#b4a7d6', '#a8d8ea']
  },
  { 
    value: 'lebron', 
    label: 'LeBron', 
    description: 'Lakers purple and gold',
    colors: ['#552583', '#fdb927']
  },
  { 
    value: 'mario', 
    label: 'Mario', 
    description: 'Vibrant primary colors',
    colors: ['#e60012', '#0072ce']
  },
];

export function Settings() {
  const { colorTheme, setColorTheme } = useTheme();
  const [preferences, setPreferences] = useState({
    calendarType: 'google',
    blockLength: '30',
    workingDays: [] as string[],
    startTime: '09:00',
    endTime: '17:00',
    notifications: true,
    autoReschedule: false,
    locationTracking: true,
  });

  useEffect(() => {
    const saved = localStorage.getItem('ebk-preferences');
    if (saved) {
      setPreferences({ ...preferences, ...JSON.parse(saved) });
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('ebk-preferences', JSON.stringify(preferences));
    toast.success('Settings saved successfully');
  };

  const handleDayToggle = (day: string) => {
    setPreferences((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="mb-2">Settings</h1>
            <p className="text-muted-foreground">Customize your Elite Ball Kalendar experience</p>
          </div>

          <div className="space-y-6">
            {/* Calendar Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  <CardTitle>Calendar Integration</CardTitle>
                </div>
                <CardDescription>Manage your calendar connection and sync settings</CardDescription>
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
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Calendar</SelectItem>
                      <SelectItem value="outlook">Outlook Calendar</SelectItem>
                      <SelectItem value="samsung">Samsung Calendar</SelectItem>
                      <SelectItem value="apple">Apple Calendar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Calendar Status</p>
                      <p className="text-xs text-muted-foreground">Connected and syncing</p>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Appearance Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
                  <CardTitle>Appearance</CardTitle>
                </div>
                <CardDescription>Customize the look and feel of your app</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Color Theme</Label>
                  <div className="grid gap-3">
                    {COLOR_THEMES.map((theme) => (
                      <button
                        key={theme.value}
                        onClick={() => {
                          setColorTheme(theme.value as any);
                          toast.success(`Switched to ${theme.label} theme`);
                        }}
                        className={`flex items-center justify-between rounded-lg border-2 p-4 text-left transition-all hover:bg-accent/50 ${
                          colorTheme === theme.value
                            ? 'border-primary bg-accent/50'
                            : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {theme.colors.map((color, idx) => (
                              <div
                                key={idx}
                                className="h-8 w-8 rounded-full border border-border"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div>
                            <p className="font-medium">{theme.label}</p>
                            <p className="text-xs text-muted-foreground">{theme.description}</p>
                          </div>
                        </div>
                        {colorTheme === theme.value && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }}>
                            <svg
                              className="h-3 w-3 text-white"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Work Preferences */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5 text-blue-500" />
                  <CardTitle>Work Preferences</CardTitle>
                </div>
                <CardDescription>Configure your ideal work schedule</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="blockLength">Work Block Length</Label>
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

                <Separator />

                <div className="space-y-3">
                  <Label>Working Days</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {DAYS_OF_WEEK.map((day) => (
                      <div
                        key={day}
                        className="flex items-center space-x-2 rounded-lg border border-border p-3 hover:bg-accent/50"
                      >
                        <Checkbox
                          id={`settings-${day}`}
                          checked={preferences.workingDays.includes(day)}
                          onCheckedChange={() => handleDayToggle(day)}
                        />
                        <label
                          htmlFor={`settings-${day}`}
                          className="flex-1 cursor-pointer select-none text-sm"
                        >
                          {day}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

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

            {/* Notifications */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-pink-500" />
                  <CardTitle>Notifications & Automation</CardTitle>
                </div>
                <CardDescription>Manage alerts and automatic features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Push Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Get reminded before work blocks start
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, notifications: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Auto-Reschedule</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically adjust when conflicts are detected
                    </p>
                  </div>
                  <Switch
                    checked={preferences.autoReschedule}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, autoReschedule: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Location Tracking</p>
                    <p className="text-xs text-muted-foreground">
                      Account for commute times between locations
                    </p>
                  </div>
                  <Switch
                    checked={preferences.locationTracking}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, locationTracking: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Data & Privacy */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-500" />
                  <CardTitle>Data & Privacy</CardTitle>
                </div>
                <CardDescription>Manage your data and export options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  Export All Data
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Clear Calendar Cache
                </Button>
                <Button variant="outline" className="w-full justify-start text-destructive">
                  Delete All Work Blocks
                </Button>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
              <Button variant="outline">Reset to Defaults</Button>
              <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-blue-500">
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}