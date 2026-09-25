import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { StoryCard } from "./StoryCard";

const payload = (overrides: Partial<SeriesFinalePayload> = {}) =>
  ({
    schemaVersion: 2,
    period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
    headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
    episodes: { total: 1208, perDay: 3.3 },
    finished: { films: 31, shows: 16, total: 47 },
    topShow: null, niche: null, genres: [],
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
    soloTickTotal: 0,
    bigDay: null,
    rhythm: { archetype: null, weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
    shame: { dropped: [], stillPlanning: [] },
    crew: [], compare: [], thin: false,
    ...overrides,
  }) as SeriesFinalePayload;

const viewer = { username: "ben", profilePictureUrl: "" };

/** The default headline with its dropped count replaced. */
const droppedCount = (titlesDropped: number) => ({
  headline: { ...payload().headline, titlesDropped },
});

const renderCard = (
  id: Parameters<typeof StoryCard>[0]["id"],
  overrides: Partial<SeriesFinalePayload> = {},
) => render(<StoryCard id={id} payload={payload(overrides)} viewer={viewer} />);

const topShow = {
  tmdbId: 1, title: "The Bear", posterPath: "/bear.jpg", episodes: 38,
  minutes: 1002, finishedAt: "2026-04-04", alsoTopFor: ["marcus"],
};

const niche = {
  tmdbId: 2, title: "Ich war zuhause, aber", posterPath: null,
  popularity: 2.1, medianPopularity: 68,
  mostPopular: { tmdbId: 3, title: "Dune: Part Two", popularity: 411.6 },
  filmPopularities: [50, 2.1, 411.6, ...Array.from({ length: 28 }, () => 68)],
};

const member = (username: string, episodes: number) => ({
  userId: `id-${username}`, username, episodes,
});

const peer = (username: string, both: number) => ({
  userId: `id-${username}`, username, onlyYou: 62, both, onlyThem: 28,
  theyFinishedYouDropped: "Foundation",
  bothPlanningNeitherStarted: null,
});

describe("StoryCard", () => {
  it("renders the intro", () => {
    renderCard("intro");
    expect(screen.getByText("Series Finale")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("renders the hours card with the percentile", () => {
    renderCard("hours");
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText(/Top 4%/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "in front of something. That is seventeen straight days, or roughly two and a half working months if you had a job doing this.",
      ),
    ).toBeInTheDocument();
  });

  it("omits the percentile line when null", () => {
    renderCard("hours", {
      headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: null },
    });
    expect(screen.queryByText(/Top/)).not.toBeInTheDocument();
  });

  it("omits the percentile line for the lower half", () => {
    renderCard("hours", {
      headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 14, percentile: 96 },
    });
    expect(screen.queryByText(/Top/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Excludes 14 episodes or films with no runtime on TMDB"),
    ).toBeInTheDocument();
  });

  it("gives the episode rate as an average, not a claim about every day", () => {
    const { container } = renderCard("episodes");
    expect(screen.getByText("1,208")).toBeInTheDocument();
    expect(screen.getByText("3.3 a day, on average.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/every day|by hand|plane/);
  });

  it("splits finished titles into films and shows", () => {
    renderCard("finished");
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("films")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(
      screen.getByText(
        "things, all the way to the end. Which is more impressive than it sounds, given six others did not make it.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the top show and when its last episode was watched, with TMDB attribution", () => {
    const { container } = renderCard("topShow", { topShow });
    expect(screen.getByText("Your #1 show")).toBeInTheDocument();
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    // Decorative beside the visible title: not read out twice.
    expect(screen.queryByAltText("The Bear")).not.toBeInTheDocument();
    expect(container.querySelector('img[alt=""][src*="bear.jpg"]')).not.toBeNull();
    expect(
      screen.getByText("38 episodes · 16h 42m · last watched 4 April"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Also number one for marcus. You two need new material."),
    ).toBeInTheDocument();
    // It is the last episode watched, not a finish: the show may be ongoing.
    expect(container.textContent).not.toMatch(/finished/);
    expect(screen.getByAltText("TMDB")).toBeInTheDocument();
  });

  it("leaves the date out when the top show has none", () => {
    renderCard("topShow", { topShow: { ...topShow, finishedAt: null } });
    expect(screen.getByText("38 episodes · 16h 42m")).toBeInTheDocument();
  });

  it("counts everyone sharing the top show", () => {
    renderCard("topShow", {
      topShow: { ...topShow, alsoTopFor: ["ana", "marcus"] },
    });
    expect(
      screen.getByText(
        "Also number one for ana and marcus. You three need new material.",
      ),
    ).toBeInTheDocument();
  });

  it("compares the niche film against the other films finished", () => {
    const { container } = renderCard("niche", { niche });
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(
      screen.getByText(
        "TMDB popularity 2.1, against a median of 68 for the other 30 films you finished.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Most famous: Dune: Part Two, popularity 412"),
    ).toBeInTheDocument();
    expect(screen.getByText("your 31 films, by popularity")).toBeInTheDocument();
    // Least popular first, the niche film itself marked.
    const bars = Array.from(
      container.querySelectorAll<HTMLElement>("[data-popularity]"),
    );
    expect(bars).toHaveLength(31);
    expect(bars[0]?.dataset.popularity).toBe("niche");
    expect(container.textContent).not.toMatch(/crew|mentioned/);
    expect(screen.getByAltText("TMDB")).toBeInTheDocument();
  });

  it("shows the genre split with TMDB attribution and no invented tagline", () => {
    renderCard("genres", {
      genres: [
        { name: "Sci-Fi & Fantasy", percent: 28 },
        { name: "Drama", percent: 22 },
      ],
    });
    expect(screen.getByText("Your genres")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi & Fantasy")).toBeInTheDocument();
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.queryByText(/quietly sad/)).not.toBeInTheDocument();
    expect(screen.getByAltText("TMDB")).toBeInTheDocument();
  });

  it("gives the months a shape by a stated rule", () => {
    renderCard("months", {
      months: [90, 60, 174, 80, 40, 20, 29, 30, 60, 70, 80, 90].map(
        (episodes, index) => ({ month: index + 1, episodes }),
      ),
    });
    expect(
      screen.getByText("March happened. June, not so much."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Peak March, 174/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("months-peak")).toHaveTextContent("174 in March");
    expect(screen.getByTestId("months-quietest")).toHaveTextContent(
      "20 in June",
    );
  });

  it("names the biggest day without clock times", () => {
    const { container } = renderCard("bigDay", {
      soloTickTotal: 12,
      bigDay: {
        date: "2026-03-14", episodes: 11, minutes: 500, timeline: null,
        soloTickCount: 0,
        streak: { days: 23, start: "2026-01-02", end: "2026-01-24" },
      },
    });
    expect(screen.getByText("Sat")).toBeInTheDocument();
    expect(screen.getByText("14 Mar")).toBeInTheDocument();
    expect(
      screen.getByText("Eleven episodes in one day, 8h 20m of screen."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only 12 episodes this year were ticked one at a time — too few to put on a clock.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Longest streak: 23 days, 2–24 Jan"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}|food/);
  });

  it("names the watching type and says what rhythm measures", () => {
    renderCard("rhythm", {
      rhythm: {
        archetype: "weekday-marathoner",
        weekdayCounts: [0, 20, 20, 20, 20, 20, 100],
        topWeekday: 6,
        lateShare: 0.41,
      },
    });
    expect(screen.getByText("The Sunday Marathoner")).toBeInTheDocument();
    expect(
      screen.getByText(
        "One day a week does most of the work. 50% of your episodes landed on a Sunday. 41% of the episodes you ticked one at a time came after 21:00. Mondays had no episodes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Episodes by weekday. Peak Sunday." }),
    ).toBeInTheDocument();
  });

  it("lists the dropped shows and the longest-waiting film", () => {
    renderCard("shame", {
      ...droppedCount(2),
      shame: {
        dropped: [
          { tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" },
          { tmdbId: 2, title: "Citadel", lastEpisode: null },
        ],
        stillPlanning: [
          { tmdbId: 3, title: "Blade Runner 2049", days: 1104, runtime: 164 },
          { tmdbId: 4, title: "Heat", days: 800, runtime: 170 },
        ],
      },
    });
    expect(
      screen.getByText(
        "Two shows marked dropped. These episodes were what tipped you over the edge.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(screen.getByText("last: S2E03")).toBeInTheDocument();
    expect(screen.getByText("Citadel")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Blade Runner 2049, for 1,104 days. It is 164 minutes long.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("One more is waiting behind it."),
    ).toBeInTheDocument();
  });

  it("counts the dropped shows it has no room to list", () => {
    const dropped = Array.from({ length: 8 }, (_, index) => ({
      tmdbId: index, title: `Show ${index}`, lastEpisode: null,
    }));
    renderCard("shame", {
      ...droppedCount(8),
      shame: { dropped, stillPlanning: [] },
    });
    expect(screen.getByText("Show 5")).toBeInTheDocument();
    expect(screen.queryByText("Show 6")).not.toBeInTheDocument();
    expect(screen.getByText("And two more.")).toBeInTheDocument();
  });

  it("states the headline's dropped count and counts the shows it could not name", () => {
    // Six dropped, five with metadata: the card says six, as the finished
    // card and the recap's stat tile do, and covers the sixth.
    const dropped = Array.from({ length: 5 }, (_, index) => ({
      tmdbId: index, title: `Show ${index}`, lastEpisode: "S1E02",
    }));
    renderCard("shame", {
      ...droppedCount(6),
      shame: { dropped, stillPlanning: [] },
    });
    expect(
      screen.getByText(
        "Six shows marked dropped. These episodes were what tipped you over the edge.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Show 4")).toBeInTheDocument();
    expect(screen.getByText("And one more.")).toBeInTheDocument();
  });

  it("speaks about the waiting films when nothing was dropped", () => {
    const { container } = renderCard("shame", {
      ...droppedCount(0),
      shame: {
        dropped: [],
        stillPlanning: [
          { tmdbId: 3, title: "Blade Runner 2049", days: 1104, runtime: null },
        ],
      },
    });
    expect(
      screen.getByText(
        "Nothing dropped this year. This film, on the other hand, is still waiting.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 shows|Zero shows/i);
  });

  it("ranks the crew by episodes, the viewer's from the headline", () => {
    renderCard("crew", {
      crew: [member("ana", 1041), member("tom", 88)],
    });
    expect(
      screen.getByText("You out-watched two people who were also trying"),
    ).toBeInTheDocument();
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.getByText("1,208 episodes")).toBeInTheDocument();
    expect(screen.getByText("1,041 episodes")).toBeInTheDocument();
    expect(screen.queryByText(/joined/)).not.toBeInTheDocument();
  });

  it("shows the crew's top five plus the viewer, as the mock does", () => {
    renderCard("crew", {
      headline: { hours: 1, minutes: 60, episodes: 5, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: null },
      crew: ["a", "b", "c", "d", "e", "f", "g", "h"].map((name, index) =>
        member(name, 800 - index * 10),
      ),
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.queryByText("f")).not.toBeInTheDocument();
    expect(screen.getByText("And three more.")).toBeInTheDocument();
  });

  it("compares with the closest peer and swaps to the others", async () => {
    renderCard("compare", {
      compare: [peer("ana", 34), peer("marcus", 5)],
    });
    expect(screen.getByText("You & ana")).toBeInTheDocument();
    expect(
      screen.getByText("A shared list, and some shared taste"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("34 titles in common out of 124. A 27% overlap."),
    ).toBeInTheDocument();
    expect(screen.getByText("ana finished, you dropped")).toBeInTheDocument();
    expect(screen.queryByText(/She|He finished|joint streak/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "marcus" }));

    expect(screen.getByText("You & marcus")).toBeInTheDocument();
    expect(
      screen.getByText("A shared list, and almost no shared taste"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ana" })).toBeInTheDocument();
  });

  it("renders the summary card", () => {
    renderCard("summary", {
      topShow,
      niche,
      rhythm: { archetype: "completionist", weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
    });
    expect(screen.getByText(/412/)).toBeInTheDocument();
    expect(screen.getByText("ben's year")).toBeInTheDocument();
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("Ich war zuhause, aber")).toBeInTheDocument();
    expect(screen.getByText("The Completionist")).toBeInTheDocument();
    expect(screen.queryByText(/Share/)).not.toBeInTheDocument();
  });

  it("leaves out summary rows the payload has nothing for", () => {
    renderCard("summary");
    expect(screen.queryByText("Top show")).not.toBeInTheDocument();
    expect(screen.queryByText("Deepest cut")).not.toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
  });

  it("uses no exclamation marks anywhere", () => {
    const full = {
      topShow, niche,
      genres: [{ name: "Drama", percent: 40 }],
      soloTickTotal: 12,
      bigDay: { date: "2026-03-14", episodes: 11, minutes: 500, timeline: null, soloTickCount: 0, streak: null },
      rhythm: { archetype: "completionist" as const, weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: 0.4 },
      shame: { dropped: [{ tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" }], stillPlanning: [] },
      crew: [member("ana", 1041)],
      compare: [peer("ana", 34)],
    };
    for (const id of [
      "intro", "hours", "episodes", "finished", "topShow", "niche", "genres",
      "months", "bigDay", "rhythm", "shame", "crew", "compare", "summary",
    ] as const) {
      const { container, unmount } = render(
        <StoryCard id={id} payload={payload(full)} viewer={viewer} />,
      );
      expect(container.textContent).not.toContain("!");
      unmount();
    }
  });
});
