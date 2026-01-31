import { useState, useEffect, useCallback } from 'react';
import { stats as statsApi, StatsData, WrappedData } from '../lib/api';

interface StatsState {
  stats: StatsData | null;
  wrapped: WrappedData | null;
  loading: boolean;
  error: string | null;
}

export function useStats() {
  const [state, setState] = useState<StatsState>({
    stats: null,
    wrapped: null,
    loading: true,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await statsApi.get();
    
    if (result.error) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Failed to fetch stats' }));
    } else {
      setState(prev => ({ 
        ...prev, 
        stats: result.data || null, 
        loading: false, 
        error: null 
      }));
    }
  }, []);

  const fetchWrapped = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await statsApi.wrapped();
    
    if (result.error) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Failed to fetch wrapped data' }));
    } else {
      setState(prev => ({ 
        ...prev, 
        wrapped: result.data || null, 
        loading: false, 
        error: null 
      }));
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchWrapped();
  }, [fetchStats, fetchWrapped]);

  return {
    stats: state.stats,
    wrapped: state.wrapped,
    loading: state.loading,
    error: state.error,
    refresh: () => {
      fetchStats();
      fetchWrapped();
    },
  };
}
