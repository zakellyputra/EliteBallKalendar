import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { Goal, CreateGoalInput } from '../lib/api';
import { db } from '../lib/firebase';
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
      const goalsQuery = query(
        collection(db, 'goals'),
        where('userId', '==', user.id),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(goalsQuery);
      const goals = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Goal, 'id'> & { createdAt?: any };
        const createdAt = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt === 'string'
            ? data.createdAt
            : new Date().toISOString();
        return {
          id: docSnap.id,
          userId: data.userId,
          name: data.name,
          targetMinutesPerWeek: data.targetMinutesPerWeek,
          createdAt,
          preferredTime: data.preferredTime,
          sessionsPerWeek: data.sessionsPerWeek,
        };
      });
      setState({ goals, loading: false, error: null });
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
      const goalData: any = {
        userId: user.id,
        name: data.name,
        targetMinutesPerWeek: data.targetMinutesPerWeek,
        createdAt: serverTimestamp(),
      };
      
      if (data.preferredTime) goalData.preferredTime = data.preferredTime;
      if (data.sessionsPerWeek) goalData.sessionsPerWeek = data.sessionsPerWeek;

      const docRef = await addDoc(collection(db, 'goals'), goalData);
      
      const goal: Goal = {
        id: docRef.id,
        userId: user.id,
        name: data.name,
        targetMinutesPerWeek: data.targetMinutesPerWeek,
        createdAt: new Date().toISOString(),
        preferredTime: data.preferredTime,
        sessionsPerWeek: data.sessionsPerWeek,
      };
      setState(prev => ({
        ...prev,
        goals: [goal, ...prev.goals],
      }));
      return goal;
    } catch (err) {
      return null;
    }
  }, [user]);

  const updateGoal = useCallback(async (id: string, data: Partial<CreateGoalInput>): Promise<boolean> => {
    if (!user) return false;
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.targetMinutesPerWeek !== undefined) {
        updateData.targetMinutesPerWeek = data.targetMinutesPerWeek;
      }
      if (data.preferredTime !== undefined) updateData.preferredTime = data.preferredTime;
      if (data.sessionsPerWeek !== undefined) updateData.sessionsPerWeek = data.sessionsPerWeek;

      await updateDoc(doc(db, 'goals', id), updateData);
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g => g.id === id ? { ...g, ...updateData } : g),
      }));
      return true;
    } catch (err) {
      return false;
    }
  }, [user]);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      await deleteDoc(doc(db, 'goals', id));
      setState(prev => ({
        ...prev,
        goals: prev.goals.filter(g => g.id !== id),
      }));
      return true;
    } catch (err) {
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
