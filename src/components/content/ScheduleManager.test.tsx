import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScheduleManager } from "./ScheduleManager";

function setupQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ScheduleManager", () => {
  const tmdbId = 1234;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows message for completed or dropped status", () => {
    renderWithQuery(<ScheduleManager tmdbId={tmdbId} watchStatus="completed" />);
    expect(screen.getByText(/Only shows that are planning, watching, or paused/i)).toBeInTheDocument();
  });

  it("allows adding and removing schedule entries", async () => {
    // Schedules state by day (0=Sunday..)
    let schedulesByDay: Record<number, any[]> = {
      0: [{ id: "s1", tmdbId, dayOfWeek: 0, createdAt: new Date(), title: "My Show" }],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url === "/api/schedules" && method === "GET") {
        return { ok: true, json: async () => ({ schedules: schedulesByDay }) } as Response;
      }
      if (url === "/api/schedules" && method === "POST") {
        const body = JSON.parse(String(init?.body || '{}'));
        const day = body.dayOfWeek;
        const newSchedule = { id: `s-${Date.now()}`, tmdbId, dayOfWeek: day, createdAt: new Date(), title: "My Show" };
        return { ok: true, json: async () => newSchedule } as Response;
      }
      if (url.startsWith("/api/schedules?") && method === "DELETE") {
        const params = new URLSearchParams(url.split("?")[1]);
        const day = Number(params.get("dayOfWeek"));
        return { ok: true, json: async () => ({ dayOfWeek: day }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);

    renderWithQuery(<ScheduleManager tmdbId={tmdbId} watchStatus="watching" />);

    // Initial state shows Add; clicking should schedule and show Remove
    const user = userEvent.setup();
    const addButtons = await screen.findAllByRole("button", { name: /Add/i });
    expect(addButtons.length).toBeGreaterThan(0);
    await user.click(addButtons[0]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Remove/i }).length).toBeGreaterThan(0));

    // Now remove and expect Add to reappear
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    await user.click(removeButtons[0]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Add/i }).length).toBeGreaterThan(0));
  });
});