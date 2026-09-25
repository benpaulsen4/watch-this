// @vitest-environment node
import { NextRequest } from "next/server";
import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

const mockUser = { id: "user-1", username: "benjamin" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const getOrGenerateSnapshot = vi.fn();
vi.mock("@/lib/series-finale/service", () => ({
  getOrGenerateSnapshot: (...args: unknown[]) => getOrGenerateSnapshot(...args),
}));

// The real renderer is exercised by share-card.test.tsx. Here ImageResponse
// only records the element tree it was handed, so the privacy test can read
// exactly what would have been drawn.
const rendered: { element: ReactNode; options: unknown }[] = [];
const renderFailure = { error: null as Error | null };
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactNode, options: unknown) {
      super(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      rendered.push({ element, options });
    }

    override async arrayBuffer(): Promise<ArrayBuffer> {
      if (renderFailure.error) throw renderFailure.error;
      return super.arrayBuffer();
    }
  },
}));

const { GET } = await import("./route");

function authedRequest(url: string) {
  return new NextRequest(url, { headers: { cookie: "session=valid" } });
}

const CARD_URL = "http://localhost/api/series-finale/2025/card";

const payload = (): SeriesFinalePayload => ({
  schemaVersion: 2,
  period: {
    start: "2025-01-01T00:00:00.000Z",
    end: "2026-01-01T00:00:00.000Z",
    label: "2025",
  },
  headline: {
    hours: 412,
    minutes: 24720,
    episodes: 1208,
    titlesCompleted: 47,
    titlesDropped: 6,
    unknownRuntimeEpisodes: 0,
    percentile: 4,
  },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: {
    tmdbId: 1,
    title: "The Bear",
    posterPath: "/bear-poster.jpg",
    episodes: 38,
    minutes: 1002,
    finishedAt: "2025-04-04",
    alsoTopFor: ["alsotopfor-zelda"],
  },
  niche: {
    tmdbId: 2,
    title: "Ich war zuhause, aber",
    posterPath: null,
    popularity: 2.1,
    medianPopularity: 68,
    mostPopular: {
      tmdbId: 3,
      title: "Some Blockbuster",
      popularity: 400,
    },
    filmPopularities: [],
  },
  genres: [{ name: "Drama", percent: 22 }],
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    episodes: 10,
  })),
  soloTickTotal: 1041,
  bigDay: null,
  rhythm: {
    archetype: "weekday-marathoner",
    weekdayCounts: [1, 1, 1, 1, 1, 1, 6],
    topWeekday: 6,
    lateShare: 0.41,
  },
  shame: { dropped: [], stillPlanning: [] },
  crew: [{ userId: "u-crew", username: "crewmate-quentin", episodes: 1041 }],
  compare: [
    {
      userId: "u-peer",
      username: "compare-peer-ottoline",
      onlyYou: 62,
      both: 34,
      onlyThem: 28,
      theyFinishedYouDropped: "Their Show",
      bothPlanningNeitherStarted: null,
    },
  ],
  thin: false,
});

/** Every string and number anywhere in a React element tree's props. */
function textOf(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (isValidElement(node)) {
    return Object.values(node.props as Record<string, unknown>).flatMap(textOf);
  }
  if (node && typeof node === "object") {
    return Object.values(node).flatMap(textOf);
  }
  return [];
}

/** `src` of every <img> in the tree. */
function imageSources(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(imageSources);
  if (!isValidElement(node)) return [];

  const props = node.props as { src?: unknown; children?: unknown };
  const own =
    node.type === "img" && typeof props.src === "string" ? [props.src] : [];
  return [...own, ...imageSources(props.children)];
}

function lastTree(): unknown {
  const last = rendered.at(-1);
  expect(last).toBeDefined();
  return last?.element;
}

const POSTER_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const POSTER_DATA_URL = `data:image/jpeg;base64,${Buffer.from(POSTER_BYTES).toString("base64")}`;

describe("GET /api/series-finale/[period]/card", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rendered.length = 0;
    renderFailure.error = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      new Response(POSTER_BYTES, {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a session, and still forbids caching the refusal", async () => {
    const response = await GET(new NextRequest(CARD_URL));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getOrGenerateSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a label that is not a plausible year", async () => {
    const response = await GET(
      authedRequest("http://localhost/api/series-finale/abcd/card"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid period",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getOrGenerateSnapshot).not.toHaveBeenCalled();
  });

  it("maps a null payload to 404", async () => {
    getOrGenerateSnapshot.mockResolvedValue(null);

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rendered).toHaveLength(0);
  });

  it("refuses a thin year rather than drawing a card for it", async () => {
    getOrGenerateSnapshot.mockResolvedValue({ ...payload(), thin: true });

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rendered).toHaveLength(0);
  });

  it("renders the requested period's card as a private 1080x1350 PNG", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getOrGenerateSnapshot).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ label: "2025" }),
    );
    expect(rendered.at(-1)?.options).toEqual({ width: 1080, height: 1350 });

    const text = textOf(lastTree()).join(" ");
    expect(text).toContain("benjamin watched");
    expect(text).toContain("412");
    expect(text).toContain("The Bear");
    expect(text).toContain("Ich war zuhause, aber");
    expect(text).toContain("The Sunday Marathoner");
  });

  it("draws nobody else's name, only the viewer's", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());

    await GET(authedRequest(CARD_URL));

    const text = textOf(lastTree()).join("\n");
    expect(text).not.toContain("crewmate-quentin");
    expect(text).not.toContain("compare-peer-ottoline");
    expect(text).not.toContain("alsotopfor-zelda");
    expect(text).not.toContain("u-crew");
    expect(text).not.toContain("u-peer");
    expect(text).not.toContain("Their Show");
    expect(text).not.toContain("Some Blockbuster");
  });

  it("inlines the top show's w342 poster, fetched with a timeout", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());

    await GET(authedRequest(CARD_URL));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.tmdb.org/t/p/w342/bear-poster.jpg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(imageSources(lastTree())).toContain(POSTER_DATA_URL);
  });

  it("falls back to the placeholder frame when the poster fetch fails", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());
    fetchMock.mockRejectedValue(new Error("network down"));

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(200);
    expect(
      imageSources(lastTree()).filter((src) =>
        src.startsWith("data:image/jpeg"),
      ),
    ).toEqual([]);
  });

  it("does not fetch a poster the top show does not have", async () => {
    const withoutPoster = payload();
    if (withoutPoster.topShow) withoutPoster.topShow.posterPath = null;
    getOrGenerateSnapshot.mockResolvedValue(withoutPoster);

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries the QR and the TMDB attribution as inline images", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());

    await GET(authedRequest(CARD_URL));

    const sources = imageSources(lastTree());
    expect(sources.some((src) => src.startsWith("data:image/png"))).toBe(true);
    expect(sources.every((src) => src.startsWith("data:"))).toBe(true);
    const svgs = sources.filter((src) => src.startsWith("data:image/svg+xml"));
    expect(svgs).toHaveLength(2);
  });

  it("turns a render failure into a 500 rather than a truncated PNG", async () => {
    getOrGenerateSnapshot.mockResolvedValue(payload());
    renderFailure.error = new Error("Expected <div> to have explicit display");

    const response = await GET(authedRequest(CARD_URL));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
