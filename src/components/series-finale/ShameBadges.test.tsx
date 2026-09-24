import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DroppedBadges, PlanningBadges } from "./ShameBadges";

describe("DroppedBadges", () => {
  it("names each show with the episode that tipped it", () => {
    render(
      <DroppedBadges
        shows={[
          { tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" },
          { tmdbId: 2, title: "Citadel", lastEpisode: null },
        ]}
      />,
    );

    expect(screen.getByText("Foundation · S2E03")).toBeInTheDocument();
    expect(screen.getByText("Citadel")).toBeInTheDocument();
  });
});

describe("PlanningBadges", () => {
  it("names each film with how long it has waited", () => {
    render(
      <PlanningBadges
        films={[
          { tmdbId: 1, title: "Blade Runner 2049", days: 1104, runtime: 164 },
          { tmdbId: 2, title: "Stalker", days: 1, runtime: null },
        ]}
      />,
    );

    expect(
      screen.getByText("Blade Runner 2049 · 1,104 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stalker · 1 day")).toBeInTheDocument();
  });
});
