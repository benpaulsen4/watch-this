import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeriesFinaleBanner } from "./SeriesFinaleBanner";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const listResponse = (periods: unknown[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ periods }) }),
  );

const item = (overrides: Record<string, unknown> = {}) => ({
  label: "2026",
  generatedAt: "2027-01-01T00:00:00.000Z",
  dismissedAt: null,
  headline: { episodes: 1208, titlesCompleted: 47, hours: 412 },
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SeriesFinaleBanner", () => {
  it("promotes the newest undismissed period", async () => {
    listResponse([item()]);
    render(<SeriesFinaleBanner />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Your 2026 Series Finale is ready/)).toBeInTheDocument(),
    );
  });

  it("renders nothing when the period is dismissed", async () => {
    listResponse([item({ dismissedAt: "2027-01-02T00:00:00.000Z" })]);
    const { container } = render(<SeriesFinaleBanner />, { wrapper });

    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders nothing when no periods exist", async () => {
    listResponse([]);
    const { container } = render(<SeriesFinaleBanner />, { wrapper });

    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("posts a dismissal when Not now is pressed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ periods: [item()] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesFinaleBanner />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText(/Your 2026 Series Finale is ready/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/dismiss", {
        method: "POST",
      }),
    );
  });

  it("ignores an older undismissed period once the newest is dismissed", async () => {
    listResponse([
      item({ dismissedAt: "2027-01-02T00:00:00.000Z" }),
      item({ label: "2025", dismissedAt: null }),
    ]);
    const { container } = render(<SeriesFinaleBanner />, { wrapper });

    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders nothing when the newest period is thin", async () => {
    listResponse([
      item({ headline: { episodes: 4, titlesCompleted: 2, hours: 1 } }),
    ]);
    const { container } = render(<SeriesFinaleBanner />, { wrapper });

    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
