import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentSession } from "@/lib/auth/client";

import { AuthProvider, useAuth, useStreamingPreferences } from "./AuthProvider";

vi.mock("@/lib/auth/client", () => ({ getCurrentSession: vi.fn() }));

const signedIn = {
  user: {
    id: "u1",
    username: "alice",
    profilePictureUrl: "",
    timezone: "UTC",
    createdAt: "2024-01-01",
  },
};

function StreamingProbe() {
  const { streamingPreferences, streamingError } = useStreamingPreferences();
  return (
    <div>
      <span data-testid="country">{streamingPreferences?.country ?? "none"}</span>
      <span data-testid="streaming-error">{streamingError ?? ""}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentSession as any).mockResolvedValue(signedIn);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads streaming preferences once for an authenticated user", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ country: "GB", providers: [] }),
    }));
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as any);

    render(
      <AuthProvider>
        <StreamingProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("country").textContent).toBe("GB"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // UI-02: the effect used to be guarded on `!streamingPreferences &&
  // !streamingLoading`. A failed attempt restores both, so the effect re-fired
  // on every commit and hammered the endpoint with no cap.
  //
  // The request has to resolve on a later task, not synchronously: the bug
  // needs React to actually commit `streamingLoading: true` and then see it go
  // back to false. A mock that settles in a microtask lets both updates
  // coalesce into one render, which hides the loop entirely.
  it("does not retry the streaming request after a failed attempt", async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as any);

    render(
      <AuthProvider>
        <StreamingProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("streaming-error").textContent).not.toBe(""),
    );

    // Give the effect many more commit opportunities to misbehave.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the failure instead of looking like empty preferences", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (async () => ({ ok: false, status: 503, json: async () => ({}) })) as any,
    );

    render(
      <AuthProvider>
        <StreamingProbe />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Failed to load streaming preferences \(503\)/),
    ).toBeInTheDocument();
  });

  it("keeps the context value stable across renders that do not change auth state", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ country: "GB", providers: [] }),
      })) as any,
    );

    const seen: unknown[] = [];

    function ContextIdentityProbe() {
      seen.push(useAuth());
      return null;
    }

    function Host() {
      const [tick, setTick] = useState(0);
      return (
        <AuthProvider>
          <button onClick={() => setTick(tick + 1)}>rerender</button>
          <span data-testid="tick">{tick}</span>
          <ContextIdentityProbe />
        </AuthProvider>
      );
    }

    const user = userEvent.setup();
    render(<Host />);

    await waitFor(() => expect(seen.at(-1)).toBeDefined());
    await waitFor(() =>
      expect((seen.at(-1) as { user: unknown }).user).not.toBeNull(),
    );

    const before = seen.at(-1);
    await user.click(screen.getByRole("button", { name: /rerender/i }));
    expect(screen.getByTestId("tick").textContent).toBe("1");

    // UI-13: the provider re-renders, but nothing about auth changed, so every
    // consumer must get the same context object back.
    expect(seen.at(-1)).toBe(before);
  });
});
