import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileFinaleRows } from "./ProfileFinaleRows";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const listResponse = (periods: unknown[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ periods }) }),
  );

describe("ProfileFinaleRows", () => {
  it("lists every generated period newest first", async () => {
    listResponse([
      {
        label: "2026",
        generatedAt: "2027-01-01T00:00:00.000Z",
        dismissedAt: null,
        headline: { episodes: 1208, titlesCompleted: 47 },
      },
      {
        label: "2025",
        generatedAt: "2026-01-01T00:00:00.000Z",
        dismissedAt: null,
        headline: { episodes: 844, titlesCompleted: 31 },
      },
    ]);

    render(<ProfileFinaleRows />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText("Series Finale 2026")).toBeInTheDocument(),
    );
    expect(screen.getByText("Series Finale 2025")).toBeInTheDocument();
  });

  it("says plainly when there is nothing yet, rather than showing an empty list", async () => {
    listResponse([]);
    render(<ProfileFinaleRows />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/No Series Finale yet/)).toBeInTheDocument(),
    );
  });

  it("orders newest first, links each row to its recap, and states the counts", async () => {
    listResponse([
      {
        label: "2026",
        generatedAt: "2027-01-01T00:00:00.000Z",
        dismissedAt: null,
        headline: { episodes: 1208, titlesCompleted: 47 },
      },
      {
        label: "2025",
        generatedAt: "2026-01-01T00:00:00.000Z",
        dismissedAt: "2026-02-01T00:00:00.000Z",
        headline: { episodes: 844, titlesCompleted: 31 },
      },
    ]);

    render(<ProfileFinaleRows />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText("Series Finale 2026")).toBeInTheDocument(),
    );

    const rows = screen.getAllByRole("link", { name: "Open" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/series-finale/2026");
    expect(rows[1]).toHaveAttribute("href", "/series-finale/2025");

    expect(screen.getByText("1,208 episodes · 47 titles")).toBeInTheDocument();
    expect(screen.getByText("844 episodes · 31 titles")).toBeInTheDocument();
  });

  it("singularises a period with exactly one episode and one title", async () => {
    listResponse([
      {
        label: "2022",
        generatedAt: "2023-01-01T00:00:00.000Z",
        dismissedAt: null,
        headline: { episodes: 1, titlesCompleted: 1 },
      },
    ]);

    render(<ProfileFinaleRows />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText("1 episode · 1 title")).toBeInTheDocument(),
    );
  });
});
