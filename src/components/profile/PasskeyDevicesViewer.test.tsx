import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PasskeyDevicesViewer } from "./PasskeyDevicesViewer";
import { initiatePasskeyClaim } from "@/lib/auth/client";

vi.mock("@/lib/auth/client", () => ({
  initiatePasskeyClaim: vi.fn(),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,claim") },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("PasskeyDevicesViewer", () => {
  process.on("unhandledRejection", () => {});
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows loading spinner initially", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({ devices: [] }) },
    );
    renderWithProviders(<PasskeyDevicesViewer />);
    expect(screen.getByText(/loading devices/i)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it("renders devices with formatted dates and last used text", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          devices: [
            {
              id: "1",
              deviceName: "Android Phone",
              createdAt: "2024-01-01T10:00:00Z",
              lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
            {
              id: "2",
              deviceName: "MacBook Pro",
              createdAt: "2023-12-30T08:00:00Z",
              lastUsed: null,
            },
          ],
        }),
      },
    );

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
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: false, json: async () => ({ error: "Failed to load devices" }) },
    );
    renderWithProviders(<PasskeyDevicesViewer />);
    expect(
      await screen.findByText(/failed to load devices/i),
    ).toBeInTheDocument();
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

  it("disables delete when only one device and enables when multiple", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          devices: [
            {
              id: "1",
              deviceName: "Phone",
              createdAt: new Date().toISOString(),
              lastUsed: null,
            },
          ],
        }),
      },
    );

    renderWithProviders(<PasskeyDevicesViewer />);
    await screen.findByText(/passkey devices/i);
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    expect(deleteButtons[0]).toBeDisabled();

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          devices: [
            {
              id: "1",
              deviceName: "Phone",
              createdAt: new Date().toISOString(),
              lastUsed: null,
            },
            {
              id: "2",
              deviceName: "Laptop",
              createdAt: new Date().toISOString(),
              lastUsed: null,
            },
          ],
        }),
      },
    );

    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshButton);
    await screen.findByText(/laptop/i);

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({}) },
    );
    const deleteBtn = screen.getAllByRole("button", { name: /delete/i })[0];
    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(
        calls.some(
          (c: any[]) =>
            typeof c[0] === "string" && c[0].includes("/api/profile/devices/"),
        ),
      ).toBe(true);
    });
  });

  it("initiates claim, shows modal with claim info and QR, copy works", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({ devices: [] }) },
    );
    (
      initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      claimId: "c-1",
      claimCode: "ABCDEFGH12",
      token: "tkn",
      magicLink: "https://site/auth/claim?token=tkn",
      qrPayload: "https://site/auth/claim?token=tkn",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    (navigator as any).clipboard = { writeText: vi.fn(async () => undefined) };

    renderWithProviders(<PasskeyDevicesViewer />);
    await screen.findByText(/passkey devices/i);

    const addBtn = screen.getByRole("button", { name: /add passkey/i });
    await userEvent.click(addBtn);

    expect(await screen.findByText(/claim code/i)).toBeInTheDocument();
    expect(screen.getByText(/abcdefgh12/i)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://site/auth/claim?token=tkn"),
    ).toBeInTheDocument();
    expect(screen.getByAltText(/qr code/i)).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await userEvent.click(copyBtn);
    expect(
      await screen.findByRole("button", { name: /copied/i }),
    ).toBeInTheDocument();
  });

  it("shows rate limit error on claim initiation failure", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({ devices: [] }) },
    );
    (
      initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Rate limit exceeded"));

    window.addEventListener("unhandledrejection", (e) => e.preventDefault());

    renderWithProviders(<PasskeyDevicesViewer />);
    await screen.findByText(/passkey devices/i);
    const addBtn = screen.getByRole("button", { name: /add passkey/i });
    await userEvent.click(addBtn);

    expect(
      await screen.findByText(/too many add passkey attempts/i),
    ).toBeInTheDocument();
  });

  it("shows polling indicator when claim modal is open", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({ devices: [] }),
      },
    );
    (
      initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      claimId: "c-2",
      claimCode: "CODE12345678",
      token: "tkn2",
      magicLink: "https://site/auth/claim?token=tkn2",
      qrPayload: "https://site/auth/claim?token=tkn2",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    renderWithProviders(<PasskeyDevicesViewer />);
    await screen.findByText(/passkey devices/i);
    await userEvent.click(screen.getByRole("button", { name: /add passkey/i }));
    expect(
      await screen.findByText(/listening for new device/i),
    ).toBeInTheDocument();
  });

  it("cancels claim and calls DELETE endpoint", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({ devices: [] }) },
    );
    (
      initiatePasskeyClaim as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      claimId: "c-3",
      claimCode: "CODE87654321",
      token: "tkn3",
      magicLink: "https://site/auth/claim?token=tkn3",
      qrPayload: "https://site/auth/claim?token=tkn3",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: any) => {
        const u = String(url);
        if (u.includes("/api/profile/devices/claims/")) {
          return { ok: true, json: async () => ({}) } as any;
        }
        return { ok: true, json: async () => ({ devices: [] }) } as any;
      },
    );

    renderWithProviders(<PasskeyDevicesViewer />);
    await screen.findByText(/passkey devices/i);
    await userEvent.click(screen.getByRole("button", { name: /add passkey/i }));
    await screen.findByText(/claim code/i);

    const cancelBtn = screen.getByRole("button", { name: /cancel claim/i });
    await userEvent.click(cancelBtn);
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(
        calls.some((c: any[]) =>
          String(c[0]).includes("/api/profile/devices/claims/"),
        ),
      ).toBe(true);
    });
  });
});
