"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

export interface SeriesFinaleListItem {
  label: string;
  generatedAt: string;
  dismissedAt: string | null;
  storyCompletedAt: string | null;
  headline: SeriesFinalePayload["headline"];
}

/**
 * A 404 from `GET /api/series-finale/[period]` means the period is not
 * available to this user (before their recaps start, or not yet over in
 * their own timezone) -- retrying never helps, unlike a transient failure.
 */
export class SeriesFinaleUnavailableError extends Error {
  constructor() {
    super("Period not available");
    this.name = "SeriesFinaleUnavailableError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new SeriesFinaleUnavailableError();
    }
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

const LIST_KEY = ["series-finale", "list"] as const;

export function useSeriesFinaleList() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const data = await getJson<{ periods: SeriesFinaleListItem[] }>(
        "/api/series-finale",
      );
      return data.periods;
    },
  });
}

interface SeriesFinalePeriodResponse {
  payload: SeriesFinalePayload;
  storyCompletedAt: string | null;
}

const periodQueryKey = (period: string) => ["series-finale", period] as const;

/**
 * The one query both period hooks observe. The cache holds
 * `{ payload, storyCompletedAt }` (see `useCompleteStory`, which needs
 * somewhere to write the latter optimistically); each hook `select`s its half.
 */
function periodQueryOptions(period: string) {
  return queryOptions({
    queryKey: periodQueryKey(period),
    queryFn: () =>
      getJson<SeriesFinalePeriodResponse>(`/api/series-finale/${period}`),
    // A snapshot is frozen, so there is nothing to refetch for.
    staleTime: Infinity,
    // A 404 means "not available", not "try again" -- and the first
    // generation runs the whole aggregation, which can take seconds either way.
    retry: false,
  });
}

export function useSeriesFinale(period: string) {
  return useQuery({
    ...periodQueryOptions(period),
    select: (data) => data.payload,
  });
}

/**
 * When the viewer finished this period's story, or null if they have not:
 * the phone recap's gate. Undefined until the period has loaded. Shares the
 * payload's query, so it costs no request of its own.
 */
export function useStoryCompletedAt(period: string) {
  return useQuery({
    ...periodQueryOptions(period),
    select: (data) => data.storyCompletedAt,
  });
}

/**
 * Dismiss a period's banner, optimistically.
 *
 * The list the banner reads is `GET /api/series-finale`, which generates any
 * missing year before it answers and can take seconds for a long history --
 * so waiting for its refetch would leave "Not now" looking like it did
 * nothing. The cached list is marked dismissed at once instead, put back if
 * the POST fails, and refetched either way. `onSettled` returns the
 * invalidation so the mutation stays pending until the list has caught up.
 */
export function useDismissSeriesFinale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: string) => {
      const response = await fetch(`/api/series-finale/${period}/dismiss`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Dismiss failed");
    },
    onMutate: async (period: string) => {
      // An in-flight list fetch would land after this and overwrite it.
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const previous =
        queryClient.getQueryData<SeriesFinaleListItem[]>(LIST_KEY);
      queryClient.setQueryData<SeriesFinaleListItem[]>(LIST_KEY, (periods) =>
        periods?.map((item) =>
          item.label === period
            ? { ...item, dismissedAt: new Date().toISOString() }
            : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _period, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(LIST_KEY, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

/**
 * Record that the viewer has gone through the whole story, optimistically.
 *
 * The phone recap is gated on this (see `RecapClient`): the story is the
 * default there, and the recap opens once `storyCompletedAt` is set,
 * remembered on the account so it holds across devices. Both caches that carry it -- this
 * period's payload query and the dashboard/profile list -- are updated at
 * once, the same way `useDismissSeriesFinale` updates the list, and rolled
 * back if the POST fails.
 *
 * The route is idempotent (the first completed timestamp wins), and the
 * optimistic update mirrors that: it only fills in a timestamp where one
 * isn't already cached, rather than overwriting an earlier completion.
 */
export function useCompleteStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: string) => {
      const response = await fetch(
        `/api/series-finale/${period}/story-complete`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Story completion failed");
    },
    onMutate: async (period: string) => {
      const queryKey = periodQueryKey(period);
      // In-flight fetches for either cache would otherwise land after this
      // and overwrite it.
      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        queryClient.cancelQueries({ queryKey: LIST_KEY }),
      ]);

      const previousPeriod =
        queryClient.getQueryData<SeriesFinalePeriodResponse>(queryKey);
      const previousList =
        queryClient.getQueryData<SeriesFinaleListItem[]>(LIST_KEY);

      const completedAt = new Date().toISOString();

      queryClient.setQueryData<SeriesFinalePeriodResponse>(queryKey, (data) =>
        data
          ? { ...data, storyCompletedAt: data.storyCompletedAt ?? completedAt }
          : data,
      );
      queryClient.setQueryData<SeriesFinaleListItem[]>(LIST_KEY, (periods) =>
        periods?.map((item) =>
          item.label === period
            ? {
                ...item,
                storyCompletedAt: item.storyCompletedAt ?? completedAt,
              }
            : item,
        ),
      );

      return { queryKey, previousPeriod, previousList };
    },
    onError: (_error, _period, context) => {
      if (!context) return;
      if (context.previousPeriod !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPeriod);
      }
      if (context.previousList !== undefined) {
        queryClient.setQueryData(LIST_KEY, context.previousList);
      }
    },
    onSettled: (_data, _error, period) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: periodQueryKey(period) }),
        queryClient.invalidateQueries({ queryKey: LIST_KEY }),
      ]),
  });
}
