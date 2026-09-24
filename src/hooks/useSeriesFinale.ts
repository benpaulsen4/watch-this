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

export function useSeriesFinaleList() {
  return useQuery({
    queryKey: ["series-finale", "list"],
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

export function useDismissSeriesFinale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: string) => {
      const response = await fetch(`/api/series-finale/${period}/dismiss`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Dismiss failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series-finale", "list"] });
    },
  });
}
