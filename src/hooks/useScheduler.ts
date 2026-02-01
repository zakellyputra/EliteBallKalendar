import { useState, useCallback } from 'react';
import { scheduler } from '../lib/api';
import type { ProposedBlock, InsufficientTimeInfo } from '../lib/api';

interface SchedulerState {
  proposedBlocks: ProposedBlock[];
  insufficientTime: InsufficientTimeInfo | null;
  availableMinutes: number;
  requestedMinutes: number;
  loading: boolean;
  applying: boolean;
  error: string | null;
}

export function useScheduler() {
  const [state, setState] = useState<SchedulerState>({
    proposedBlocks: [],
    insufficientTime: null,
    availableMinutes: 0,
    requestedMinutes: 0,
    loading: false,
    applying: false,
    error: null,
  });

  const generate = useCallback(async (weekStart?: string, weekEnd?: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await scheduler.generate(weekStart, weekEnd);
    
    if (result.error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: result.error || 'Failed to generate schedule' 
      }));
      return false;
    }
    
    setState({
      proposedBlocks: result.data?.blocks || [],
      insufficientTime: result.data?.insufficientTime || null,
      availableMinutes: result.data?.availableMinutes || 0,
      requestedMinutes: result.data?.requestedMinutes || 0,
      loading: false,
      applying: false,
      error: null,
    });
    
    return true;
  }, []);

  const apply = useCallback(async () => {
    if (state.proposedBlocks.length === 0) return false;
    
    setState(prev => ({ ...prev, applying: true, error: null }));
    
    const result = await scheduler.apply(state.proposedBlocks);
    
    if (result.error) {
      setState(prev => ({ 
        ...prev, 
        applying: false, 
        error: result.error || 'Failed to apply schedule' 
      }));
      return false;
    }
    
    // Clear proposed blocks after successful apply
    setState({
      proposedBlocks: [],
      insufficientTime: null,
      availableMinutes: 0,
      requestedMinutes: 0,
      loading: false,
      applying: false,
      error: null,
    });
    
    return true;
  }, [state.proposedBlocks]);

  const clear = useCallback(() => {
    setState({
      proposedBlocks: [],
      insufficientTime: null,
      availableMinutes: 0,
      requestedMinutes: 0,
      loading: false,
      applying: false,
      error: null,
    });
  }, []);

  // Update a proposed block (for drag-and-drop repositioning)
  const updateProposedBlock = useCallback((index: number, newStart: string, newEnd: string) => {
    setState(prev => {
      const updated = [...prev.proposedBlocks];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          start: newStart,
          end: newEnd,
        };
      }
      return { ...prev, proposedBlocks: updated };
    });
  }, []);

  // Set all proposed blocks (for bulk updates)
  const setProposedBlocks = useCallback((blocks: ProposedBlock[]) => {
    setState(prev => ({ ...prev, proposedBlocks: blocks }));
  }, []);

  return {
    proposedBlocks: state.proposedBlocks,
    insufficientTime: state.insufficientTime,
    availableMinutes: state.availableMinutes,
    requestedMinutes: state.requestedMinutes,
    loading: state.loading,
    applying: state.applying,
    error: state.error,
    generate,
    apply,
    clear,
    updateProposedBlock,
    setProposedBlocks,
    hasProposedBlocks: state.proposedBlocks.length > 0,
  };
}
