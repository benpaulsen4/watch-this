import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,describe, expect, it, vi } from "vitest";

import { UpcomingActivityCard } from "./UpcomingActivityCard";

// Mock next/image to a plain img for test environment
vi.mock("next/image", () => ({
  default: (props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock ContentDetailsModal to a simple element exposing isOpen state
vi.mock("../content/ContentDetailsModal", () => ({
  ContentDetailsModal: ({ isOpen }: any) => (
    <div data-testid="content-modal" data-open={String(!!isOpen)} />
  ),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  // no-op
});

describe("UpcomingActivityCard", () => {
  it("renders poster image and opens modal when clicked", async () => {
    const upcoming = {
      tmdbId: 101,
      title: "The Show",
      posterPath: "/poster.jpg",
    };
    renderWithClient(
      <UpcomingActivityCard
        upcoming={upcoming as any}
        onEpisodeWatched={() => {}}
      />,
    );

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "The Show");

    const user = userEvent.setup();
    await user.click(img);

    // Modal should reflect open state
    const modal = screen.getByTestId("content-modal");
    expect(modal.getAttribute("data-open")).toBe("true");
  });

  // UI-03: the modal opener was an onClick on the <Image> itself.
  it("opens the modal from the keyboard", async () => {
    const upcoming = {
      tmdbId: 303,
      title: "Keyboard Show",
      posterPath: "/poster.jpg",
    };
    renderWithClient(
      <UpcomingActivityCard upcoming={upcoming as any} onEpisodeWatched={() => {}} />,
    );

    const opener = screen.getByRole("button", {
      name: /View details for Keyboard Show/i,
    });
    opener.focus();

    const user = userEvent.setup();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("content-modal").getAttribute("data-open")).toBe(
      "true",
    );
  });

  it("calls mutation and onEpisodeWatched when clicking button", async () => {
    const upcoming = {
      tmdbId: 202,
      title: "Another Show",
      posterPath: "/x.jpg",
    };
    const onEpisodeWatched = vi.fn();
    // Successful mutation
    // @ts-expect-error assign to global
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

    renderWithClient(
      <UpcomingActivityCard
        upcoming={upcoming as any}
        onEpisodeWatched={onEpisodeWatched}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Episode Watched/i }));

    // Callback triggered after successful mutation
    expect(onEpisodeWatched).toHaveBeenCalled();
  });

  // UI-06: the mutation had onSuccess and onSettled but no onError, and the
  // handler awaited mutateAsync bare - so a failure stopped the spinner, said
  // nothing, and produced an unhandled rejection.
  it("reports a failed episode update instead of rejecting unhandled", async () => {
    // Rejections from a click handler surface on the Node process, not as a
    // window "unhandledrejection" event, under jsdom.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    // @ts-expect-error assign to global
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Episode has not aired yet" }),
    }));

    renderWithClient(
      <UpcomingActivityCard
        upcoming={{ tmdbId: 404, title: "Sad Show", posterPath: null } as any}
        onEpisodeWatched={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Episode Watched/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Episode has not aired yet/i,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onRejection);
    expect(rejections).toEqual([]);
  });
});
