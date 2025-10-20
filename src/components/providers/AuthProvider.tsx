"use client";

import { getCurrentSession, User } from "@/lib/auth/client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

interface StreamingPreferences {
  country: string | null;
  providers: Array<{
    id: number;
    name?: string | null;
    logoPath?: string | null;
    region: string;
  }>;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  streamingPreferences: StreamingPreferences | null;
  streamingLoading: boolean;
}

interface AuthContextType extends AuthState {
  refreshSession: () => Promise<void>;
  refreshStreamingPreferences: () => Promise<void>;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    streamingPreferences: null,
    streamingLoading: false,
  });

  const refreshSession = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const session = await getCurrentSession();
      setState((prev) => ({
        ...prev,
        user: session?.user || null,
        loading: false,
        error: null,
      }));
    } catch (error) {
      console.error("Failed to refresh session:", error);
      setState((prev) => ({
        ...prev,
        user: null,
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load session",
      }));
    }
  }, []);

  const refreshStreamingPreferences = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, streamingLoading: true }));
      const response = await fetch("/api/profile/streaming");
      if (response.ok) {
        const data = await response.json();
        setState((prev) => ({
          ...prev,
          streamingPreferences: data,
          streamingLoading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          streamingPreferences: null,
          streamingLoading: false,
        }));
      }
    } catch (error) {
      console.error("Failed to refresh streaming preferences:", error);
      setState((prev) => ({
        ...prev,
        streamingPreferences: null,
        streamingLoading: false,
      }));
    }
  }, []);

  const clearAuth = useCallback(() => {
    setState({
      user: null,
      loading: false,
      error: null,
      streamingPreferences: null,
      streamingLoading: false,
    });
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Load streaming preferences when user is authenticated
  useEffect(() => {
    if (state.user && !state.streamingPreferences && !state.streamingLoading) {
      refreshStreamingPreferences();
    }
  }, [state.user, state.streamingPreferences, state.streamingLoading, refreshStreamingPreferences]);

  const value: AuthContextType = {
    ...state,
    refreshSession,
    refreshStreamingPreferences,
    clearAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
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

export function useStreamingPreferences() {
  const { streamingPreferences, streamingLoading, refreshStreamingPreferences } = useAuth();
  return { streamingPreferences, streamingLoading, refreshStreamingPreferences };
}
