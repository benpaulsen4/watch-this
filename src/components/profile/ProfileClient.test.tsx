import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileClient } from "./ProfileClient";

// Stub child components to avoid deep dependency coupling in this test
vi.mock("./ProfilePictureManager", () => ({
  ProfilePictureManager: () => <div>ProfilePictureManager</div>,
}));
vi.mock("./UsernameChanger", () => ({
  UsernameChanger: () => <div>UsernameChanger</div>,
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

// Mock useAuth
vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "alice",
      profilePictureUrl: "https://example.com/p.jpg",
      timezone: "UTC",
      createdAt: new Date("2024-01-01").toISOString(),
    },
    refreshSession: vi.fn(),
  }),
}));

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ProfileClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders tabs and default profile tab content", () => {
    render(<ProfileClient />);

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
    expect(screen.getByText("UsernameChanger")).toBeInTheDocument();
    expect(screen.getByText("TimezoneSelector")).toBeInTheDocument();
  });

  it("switches tabs and displays corresponding content", () => {
    render(<ProfileClient />);

    fireEvent.click(screen.getByRole("button", { name: /security/i }));
    expect(screen.getByText("PasskeyDevicesViewer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /data management/i }));
    expect(screen.getByText("DataExportImport")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /streaming/i }));
    expect(screen.getByText("StreamingPreferences")).toBeInTheDocument();
  });

  it("logs out and navigates to /auth", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({}) },
    );
    render(<ProfileClient />);

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
      });
    });
  });
});
