import { useState, useCallback } from 'react';
import { scheduler, ProposedBlock, InsufficientTimeInfo } from '../lib/api';

interface SchedulerState {
  proposedBlocks: ProposedBlock[];
  insufficientTime: InsufficientTimeInfo | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
}

export function useScheduler() {
  const [state, setState] = useState<SchedulerState>({
    proposedBlocks: [],
    insufficientTime: null,
    loading: false,
    applying: false,
    error: null,
  });

  const generate = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await scheduler.generate();
    
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
      loading: false,
      applying: false,
      error: null,
    });
  }, []);

  return {
    proposedBlocks: state.proposedBlocks,
    insufficientTime: state.insufficientTime,
    loading: state.loading,
    applying: state.applying,
    error: state.error,
    generate,
    apply,
    clear,
    hasProposedBlocks: state.proposedBlocks.length > 0,
  };
}
