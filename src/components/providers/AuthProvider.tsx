"use client";

import { useQueryClient } from "@tanstack/react-query";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useProgressRouter } from "@/hooks/useProgressRouter";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import { getCurrentSession, User } from "@/lib/auth/client";
import * as authApi from "@/lib/auth/contract";
import * as streamingApi from "@/lib/profile/streaming/contract";
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

/** The answer to a request made without a valid session. */
function isSignedOut(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "unauthenticated" || error.code === "invalidSession")
  );
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
      const data = await api(streamingApi.getStreamingPreferences);
      setState((prev) => ({
        ...prev,
        streamingPreferences: data,
        streamingLoading: false,
        streamingLoaded: true,
        streamingError: null,
      }));
    } catch (error) {
      console.error("Failed to refresh streaming preferences:", error);
      setState((prev) => ({
        ...prev,
        streamingPreferences: null,
        streamingLoading: false,
        streamingLoaded: true,
        // A server answer keeps its status in the message; a failed request
        // has none.
        streamingError:
          error instanceof ApiError && error.status > 0
            ? `Failed to load streaming preferences (${error.status})`
            : errorMessage(error, "Failed to load streaming preferences"),
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

  // The app has one QueryClient, and much of what it caches is keyed without
  // a user id -- the recap payload, the share card -- because the server scopes
  // it by session. So whenever the signed-in user changes (A to signed out,
  // signed out to B, A to B), everything cached belongs to someone else and
  // is dropped. Not on the first resolution: nobody has been replaced yet,
  // and clearing would only throw away the first page's data.
  //
  // `undefined` means no session has resolved yet; afterwards it is the
  // resolved user id, or null for signed out. A ref, not state: this records
  // whose data the cache holds and never drives a render.
  const queryClient = useQueryClient();
  const cacheOwner = useRef<string | null | undefined>(undefined);
  const userId = state.user?.id ?? null;
  useEffect(() => {
    if (state.loading) return;
    const previous = cacheOwner.current;
    cacheOwner.current = userId;
    if (previous !== undefined && previous !== userId) queryClient.clear();
  }, [state.loading, userId, queryClient]);

  // A query or mutation answered 401: the session may have expired, or been
  // revoked from another device, while this page was open. Ask the server. If
  // it confirms the session is gone, drop the user (which clears the cache above) and
  // refresh the route, so an authenticated page's `requireUser` redirects to
  // /auth with this page as `?redirect`. Only while a user is held: an
  // anonymous visitor's 401s are expected. One check at a time, because a
  // dead session fails every request on the page at once.
  const router = useProgressRouter();
  const heldUser = useRef(false);
  useEffect(() => {
    heldUser.current = state.user !== null;
  }, [state.user]);
  const checkingSession = useRef(false);
  useEffect(() => {
    const onError = async (error: unknown) => {
      if (!isSignedOut(error) || !heldUser.current || checkingSession.current) {
        return;
      }
      checkingSession.current = true;
      try {
        await api(authApi.getSession);
      } catch (sessionError) {
        // Only the server saying so ends the session; a failed check does not.
        if (isSignedOut(sessionError)) {
          clearAuth();
          router.refresh();
        }
      } finally {
        checkingSession.current = false;
      }
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        void onError(event.action.error);
      }
    });
    const unsubscribeMutations = queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error") {
          void onError(event.action.error);
        }
      });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient, clearAuth, router]);

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
