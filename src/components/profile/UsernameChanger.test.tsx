import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsernameChanger } from "./UsernameChanger";

function createQueryClient() {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("UsernameChanger", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const baseUser = {
    id: "u1",
    username: "alice",
    profilePictureUrl: "",
    timezone: "UTC",
    createdAt: new Date("2024-01-01").toISOString(),
  };

  it("shows current username and enters edit mode", () => {
    const onUserUpdate = vi.fn();
    renderWithProviders(<UsernameChanger user={baseUser as any} onUserUpdate={onUserUpdate} />);

    expect(screen.getByText(/@alice/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change username/i }));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("validates username and shows error for invalid input", () => {
    const onUserUpdate = vi.fn();
    renderWithProviders(<UsernameChanger user={baseUser as any} onUserUpdate={onUserUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /change username/i }));
    const input = screen.getByLabelText(/username/i);
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(
      screen.getByText(/username must be at least 3 characters/i)
    ).toBeInTheDocument();
  });

  it("saves valid username and calls onUserUpdate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { ...baseUser, username: "bob" } }),
    });
    const onUserUpdate = vi.fn();
    renderWithProviders(<UsernameChanger user={baseUser as any} onUserUpdate={onUserUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /change username/i }));
    const input = screen.getByLabelText(/username/i);
    fireEvent.change(input, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "PUT" }));
      expect(onUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ username: "bob" }));
    });
  });

  it("handles 409 conflict error for taken username", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "This username is already taken" }),
    });

    const onUserUpdate = vi.fn();
    renderWithProviders(<UsernameChanger user={baseUser as any} onUserUpdate={onUserUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /change username/i }));
    const input = screen.getByLabelText(/username/i);
    // Use a different username than the current to enable the Save button
    fireEvent.change(input, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/already taken/i)).toBeInTheDocument();
    });
  });
});