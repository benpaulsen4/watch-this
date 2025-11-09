import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpcomingActivityCard } from "./UpcomingActivityCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    const upcoming = { id: 101, name: "The Show", poster_path: "/poster.jpg" };
    renderWithClient(
      <UpcomingActivityCard upcoming={upcoming as any} onEpisodeWatched={() => {}} />,
    );

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "The Show");

    const user = userEvent.setup();
    await user.click(img);

    // Modal should reflect open state
    const modal = screen.getByTestId("content-modal");
    expect(modal.getAttribute("data-open")).toBe("true");
  });

  it("calls mutation and onEpisodeWatched when clicking button", async () => {
    const upcoming = { id: 202, name: "Another Show", poster_path: "/x.jpg" };
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
});