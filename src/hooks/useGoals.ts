import { useState, useEffect, useCallback } from 'react';
import { goals as goalsApi } from '../lib/api';
import type { Goal, CreateGoalInput } from '../lib/api';
import { useAuthContext } from '../components/AuthProvider';

interface GoalsState {
  goals: Goal[];
  loading: boolean;
  error: string | null;
}

export function useGoals() {
  const { user } = useAuthContext();
  const [state, setState] = useState<GoalsState>({
    goals: [],
    loading: true,
    error: null,
  });

  const fetchGoals = useCallback(async () => {
    if (!user) {
      setState({ goals: [], loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await goalsApi.list();
      if (error) throw new Error(error);
      setState({ goals: data?.goals || [], loading: false, error: null });
    } catch (err: any) {
      setState({ goals: [], loading: false, error: err.message || 'Failed to fetch goals' });
    }
  }, [user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = useCallback(async (data: CreateGoalInput): Promise<Goal | null> => {
    if (!user) return null;
    try {
      const { data: result, error } = await goalsApi.create(data);
      if (error || !result?.goal) throw new Error(error || 'Failed to create goal');
      
      const goal = result.goal;
      setState(prev => ({
        ...prev,
        goals: [goal, ...prev.goals],
      }));
      return goal;
    } catch (err) {
      console.error('Create goal error:', err);
      return null;
    }
  }, [user]);

  const updateGoal = useCallback(async (id: string, data: Partial<CreateGoalInput>): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await goalsApi.update(id, data);
      if (error) throw new Error(error);
      
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g => g.id === id ? { ...g, ...data } : g),
      }));
      return true;
    } catch (err) {
      console.error('Update goal error:', err);
      return false;
    }
  }, [user]);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await goalsApi.delete(id);
      if (error) throw new Error(error);
      
      setState(prev => ({
        ...prev,
        goals: prev.goals.filter(g => g.id !== id),
      }));
      return true;
    } catch (err) {
      console.error('Delete goal error:', err);
      return false;
    }
  }, [user]);

  return {
    goals: state.goals,
    loading: state.loading,
    error: state.error,
    createGoal,
    updateGoal,
    deleteGoal,
    refresh: fetchGoals,
  };
}
