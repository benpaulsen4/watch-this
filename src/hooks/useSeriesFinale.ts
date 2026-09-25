"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

export interface SeriesFinaleListItem {
  label: string;
  generatedAt: string;
  dismissedAt: string | null;
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

export function useSeriesFinale(period: string) {
  return useQuery({
    queryKey: ["series-finale", period],
    queryFn: async () => {
      const data = await getJson<{ payload: SeriesFinalePayload }>(
        `/api/series-finale/${period}`,
      );
      return data.payload;
    },
    // A snapshot is frozen, so there is nothing to refetch for.
    staleTime: Infinity,
    // A 404 means "not available", not "try again" -- and the first
    // generation runs the whole aggregation, which can take seconds either way.
    retry: false,
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
