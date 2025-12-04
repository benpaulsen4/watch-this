import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfilePictureManager } from "./ProfilePictureManager";

function createQueryClient() {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("ProfilePictureManager", () => {
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

  it("shows prompt when no picture and toggles to edit mode", () => {
    const onUserUpdate = vi.fn();
    renderWithProviders(
      <ProfilePictureManager
        user={baseUser as any}
        onUserUpdate={onUserUpdate}
      />,
    );

    expect(screen.getByText(/no profile picture set/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add picture/i }));
    expect(screen.getByLabelText(/image url/i)).toBeInTheDocument();
  });

  it("disables Save for invalid URL", () => {
    const onUserUpdate = vi.fn();
    renderWithProviders(
      <ProfilePictureManager
        user={baseUser as any}
        onUserUpdate={onUserUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add picture/i }));
    const input = screen.getByLabelText(/image url/i);
    fireEvent.change(input, { target: { value: "ftp://bad" } });
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it("saves a valid url and calls onUserUpdate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          user: {
            ...baseUser,
            profilePictureUrl: "https://example.com/img.jpg",
          },
        }),
      },
    );

    const onUserUpdate = vi.fn();
    renderWithProviders(
      <ProfilePictureManager
        user={baseUser as any}
        onUserUpdate={onUserUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add picture/i }));
    const input = screen.getByLabelText(/image url/i);
    fireEvent.change(input, {
      target: { value: "https://example.com/img.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/session",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(onUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          profilePictureUrl: "https://example.com/img.jpg",
        }),
      );
    });
  });

  it("cancel restores original state", () => {
    const onUserUpdate = vi.fn();
    const userWithPic = {
      ...baseUser,
      profilePictureUrl: "https://example.com/old.jpg",
    };
    renderWithProviders(
      <ProfilePictureManager
        user={userWithPic as any}
        onUserUpdate={onUserUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /change picture/i }));
    const input = screen.getByLabelText(/image url/i);
    fireEvent.change(input, {
      target: { value: "https://example.com/new.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Back to non-edit view, shows old URL text
    expect(
      screen.getByText(/https:\/\/example.com\/old.jpg/i),
    ).toBeInTheDocument();
  });
});
