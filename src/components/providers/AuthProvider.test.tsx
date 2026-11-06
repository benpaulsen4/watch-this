import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { getCurrentSession } from "@/lib/auth/client";

import { AuthProvider, useAuth, useStreamingPreferences } from "./AuthProvider";

vi.mock("@/lib/auth/client", () => ({ getCurrentSession: vi.fn() }));

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const signedIn = {
  user: {
    id: "u1",
    username: "alice",
    profilePictureUrl: "",
    timezone: "UTC",
    createdAt: "2024-01-01",
  },
};

const signedInAs = (id: string, username: string) => ({
  user: { ...signedIn.user, id, username },
});

/** As the root layout nests them: the auth provider inside the query client. */
function render(ui: ReactElement, client = new QueryClient()) {
  return rtlRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function StreamingProbe() {
  const { streamingPreferences, streamingError } = useStreamingPreferences();
  return (
    <div>
      <span data-testid="country">
        {streamingPreferences?.country ?? "none"}
      </span>
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
    vi.spyOn(global, "fetch").mockImplementation((async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as any);

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
    vi.spyOn(global, "fetch").mockImplementation((async () => ({
      ok: true,
      status: 200,
      json: async () => ({ country: "GB", providers: [] }),
    })) as any);

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

  describe("query cache across sign-ins", () => {
    // Something cached for whoever was signed in: a stand-in for the recap
    // payload or the share card, both of which are keyed without a user.
    const SEEDED = ["cached-for-the-previous-user"];

    function SessionProbe() {
      const { user, loading, refreshSession, clearAuth } = useAuth();
      return (
        <div>
          <span data-testid="who">
            {loading ? "loading" : (user?.username ?? "signed-out")}
          </span>
          <button onClick={() => void refreshSession()}>refresh</button>
          <button onClick={clearAuth}>sign out</button>
        </div>
      );
    }

    const who = () => screen.getByTestId("who").textContent;

    const renderSession = (client: QueryClient) =>
      render(
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>,
        client,
      );

    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation((async () => ({
        ok: true,
        status: 200,
        json: async () => ({ country: "GB", providers: [] }),
      })) as any);
    });

    it("keeps the cache when the first session resolves", async () => {
      const client = new QueryClient();
      client.setQueryData(SEEDED, "first page's data");

      renderSession(client);
      await waitFor(() => expect(who()).toBe("alice"));

      expect(client.getQueryData(SEEDED)).toBe("first page's data");
    });

    it("clears the cache when a different user signs in", async () => {
      const client = new QueryClient();
      renderSession(client);
      await waitFor(() => expect(who()).toBe("alice"));
      client.setQueryData(SEEDED, "alice's card");

      (getCurrentSession as any).mockResolvedValue(signedInAs("u2", "bob"));
      await userEvent.click(screen.getByRole("button", { name: "refresh" }));
      await waitFor(() => expect(who()).toBe("bob"));

      expect(client.getQueryData(SEEDED)).toBeUndefined();
    });

    it("clears the cache on sign-out", async () => {
      const client = new QueryClient();
      renderSession(client);
      await waitFor(() => expect(who()).toBe("alice"));
      client.setQueryData(SEEDED, "alice's card");

      await userEvent.click(screen.getByRole("button", { name: "sign out" }));
      await waitFor(() => expect(who()).toBe("signed-out"));

      expect(client.getQueryData(SEEDED)).toBeUndefined();
    });

    it("clears the cache when someone signs in after a signed-out start", async () => {
      (getCurrentSession as any).mockResolvedValue(null);
      const client = new QueryClient();
      renderSession(client);
      await waitFor(() => expect(who()).toBe("signed-out"));
      client.setQueryData(SEEDED, "cached while signed out");

      (getCurrentSession as any).mockResolvedValue(signedIn);
      await userEvent.click(screen.getByRole("button", { name: "refresh" }));
      await waitFor(() => expect(who()).toBe("alice"));

      expect(client.getQueryData(SEEDED)).toBeUndefined();
    });

    // A rename or a picture change refreshes the session for the same user.
    it("keeps the cache when a refresh returns the same user", async () => {
      const client = new QueryClient();
      renderSession(client);
      await waitFor(() => expect(who()).toBe("alice"));
      client.setQueryData(SEEDED, "alice's card");

      (getCurrentSession as any).mockResolvedValue(
        signedInAs("u1", "alice-renamed"),
      );
      await userEvent.click(screen.getByRole("button", { name: "refresh" }));
      await waitFor(() => expect(who()).toBe("alice-renamed"));

      expect(client.getQueryData(SEEDED)).toBe("alice's card");
    });
  });

  describe("a 401 while signed in", () => {
    const SEEDED = ["cached-for-alice"];
    const expired = () =>
      new ApiError("unauthenticated", 401, "Authentication required");

    function UserProbe() {
      const { user, loading } = useAuth();
      return (
        <span data-testid="who">
          {loading ? "loading" : (user?.username ?? "signed-out")}
        </span>
      );
    }
    const who = () => screen.getByTestId("who").textContent;

    /** The streaming preferences load succeeds; the session check answers `session`. */
    function stubFetch(session: { ok: boolean; status: number; body: unknown }) {
      const fetchMock = vi.fn(async (url: string) =>
        url === "/api/auth/session"
          ? { ok: session.ok, status: session.status, json: async () => session.body }
          : {
              ok: true,
              status: 200,
              json: async () => ({ country: "GB", providers: [] }),
            },
      );
      vi.spyOn(global, "fetch").mockImplementation(fetchMock as any);
      return () =>
        fetchMock.mock.calls.filter(([url]) => url === "/api/auth/session")
          .length;
    }
    const sessionGone = {
      ok: false,
      status: 401,
      body: { error: "Invalid session", code: "invalidSession" },
    };

    async function renderSignedIn(client = new QueryClient()) {
      render(
        <AuthProvider>
          <UserProbe />
        </AuthProvider>,
        client,
      );
      await waitFor(() => expect(who()).toBe("alice"));
      return client;
    }

    const failQuery = (client: QueryClient, key: string, error: Error) =>
      client
        .fetchQuery({
          queryKey: [key],
          queryFn: () => Promise.reject(error),
          retry: false,
        })
        .catch(() => {});

    it("signs out, clears the cache and refreshes the route when the server confirms", async () => {
      const sessionChecks = stubFetch(sessionGone);
      const client = await renderSignedIn();
      client.setQueryData(SEEDED, "alice's data");

      await failQuery(client, "lists", expired());

      await waitFor(() => expect(who()).toBe("signed-out"));
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(SEEDED)).toBeUndefined();
      expect(sessionChecks()).toBe(1);
    });

    it("reacts to a failed mutation too", async () => {
      stubFetch(sessionGone);
      const client = await renderSignedIn();

      await client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(expired()) })
        .execute(undefined)
        .catch(() => {});

      await waitFor(() => expect(who()).toBe("signed-out"));
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("keeps the user when the session is still valid", async () => {
      const sessionChecks = stubFetch({
        ok: true,
        status: 200,
        body: signedIn,
      });
      const client = await renderSignedIn();

      await failQuery(client, "lists", expired());
      await waitFor(() => expect(sessionChecks()).toBe(1));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(who()).toBe("alice");
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("loads the other account when another tab has signed in", async () => {
      stubFetch({ ok: true, status: 200, body: signedInAs("u2", "bob") });
      const client = await renderSignedIn();

      (getCurrentSession as any).mockResolvedValue(signedInAs("u2", "bob"));
      await failQuery(client, "lists", expired());

      await waitFor(() => expect(who()).toBe("bob"));
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("keeps the user when the session check itself fails", async () => {
      const sessionChecks = stubFetch({ ok: false, status: 503, body: {} });
      const client = await renderSignedIn();

      await failQuery(client, "lists", expired());
      await waitFor(() => expect(sessionChecks()).toBe(1));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(who()).toBe("alice");
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("checks once when many requests fail together", async () => {
      const sessionChecks = stubFetch(sessionGone);
      const client = await renderSignedIn();

      await Promise.all([
        failQuery(client, "a", expired()),
        failQuery(client, "b", expired()),
        failQuery(client, "c", expired()),
      ]);

      await waitFor(() => expect(who()).toBe("signed-out"));
      expect(sessionChecks()).toBe(1);
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("ignores other errors", async () => {
      const sessionChecks = stubFetch(sessionGone);
      const client = await renderSignedIn();

      await failQuery(client, "a", new ApiError("notFound", 404, "Not found"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(sessionChecks()).toBe(0);
      expect(who()).toBe("alice");
    });

    it("does nothing for an anonymous visitor", async () => {
      (getCurrentSession as any).mockResolvedValue(null);
      const sessionChecks = stubFetch(sessionGone);
      const client = new QueryClient();
      render(
        <AuthProvider>
          <UserProbe />
        </AuthProvider>,
        client,
      );
      await waitFor(() => expect(who()).toBe("signed-out"));

      await failQuery(client, "a", expired());
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(sessionChecks()).toBe(0);
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });
});
