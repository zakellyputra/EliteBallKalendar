import { useState, useEffect, useCallback } from 'react';
import { settings as settingsApi, Settings, UpdateSettingsInput, WorkingWindow } from '../lib/api';

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
  const [state, setState] = useState<SettingsState>({
    settings: null,
    loading: true,
    error: null,
  });

  const fetchSettings = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await settingsApi.get();
    
    if (result.error) {
      setState({ settings: null, loading: false, error: result.error });
    } else {
      setState({ 
        settings: result.data?.settings || null, 
        loading: false, 
        error: null 
      });
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (data: UpdateSettingsInput) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await settingsApi.update(data);
    
    if (result.error) {
      setState(prev => ({ ...prev, loading: false, error: result.error! }));
      return false;
    } else {
      setState({ 
        settings: result.data?.settings || null, 
        loading: false, 
        error: null 
      });
      return true;
    }
  }, []);

  return {
    settings: state.settings,
    loading: state.loading,
    error: state.error,
    updateSettings,
    refresh: fetchSettings,
    defaultWorkingWindow: DEFAULT_WORKING_WINDOW,
  };
}
