import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "../../requireUser";
import SeriesFinalePage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// The real module reaches the database at import. The client projection is
// passed through unchanged: this suite is about what the page hands down.
vi.mock("../../requireUser", () => ({
  requireUser: vi.fn(),
  toClientUser: (user: unknown) => user,
}));
vi.mock("@/components/series-finale/RecapClient", () => ({
  RecapClient: ({
    period,
    user,
  }: {
    period: string;
    user: { username: string; timezone: string };
  }) => (
    <div>
      recap {period} for {user.username} in {user.timezone}
    </div>
  ),
}));

const params = (period: string) => ({ params: Promise.resolve({ period }) });

describe("SeriesFinalePage", () => {
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

  it("hands the recap the period and the signed-in user", async () => {
    render(await SeriesFinalePage(params("2026")));

    expect(requireUser).toHaveBeenCalledWith("/series-finale/2026");
    expect(
      screen.getByText("recap 2026 for ben in Europe/London"),
    ).toBeInTheDocument();
  });

  it("is a 404 for a segment that is not a period", async () => {
    await expect(SeriesFinalePage(params("latest"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});
