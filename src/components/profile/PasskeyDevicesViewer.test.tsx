import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PasskeyDevicesViewer } from "./PasskeyDevicesViewer";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PasskeyDevicesViewer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows loading spinner initially", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) });
    renderWithProviders(<PasskeyDevicesViewer />);
    expect(screen.getByText(/loading devices/i)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it("renders devices with formatted dates and last used text", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { id: "1", deviceName: "Android Phone", createdAt: "2024-01-01T10:00:00Z", lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
          { id: "2", deviceName: "MacBook Pro", createdAt: "2023-12-30T08:00:00Z", lastUsed: null },
        ],
      }),
    });

    renderWithProviders(<PasskeyDevicesViewer />);

    expect(await screen.findByText(/passkey devices/i)).toBeInTheDocument();
    expect(screen.getByText(/manage the devices/i)).toBeInTheDocument();

    // Device names
    expect(screen.getByText(/android phone/i)).toBeInTheDocument();
    expect(screen.getByText(/macbook pro/i)).toBeInTheDocument();

    // Last used texts
    expect(screen.getByText(/used 2 hours ago/i)).toBeInTheDocument();
    expect(screen.getByText(/never used/i)).toBeInTheDocument();
    expect(screen.getByText(/never used/i)).toBeInTheDocument();
  });

  it("shows error when API fails", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Failed to load devices" }) });
    renderWithProviders(<PasskeyDevicesViewer />);
    expect(await screen.findByText(/failed to load devices/i)).toBeInTheDocument();
  });

  it("refetches on refresh button click", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) });

    renderWithProviders(<PasskeyDevicesViewer />);

    await screen.findByText(/passkey devices/i);
    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});