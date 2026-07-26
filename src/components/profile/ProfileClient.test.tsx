import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileClient } from "./ProfileClient";

// Stub child components to avoid deep dependency coupling in this test
vi.mock("./ProfilePictureManager", () => ({
  ProfilePictureManager: () => <div>ProfilePictureManager</div>,
}));
// Renders the username it is handed, so tests can tell *which* user object
// ProfileClient resolved and passed down.
vi.mock("./UsernameChanger", () => ({
  UsernameChanger: ({ user }: { user: { username: string } }) => (
    // One template string, not an interpolated child: JSX would split this into
    // two text nodes and getByText matches a single node.
    <div>{`UsernameChanger:${user.username}`}</div>
  ),
}));
vi.mock("./TimezoneSelector", () => ({
  TimezoneSelector: () => <div>TimezoneSelector</div>,
}));
vi.mock("./PasskeyDevicesViewer", () => ({
  PasskeyDevicesViewer: () => <div>PasskeyDevicesViewer</div>,
}));
vi.mock("./DataExportImport", () => ({
  DataExportImport: () => <div>DataExportImport</div>,
}));
vi.mock("./StreamingPreferences", () => ({
  StreamingPreferences: () => <div>StreamingPreferences</div>,
}));

// The user this page is rendered with server-side. ProfileClient must not need
// the auth context to have resolved before it can show this.
const SERVER_USER = {
  id: "u1",
  username: "alice",
  profilePictureUrl: "https://example.com/p.jpg",
  timezone: "UTC",
  createdAt: new Date("2024-01-01").toISOString(),
};

// Mutable so a test can put the context in its pre-resolution state, which is
// what the component used to sit behind a full-screen spinner waiting for.
const { authState } = vi.hoisted(() => ({
  authState: {
    current: {
      user: null as typeof SERVER_USER | null,
      loading: true,
      refreshSession: vi.fn(),
    },
  },
}));

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => authState.current,
}));

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ProfileClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    // useFragmentNavigation reads the active tab from the URL fragment, and
    // jsdom keeps one window for the whole file -- so a test that clicks a tab
    // leaves its hash behind and the next test starts on that tab instead of
    // the default. Reset it so each test controls its own starting state.
    window.history.replaceState(null, "", window.location.pathname);
    // Default to a resolved context, matching a page that has been open long
    // enough for the session fetch to land.
    authState.current = {
      user: SERVER_USER,
      loading: false,
      refreshSession: vi.fn(),
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders tabs and default profile tab content", () => {
    render(<ProfileClient initialUser={SERVER_USER} />);

    // Sidebar entries
    expect(
      screen.getByRole("button", { name: /profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /security/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /streaming/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /data management/i }),
    ).toBeInTheDocument();

    // Default content
    expect(screen.getByText(/profile information/i)).toBeInTheDocument();
    expect(screen.getByText("ProfilePictureManager")).toBeInTheDocument();
    expect(screen.getByText("UsernameChanger:alice")).toBeInTheDocument();
    expect(screen.getByText("TimezoneSelector")).toBeInTheDocument();
  });

  it("switches tabs and displays corresponding content", () => {
    render(<ProfileClient initialUser={SERVER_USER} />);

    fireEvent.click(screen.getByRole("button", { name: /security/i }));
    expect(screen.getByText("PasskeyDevicesViewer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /data management/i }));
    expect(screen.getByText("DataExportImport")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /streaming/i }));
    expect(screen.getByText("StreamingPreferences")).toBeInTheDocument();
  });

  // UI-14: `validTabs` was an inline array literal, so useFragmentNavigation's
  // memoised getter changed identity every render and its popstate effect tore
  // the listener down and re-added it continuously.
  it("does not re-subscribe its popstate listener on re-render", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    render(<ProfileClient initialUser={SERVER_USER} />);

    const popstateAdds = () =>
      addSpy.mock.calls.filter(([type]) => type === "popstate").length;
    const popstateRemoves = () =>
      removeSpy.mock.calls.filter(([type]) => type === "popstate").length;

    expect(popstateAdds()).toBe(1);

    // Any state change re-renders the component.
    fireEvent.click(screen.getByRole("button", { name: /security/i }));
    fireEvent.click(screen.getByRole("button", { name: /data management/i }));

    expect(popstateAdds()).toBe(1);
    expect(popstateRemoves()).toBe(0);
  });

  // UI-07. Deleting the client-gated route-group layout is only half the fix:
  // this page took its user from the auth context, so it still blocked on
  // `GET /api/auth/session` behind a full-screen spinner even though the server
  // component had already resolved the very same user. The page now passes it
  // down, so an unresolved context must not hide anything.
  it("renders from the server-provided user without waiting on the auth context", () => {
    authState.current = {
      user: null,
      loading: true,
      refreshSession: vi.fn(),
    };

    render(<ProfileClient initialUser={SERVER_USER} />);

    // Fully rendered, not a spinner, and showing the server-resolved user.
    expect(screen.getByText(/profile information/i)).toBeInTheDocument();
    expect(screen.getByText("UsernameChanger:alice")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /logout/i }),
    ).toBeInTheDocument();

    // And it did not go asking for the session it was already handed.
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/auth/session",
      expect.anything(),
    );
    expect(global.fetch).not.toHaveBeenCalledWith("/api/auth/session");
  });

  // The context is still the source of truth once it has something to say --
  // refreshSession() after a username change must be reflected, not shadowed by
  // the now-stale server value.
  it("prefers the context user once the context has resolved", () => {
    authState.current = {
      user: { ...SERVER_USER, username: "renamed" },
      loading: false,
      refreshSession: vi.fn(),
    };

    render(<ProfileClient initialUser={SERVER_USER} />);

    // The refreshed name, not the one baked into the server render.
    expect(screen.getByText("UsernameChanger:renamed")).toBeInTheDocument();
    expect(screen.queryByText("UsernameChanger:alice")).not.toBeInTheDocument();
  });

  it("logs out and navigates to /auth", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({}) },
    );
    render(<ProfileClient initialUser={SERVER_USER} />);

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
      });
    });
  });
});
