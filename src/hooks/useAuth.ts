import { useState, useEffect, useCallback } from 'react';
import { auth, User } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const checkAuth = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await auth.me();
    
    if (result.error) {
      setState({ user: null, loading: false, error: result.error });
    } else {
      setState({ user: result.data?.user || null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(() => {
    window.location.href = auth.loginUrl();
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setState({ user: null, loading: false, error: null });
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    login,
    logout,
    refresh: checkAuth,
  };
}
