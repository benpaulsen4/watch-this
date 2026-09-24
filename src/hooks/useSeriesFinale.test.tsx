import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SeriesFinaleUnavailableError,
  useDismissSeriesFinale,
  useSeriesFinale,
  useSeriesFinaleList,
} from "./useSeriesFinale";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSeriesFinaleList", () => {
  it("returns the periods array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ periods: [{ label: "2026" }] }),
      }),
    );

    const { result } = renderHook(() => useSeriesFinaleList(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ label: "2026" }]);
  });
});

describe("useSeriesFinale", () => {
  it("requests the given period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: { schemaVersion: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026");
  });

  it("surfaces a 404 as SeriesFinaleUnavailableError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Period not available" }),
      }),
    );

    const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SeriesFinaleUnavailableError);
  });

  it("surfaces a 500 as a plain error, not SeriesFinaleUnavailableError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).not.toBeInstanceOf(SeriesFinaleUnavailableError);
  });
});

describe("useDismissSeriesFinale", () => {
  it("posts to the dismiss endpoint and invalidates the list query on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDismissSeriesFinale(), {
      wrapper: localWrapper,
    });

    result.current.mutate("2026");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/dismiss", {
      method: "POST",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["series-finale", "list"],
    });
  });
});
