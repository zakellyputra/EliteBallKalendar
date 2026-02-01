import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Settings, UpdateSettingsInput, WorkingWindow } from '../lib/api';
import { db } from '../lib/firebase';
import { useAuthContext } from '../components/AuthProvider';

const DEFAULT_WORKING_WINDOW: WorkingWindow = {
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '09:00', end: '17:00' },
  sunday: { enabled: false, start: '09:00', end: '17:00' },
};

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
}

export function useSettings() {
  const { user } = useAuthContext();
  const [state, setState] = useState<SettingsState>({
    settings: null,
    loading: true,
    error: null,
  });

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setState({ settings: null, loading: false, error: null });
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const settingsRef = doc(db, 'settings', user.id);
      const snapshot = await getDoc(settingsRef);
      if (!snapshot.exists()) {
        // Check for local preferences from onboarding
        let initialDefaults = { ...DEFAULT_WORKING_WINDOW };
        let initialBlockLength = 30;
        let initialMinGap = 5;

        try {
          const localPrefs = localStorage.getItem('ebk-preferences');
          if (localPrefs) {
            const prefs = JSON.parse(localPrefs);
            
            // Map working days
            if (prefs.workingDays && Array.isArray(prefs.workingDays)) {
              // Reset all to disabled first
              Object.keys(initialDefaults).forEach(day => {
                initialDefaults[day] = { ...initialDefaults[day], enabled: false };
              });
              
              // Enable selected days and set times
              prefs.workingDays.forEach((day: string) => {
                const dayKey = day.toLowerCase();
                if (initialDefaults[dayKey]) {
                  initialDefaults[dayKey] = {
                    enabled: true,
                    start: prefs.startTime || '09:00',
                    end: prefs.endTime || '17:00',
                  };
                }
              });
            }
            
            if (prefs.blockLength) initialBlockLength = parseInt(prefs.blockLength);
            if (prefs.breakLength) initialMinGap = parseInt(prefs.breakLength);
          }
        } catch (e) {
          console.error('Failed to parse local preferences', e);
        }

        const defaults: Settings = {
          id: user.id,
          userId: user.id,
          workingWindow: initialDefaults,
          blockLengthMinutes: initialBlockLength,
          timezone: 'America/New_York',
          minGapMinutes: initialMinGap,
          selectedCalendars: null,
        };
        await setDoc(settingsRef, defaults);
        setState({ settings: defaults, loading: false, error: null });
        return;
      }

      const data = snapshot.data() as Settings;
      setState({
        settings: {
          ...data,
          id: snapshot.id,
          userId: data.userId || user.id,
          workingWindow: data.workingWindow || DEFAULT_WORKING_WINDOW,
          blockLengthMinutes: data.blockLengthMinutes ?? 30,
          timezone: data.timezone || 'America/New_York',
          minGapMinutes: data.minGapMinutes ?? 5,
          selectedCalendars: data.selectedCalendars ?? null,
        },
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setState({ settings: null, loading: false, error: err.message || 'Failed to fetch settings' });
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (data: UpdateSettingsInput) => {
    if (!user) return false;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const settingsRef = doc(db, 'settings', user.id);
      await setDoc(settingsRef, {
        ...data,
        userId: user.id,
      }, { merge: true });
      const nextSettings = {
        ...(state.settings || {
          id: user.id,
          userId: user.id,
          workingWindow: DEFAULT_WORKING_WINDOW,
          blockLengthMinutes: 30,
          timezone: 'America/New_York',
          minGapMinutes: 5,
          selectedCalendars: null,
        }),
        ...data,
      } as Settings;
      setState({ settings: nextSettings, loading: false, error: null });
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message || 'Failed to update settings' }));
      return false;
    }
  }, [state.settings, user]);

  return {
    settings: state.settings,
    loading: state.loading,
    error: state.error,
    updateSettings,
    refresh: fetchSettings,
    defaultWorkingWindow: DEFAULT_WORKING_WINDOW,
  };
}
