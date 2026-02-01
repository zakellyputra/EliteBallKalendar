import { useState, useEffect, useCallback, useRef } from 'react';
import { stats as statsApi, StatsData, WrappedData, AvailableMonth } from '../lib/api';

interface StatsState {
  stats: StatsData | null;
  wrapped: WrappedData | null;
  availableMonths: AvailableMonth[];
  loading: boolean;
  error: string | null;
}

export function useStats() {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [state, setState] = useState<StatsState>({
    stats: null,
    wrapped: null,
    availableMonths: [],
    loading: true,
    error: null,
  });
  const initialLoadDone = useRef(false);

  const fetchAvailableMonths = useCallback(async () => {
    const result = await statsApi.availableMonths();
    if (result.error) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Failed to fetch available months' }));
      return [];
    }
    return result.data?.availableMonths || [];
  }, []);

  const fetchStats = useCallback(async (month: number, year: number) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [statsResult, wrappedResult] = await Promise.all([
        statsApi.get(month, year),
        statsApi.wrapped(month, year),
      ]);

      if (statsResult.error || wrappedResult.error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: statsResult.error || wrappedResult.error || 'Failed to fetch stats'
        }));
      } else {
        setState(prev => ({
          ...prev,
          stats: statsResult.data || null,
          wrapped: wrappedResult.data || null,
          loading: false,
          error: null
        }));
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to fetch stats'
      }));
    }
  }, []);

  // Initial load: fetch available months and auto-select most recent
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      const months = await fetchAvailableMonths();
      setState(prev => ({ ...prev, availableMonths: months }));

      if (months.length > 0) {
        // Select the most recent month with data
        setSelectedMonth(months[0].month);
        setSelectedYear(months[0].year);
      } else {
        // No data available - stop loading
        setState(prev => ({ ...prev, loading: false }));
      }
    })();
  }, [fetchAvailableMonths]);

  // Fetch stats when month/year changes
  useEffect(() => {
    if (selectedMonth !== null && selectedYear !== null) {
      fetchStats(selectedMonth, selectedYear);
    }
  }, [selectedMonth, selectedYear, fetchStats]);

  return {
    stats: state.stats,
    wrapped: state.wrapped,
    availableMonths: state.availableMonths,
    loading: state.loading,
    error: state.error,
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    refresh: () => {
      if (selectedMonth !== null && selectedYear !== null) {
        fetchStats(selectedMonth, selectedYear);
      }
    },
  };
}
