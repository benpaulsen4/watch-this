import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "../../../requireUser";
import SeriesFinaleStoryPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// The real module reaches the database at import. The client projection is
// passed through unchanged: this suite is about what the page hands down.
vi.mock("../../../requireUser", () => ({
  requireUser: vi.fn(),
  toClientUser: (user: unknown) => user,
}));
vi.mock("@/components/series-finale/StoryReel", () => ({
  StoryReel: ({
    period,
    user,
  }: {
    period: string;
    user: { username: string };
  }) => (
    <div>
      story {period} for {user.username}
    </div>
  ),
}));

const params = (period: string) => ({ params: Promise.resolve({ period }) });

describe("SeriesFinaleStoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireUser as any).mockResolvedValue({
      id: "u1",
      username: "ben",
      profilePictureUrl: null,
      timezone: "Europe/London",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });
  });

  it("hands the story the period and the signed-in user", async () => {
    render(await SeriesFinaleStoryPage(params("2026")));

    expect(requireUser).toHaveBeenCalledWith("/series-finale/2026/story");
    expect(screen.getByText("story 2026 for ben")).toBeInTheDocument();
  });

  it("is a 404 for a segment that is not a period", async () => {
    await expect(SeriesFinaleStoryPage(params("latest"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});
