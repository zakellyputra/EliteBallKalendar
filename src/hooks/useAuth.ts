import { useState, useEffect, useCallback } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { User } from '../lib/api';
import { auth } from '../lib/firebase';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setState({ user: null, loading: false, error: null });
        return;
      }

      const mappedUser: User = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName,
        image: firebaseUser.photoURL,
        createdAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
      };

      setState({ user: mappedUser, loading: false, error: null });
    }, (error) => {
      setState({ user: null, loading: false, error: error.message || 'Auth error' });
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(() => {
    const provider = new GoogleAuthProvider();
    setState(prev => ({ ...prev, loading: true, error: null }));
    signInWithPopup(auth, provider).catch((error) => {
      setState(prev => ({ ...prev, loading: false, error: error.message || 'Login failed' }));
    });
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setState({ user: null, loading: false, error: null });
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    login,
    logout,
    refresh: async () => {},
  };
}
