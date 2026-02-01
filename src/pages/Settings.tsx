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
import { Settings as SettingsIcon, Calendar, Bell, Database, Loader2, RefreshCw, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '../hooks/useSettings';
import { useAuthContext } from '../components/AuthProvider';
import { WorkingWindow, CalendarInfo, calendar as calendarApi, auth as authApi } from '../lib/api';
import { useTheme } from '../components/ThemeProvider';
import { brandGradientBgHorizontal } from '../lib/theme-utils';

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const COLOR_THEMES = [
  {
    value: 'default',
    label: 'Default',
    description: 'Classic purple and blue',
    colors: ['#a855f7', '#3b82f6'],
  },
  {
    value: 'matcha',
    label: 'Matcha',
    description: 'Earthy greens and cream',
    colors: ['#6b8e23', '#8fbc8f'],
  },
  {
    value: 'newjeans',
    label: 'NewJeans',
    description: 'Y2K pastel vibes',
    colors: ['#b4a7d6', '#a8d8ea'],
  },
  {
    value: 'lebron',
    label: 'LeBron',
    description: 'Lakers purple and gold',
    colors: ['#552583', '#fdb927'],
  },
  {
    value: 'mario',
    label: 'Mario',
    description: 'Vibrant primary colors',
    colors: ['#e60012', '#0072ce'],
  },
];

export function Settings() {
  const { isAuthenticated, user } = useAuthContext();
  const { colorTheme, setColorTheme } = useTheme();
  const { settings, loading, updateSettings, defaultWorkingWindow } = useSettings();
  
  const [workingWindow, setWorkingWindow] = useState<WorkingWindow>(defaultWorkingWindow);
  const [blockLength, setBlockLength] = useState('30');
  const [timezone, setTimezone] = useState('America/New_York');
  const [minGap, setMinGap] = useState('5');
  const [saving, setSaving] = useState(false);
  
  // Calendar selection state
  const [availableCalendars, setAvailableCalendars] = useState<CalendarInfo[]>([]);
  const [selectedCalendars, setSelectedCalendars] = useState<string[] | null>(null);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [ebkCalendarName, setEbkCalendarName] = useState('EliteBall Focus Blocks');

  // Fetch available calendars when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendars();
    }
  }, [isAuthenticated]);

  const fetchCalendars = async () => {
    setCalendarsLoading(true);
    const result = await calendarApi.listCalendars();
    if (result.data?.calendars) {
      setAvailableCalendars(result.data.calendars);
    } else if (result.error) {
      if (result.error === 'Calendar not connected') {
        toast.error('Connect Google Calendar to load calendars.');
      } else {
        toast.error(result.error);
      }
    }
    setCalendarsLoading(false);
  };

  const handleConnectCalendar = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in first');
      return;
    }
    setConnectingCalendar(true);
    const result = await authApi.startCalendarConnect();
    setConnectingCalendar(false);
    if (result.error || !result.data?.url) {
      toast.error(result.error || 'Failed to start calendar connection');
      return;
    }
    window.location.href = result.data.url;
  };

  // Sync state when settings load
  useEffect(() => {
    if (settings) {
      setWorkingWindow(settings.workingWindow);
      setBlockLength(String(settings.blockLengthMinutes));
      setTimezone(settings.timezone);
      setMinGap(String(settings.minGapMinutes));
      setSelectedCalendars(settings.selectedCalendars);
      if (settings.ebkCalendarName) {
        setEbkCalendarName(settings.ebkCalendarName);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to save settings');
      return;
    }
    
    setSaving(true);
    const success = await updateSettings({
      workingWindow,
      blockLengthMinutes: parseInt(blockLength),
      timezone,
      minGapMinutes: parseInt(minGap),
      selectedCalendars,
      ebkCalendarName,
    });
    setSaving(false);
    
    if (success) {
      toast.success('Settings saved successfully');
    } else {
      toast.error('Failed to save settings');
    }
  };

  const handleCalendarToggle = (calendarId: string) => {
    setSelectedCalendars(prev => {
      // If null (all selected), switch to all except this one
      if (prev === null) {
        return availableCalendars
          .map(c => c.id)
          .filter(id => id !== calendarId);
      }
      
      // If already selected, remove it
      if (prev.includes(calendarId)) {
        const newSelection = prev.filter(id => id !== calendarId);
        // If nothing selected, keep at least one
        return newSelection.length > 0 ? newSelection : prev;
      }
      
      // Add to selection
      const newSelection = [...prev, calendarId];
      // If all are selected, set to null
      if (newSelection.length === availableCalendars.length) {
        return null;
      }
      return newSelection;
    });
  };

  const handleSelectAllCalendars = () => {
    setSelectedCalendars(null); // null means all calendars
  };

  const isCalendarSelected = (calendarId: string): boolean => {
    if (selectedCalendars === null) return true; // All selected
    return selectedCalendars.includes(calendarId);
  };

  const handleDayToggle = (dayKey: string) => {
    setWorkingWindow(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled: !prev[dayKey].enabled,
      },
    }));
  };

  const handleTimeChange = (dayKey: string, field: 'start' | 'end', value: string) => {
    setWorkingWindow(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value,
      },
    }));
  };

  const handleReset = () => {
    setWorkingWindow(defaultWorkingWindow);
    setBlockLength('30');
    setTimezone('America/New_York');
    setMinGap('5');
    toast.info('Settings reset to defaults (not saved yet)');
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

          {!isAuthenticated && (
            <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="py-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Sign in with Google to save your settings and sync with your calendar.
                </p>
              </CardContent>
            </Card>
          )}

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
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Calendar Status</p>
                      <p className="text-xs text-muted-foreground">
                        {isAuthenticated 
                          ? `Connected as ${user?.email}` 
                          : 'Not connected'}
                      </p>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleConnectCalendar}
                  disabled={!isAuthenticated || connectingCalendar}
                >
                  {connectingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="ebkCalendarName">Focus Blocks Calendar Name</Label>
                  <Input
                    id="ebkCalendarName"
                    value={ebkCalendarName}
                    onChange={(e) => setEbkCalendarName(e.target.value)}
                    placeholder="EliteBall Focus Blocks"
                    disabled={!isAuthenticated}
                  />
                  <p className="text-xs text-muted-foreground">
                    Focus blocks will be created in a separate calendar with this name
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                      <SelectItem value="Europe/London">London (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Calendar Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Calendars to Display</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAllCalendars}
                        disabled={selectedCalendars === null}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchCalendars}
                        disabled={calendarsLoading || !isAuthenticated}
                      >
                        <RefreshCw className={`h-4 w-4 ${calendarsLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  
                  {!isAuthenticated ? (
                    <p className="text-sm text-muted-foreground">
                      Sign in to see your calendars
                    </p>
                  ) : calendarsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading calendars...
                    </div>
                  ) : availableCalendars.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No calendars found. Click refresh to try again.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {availableCalendars.map((cal) => (
                        <div
                          key={cal.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-3"
                        >
                          <Checkbox
                            id={`cal-${cal.id}`}
                            checked={isCalendarSelected(cal.id)}
                            onCheckedChange={() => handleCalendarToggle(cal.id)}
                          />
                          <label
                            htmlFor={`cal-${cal.id}`}
                            className="flex-1 cursor-pointer select-none text-sm font-medium"
                          >
                            {cal.name}
                          </label>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground mt-2">
                        {selectedCalendars === null 
                          ? `All ${availableCalendars.length} calendars selected`
                          : `${selectedCalendars.length} of ${availableCalendars.length} calendars selected`}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Appearance */}
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
                          setColorTheme(theme.value as typeof colorTheme);
                          toast.success(`Switched to ${theme.label} theme`);
                        }}
                        className={`flex items-center justify-between rounded-lg border-2 p-4 text-left transition-all hover:bg-accent/50 ${
                          colorTheme === theme.value
                            ? 'border-primary bg-accent/50'
                            : 'border-border'
                        }`}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {theme.colors.map((color) => (
                              <div
                                key={color}
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
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-full"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="blockLength">Block Length</Label>
                    <Select value={blockLength} onValueChange={setBlockLength}>
                      <SelectTrigger id="blockLength">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 minutes (Pomodoro)</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="50">50 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                        <SelectItem value="90">90 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minGap">Min Gap Between Blocks</Label>
                    <Select value={minGap} onValueChange={setMinGap}>
                      <SelectTrigger id="minGap">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No gap</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Working Hours by Day</Label>
                  <div className="space-y-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <div
                        key={day.key}
                        className="flex items-center gap-4 rounded-lg border border-border p-3"
                      >
                        <Checkbox
                          id={`day-${day.key}`}
                          checked={workingWindow[day.key]?.enabled ?? false}
                          onCheckedChange={() => handleDayToggle(day.key)}
                        />
                        <label
                          htmlFor={`day-${day.key}`}
                          className="w-24 cursor-pointer select-none text-sm font-medium"
                        >
                          {day.label}
                        </label>
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={workingWindow[day.key]?.start || '09:00'}
                            onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                            disabled={!workingWindow[day.key]?.enabled}
                            className="w-32"
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={workingWindow[day.key]?.end || '17:00'}
                            onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                            disabled={!workingWindow[day.key]?.enabled}
                            className="w-32"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
                  Delete All Focus Blocks
                </Button>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleReset}>
                Reset to Defaults
              </Button>
              <Button 
                onClick={handleSave} 
                style={brandGradientBgHorizontal}
                disabled={saving || loading || !isAuthenticated}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
