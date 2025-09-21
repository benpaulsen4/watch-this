'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCurrentSession, type User } from './client';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  refreshSession: () => Promise<void>;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const refreshSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const session = await getCurrentSession();
      setState({
        user: session?.user || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to refresh session:', error);
      setState({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load session',
      });
    }
  }, []);

  const clearAuth = useCallback(() => {
    setState({
      user: null,
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const value: AuthContextType = {
    ...state,
    refreshSession,
    clearAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Convenience hooks for common use cases
export function useUser() {
  const { user } = useAuth();
  return user;
}

export function useAuthLoading() {
  const { loading } = useAuth();
  return loading;
}

export function useIsAuthenticated() {
  const { user, loading } = useAuth();
  return { isAuthenticated: !!user, loading };
}