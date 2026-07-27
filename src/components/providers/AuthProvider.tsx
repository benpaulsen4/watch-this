"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getCurrentSession, User } from "@/lib/auth/client";
import { StreamingPreferences } from "@/lib/profile/streaming/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  streamingPreferences: StreamingPreferences | null;
  streamingLoading: boolean;
  /**
   * Whether a load has been attempted for the current user, successfully or
   * not. `streamingPreferences` alone cannot answer that: a failed attempt
   * leaves it null, which is indistinguishable from "not tried yet".
   */
  streamingLoaded: boolean;
  streamingError: string | null;
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
    streamingLoaded: false,
    streamingError: null,
  });

  const refreshSession = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const session = await getCurrentSession();
      setState((prev) => {
        const user = session?.user || null;
        // A different user must not inherit the previous one's preferences, and
        // the loaded flag has to fall back with them or they never reload.
        const switchedUser = prev.user?.id !== user?.id;
        return {
          ...prev,
          user,
          loading: false,
          error: null,
          ...(switchedUser
            ? {
                streamingPreferences: null,
                streamingLoaded: false,
                streamingError: null,
              }
            : {}),
        };
      });
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
      setState((prev) => ({
        ...prev,
        streamingLoading: true,
        streamingError: null,
      }));
      const response = await fetch("/api/profile/streaming");
      if (response.ok) {
        const data = await response.json();
        setState((prev) => ({
          ...prev,
          streamingPreferences: data,
          streamingLoading: false,
          streamingLoaded: true,
          streamingError: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          streamingPreferences: null,
          streamingLoading: false,
          streamingLoaded: true,
          streamingError: `Failed to load streaming preferences (${response.status})`,
        }));
      }
    } catch (error) {
      console.error("Failed to refresh streaming preferences:", error);
      setState((prev) => ({
        ...prev,
        streamingPreferences: null,
        streamingLoading: false,
        streamingLoaded: true,
        streamingError:
          error instanceof Error
            ? error.message
            : "Failed to load streaming preferences",
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
      streamingLoaded: false,
      streamingError: null,
    });
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Load streaming preferences once the user is known. The guard is
  // `streamingLoaded`, not `streamingPreferences`: a failed request leaves the
  // preferences null and clears the loading flag, which restores the entry
  // condition exactly, so keying off them re-fires this effect forever and
  // hammers /api/profile/streaming for as long as it keeps failing.
  useEffect(() => {
    if (state.user && !state.streamingLoaded && !state.streamingLoading) {
      refreshStreamingPreferences();
    }
  }, [
    state.user,
    state.streamingLoaded,
    state.streamingLoading,
    refreshStreamingPreferences,
  ]);

  // Rebuilding this object every render re-renders every consumer's subtree on
  // any auth state change, and on renders caused by something else entirely.
  const value = useMemo<AuthContextType>(
    () => ({
      ...state,
      refreshSession,
      refreshStreamingPreferences,
      clearAuth,
    }),
    [state, refreshSession, refreshStreamingPreferences, clearAuth],
  );

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

export function useStreamingPreferences() {
  const {
    streamingPreferences,
    streamingLoading,
    streamingError,
    refreshStreamingPreferences,
  } = useAuth();
  return {
    streamingPreferences,
    streamingLoading,
    streamingError,
    refreshStreamingPreferences,
  };
}
