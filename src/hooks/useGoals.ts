import { useState, useEffect, useCallback } from 'react';
import { goals as goalsApi, Goal, CreateGoalInput } from '../lib/api';

interface GoalsState {
  goals: Goal[];
  loading: boolean;
  error: string | null;
}

export function useGoals() {
  const [state, setState] = useState<GoalsState>({
    goals: [],
    loading: true,
    error: null,
  });

  const fetchGoals = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await goalsApi.list();
    
    if (result.error) {
      setState({ goals: [], loading: false, error: result.error });
    } else {
      setState({ 
        goals: result.data?.goals || [], 
        loading: false, 
        error: null 
      });
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = useCallback(async (data: CreateGoalInput): Promise<Goal | null> => {
    const result = await goalsApi.create(data);
    
    if (result.error) {
      return null;
    }
    
    if (result.data?.goal) {
      setState(prev => ({
        ...prev,
        goals: [result.data!.goal, ...prev.goals],
      }));
      return result.data.goal;
    }
    
    return null;
  }, []);

  const updateGoal = useCallback(async (id: string, data: Partial<CreateGoalInput>): Promise<boolean> => {
    const result = await goalsApi.update(id, data);
    
    if (result.error) {
      return false;
    }
    
    if (result.data?.goal) {
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g => g.id === id ? result.data!.goal : g),
      }));
      return true;
    }
    
    return false;
  }, []);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    const result = await goalsApi.delete(id);
    
    if (result.error) {
      return false;
    }
    
    setState(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
    }));
    
    return true;
  }, []);

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
