import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
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
  storyCompletedAt: null,
  headline: { episodes: 1208, titlesCompleted: 47, hours: 412 },
  ...overrides,
});

/**
 * Renders the banner and resolves once its list has landed, so an empty
 * render means "decided to show nothing" rather than "still loading" -- the
 * banner renders null while it waits, so an assertion made before then can
 * never fail.
 */
async function renderSettled() {
  const view = render(<SeriesFinaleBanner />, { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

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

  it("opens the recap, which hands a phone on to the story", async () => {
    listResponse([item()]);
    render(<SeriesFinaleBanner />, { wrapper });

    expect(
      await screen.findByRole("link", { name: "See your Series Finale" }),
    ).toHaveAttribute("href", "/series-finale/2026");
  });

  it("leads with the year's figures and nothing more", async () => {
    listResponse([item()]);
    render(<SeriesFinaleBanner />, { wrapper });

    expect(
      await screen.findByText("1,208 episodes. 47 titles."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/A card at a time/)).not.toBeInTheDocument();
  });

  it("keeps the CTA and Not now together: stacked full width on phones, side by side from md", async () => {
    listResponse([item()]);
    render(<SeriesFinaleBanner />, { wrapper });

    const cta = await screen.findByRole("link", {
      name: "See your Series Finale",
    });
    const notNow = screen.getByRole("button", { name: "Not now" });
    const group = cta.parentElement;
    expect(notNow.parentElement).toBe(group);
    expect(group).toHaveClass("flex-col", "md:flex-row", "md:items-center");
    for (const action of [cta, notNow]) {
      expect(action).toHaveClass("w-full", "md:w-auto");
    }
  });

  it("renders nothing when the period is dismissed", async () => {
    listResponse([item({ dismissedAt: "2027-01-02T00:00:00.000Z" })]);
    const { container } = await renderSettled();

    expect(container.textContent).toBe("");
  });

  it("renders nothing once the period's story has been gone through", async () => {
    listResponse([item({ storyCompletedAt: "2027-01-02T00:00:00.000Z" })]);
    const { container } = await renderSettled();

    expect(container.textContent).toBe("");
  });

  it("renders nothing when no periods exist", async () => {
    listResponse([]);
    const { container } = await renderSettled();

    expect(container.textContent).toBe("");
  });

  it("hides the banner as soon as Not now is pressed, and posts the dismissal", async () => {
    // The POST never settles, so the only thing that can hide the banner is
    // the optimistic update -- not the list's refetch.
    let resolvePost: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) =>
      url === "/api/series-finale/2026/dismiss"
        ? new Promise((resolve) => {
            resolvePost = resolve;
          })
        : Promise.resolve({
            ok: true,
            json: async () => ({ periods: [item()] }),
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<SeriesFinaleBanner />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText(/Your 2026 Series Finale is ready/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() => expect(container.textContent).toBe(""));
    expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/dismiss", {
      method: "POST",
    });

    // The refetch after the POST answers with the dismissed row, as the
    // server would, and the banner stays gone.
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          periods: [item({ dismissedAt: "2027-01-02T00:00:00.000Z" })],
        }),
      }),
    );
    resolvePost({ ok: true, json: async () => ({ success: true }) });

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/series-finale")).toHaveLength(2),
    );
    expect(container.textContent).toBe("");
  });

  it("brings the banner back with a line saying so when the dismissal fails", async () => {
    let resolvePost: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) =>
      url === "/api/series-finale/2026/dismiss"
        ? new Promise((resolve) => {
            resolvePost = resolve;
          })
        : Promise.resolve({
            ok: true,
            json: async () => ({ periods: [item()] }),
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<SeriesFinaleBanner />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText(/Your 2026 Series Finale is ready/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    await waitFor(() => expect(container.textContent).toBe(""));

    resolvePost({ ok: false, json: async () => ({ error: "nope" }) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not dismiss that. Try again.",
    );
    expect(screen.getByText(/Your 2026 Series Finale is ready/)).toBeInTheDocument();
  });

  it("ignores an older undismissed period once the newest is dismissed", async () => {
    listResponse([
      item({ dismissedAt: "2027-01-02T00:00:00.000Z" }),
      item({ label: "2025", dismissedAt: null }),
    ]);
    const { container } = await renderSettled();

    expect(container.textContent).toBe("");
  });

  it("renders nothing when the newest period is thin", async () => {
    listResponse([
      item({ headline: { episodes: 4, titlesCompleted: 2, hours: 1 } }),
    ]);
    const { container } = await renderSettled();

    expect(container.textContent).toBe("");
  });
});
