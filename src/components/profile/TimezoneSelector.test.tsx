import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

import { TimezoneSelector } from "./TimezoneSelector";

// Mock Dropdown as a native select to ease testing interactions
vi.mock("@/components/ui/Dropdown", () => ({
  default: ({ selectedKey, onSelectionChange, options }: any) => (
    <select
      data-testid="dropdown"
      value={selectedKey ?? ""}
      onChange={(e) => onSelectionChange(e.target.value)}
    >
      {options.map((o: any) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("TimezoneSelector", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders view mode and switches to edit mode", () => {
    const onUserUpdate = vi.fn();
    renderWithProviders(
      <TimezoneSelector
        user={{ timezone: "UTC" }}
        onUserUpdate={onUserUpdate}
      />,
    );

    expect(screen.getByText(/^UTC$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change timezone/i }));
    expect(screen.getByTestId("dropdown")).toBeInTheDocument();
  });

  it("updates timezone selection and saves", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: true, json: async () => ({}) },
    );
    const onUserUpdate = vi.fn();
    renderWithProviders(
      <TimezoneSelector
        user={{ timezone: "UTC" }}
        onUserUpdate={onUserUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /change timezone/i }));
    const dropdown = screen.getByTestId("dropdown") as HTMLSelectElement;
    // Choose a timezone that is likely present in fallback list
    fireEvent.change(dropdown, { target: { value: "Europe/London" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/session",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(onUserUpdate).toHaveBeenCalled();
    });
  });

  it("shows error when save fails", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: false, json: async () => ({ error: "Failed to update timezone" }) },
    );
    const onUserUpdate = vi.fn();
    renderWithProviders(
      <TimezoneSelector
        user={{ timezone: "UTC" }}
        onUserUpdate={onUserUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /change timezone/i }));
    const dropdown = screen.getByTestId("dropdown") as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: "Asia/Tokyo" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to update timezone/i),
      ).toBeInTheDocument();
    });
  });
});
