import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refetchOnResume } from "./refetch-on-resume";

const fetcher = vi.fn<() => Promise<string>>();

function Consumer() {
  const { data, status } = useQuery({
    queryKey: ["resume-test"],
    queryFn: fetcher,
    refetchOnWindowFocus: refetchOnResume,
  });
  return <div>{data ?? status}</div>;
}

function renderConsumer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Consumer />
    </QueryClientProvider>,
  );
}

async function resumeAfter(ms: number) {
  await act(async () => {
    focusManager.setFocused(false);
    vi.setSystemTime(Date.now() + ms);
    focusManager.setFocused(true);
  });
}

describe("refetchOnResume", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    focusManager.setFocused(undefined);
  });

  it("refetches when the app resumes with data over a minute old", async () => {
    fetcher.mockResolvedValue("fresh");
    renderConsumer();
    await screen.findByText("fresh");

    await resumeAfter(60_001);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("does not refetch on a quick app switch", async () => {
    fetcher.mockResolvedValue("fresh");
    renderConsumer();
    await screen.findByText("fresh");

    await resumeAfter(30_000);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // A query that has never succeeded has dataUpdatedAt 0, so judging age by data
  // alone would re-request it and flash its loading state on every app switch.
  it("does not retry a recent failure on a quick app switch", async () => {
    fetcher.mockRejectedValue(new Error("nope"));
    renderConsumer();
    await screen.findByText("error");

    await resumeAfter(30_000);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
