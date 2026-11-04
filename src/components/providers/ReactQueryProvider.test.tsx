import { focusManager, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReactQueryProvider } from "./ReactQueryProvider";

const fetcher = vi.fn<() => Promise<string>>();

function Consumer() {
  const { data } = useQuery({ queryKey: ["resume-test"], queryFn: fetcher });
  return <div>{data ?? "loading"}</div>;
}

async function resumeAfter(ms: number) {
  await act(async () => {
    focusManager.setFocused(false);
    vi.setSystemTime(Date.now() + ms);
    focusManager.setFocused(true);
  });
}

describe("ReactQueryProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetcher.mockResolvedValue("fresh");
  });

  afterEach(() => {
    vi.useRealTimers();
    focusManager.setFocused(undefined);
  });

  async function renderLoaded() {
    render(
      <ReactQueryProvider>
        <Consumer />
      </ReactQueryProvider>,
    );
    await screen.findByText("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  }

  it("refetches when the app resumes with data over a minute old", async () => {
    await renderLoaded();

    await resumeAfter(60_001);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("does not refetch on a quick app switch", async () => {
    await renderLoaded();

    await resumeAfter(30_000);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
