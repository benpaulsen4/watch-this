# Series Finale 4 — UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a frozen Series Finale payload as a desktop recap page, a 14-card mobile story, a dashboard banner, and profile rows.

**Architecture:** One payload feeds every surface. A server component fetches the user and renders a client component that reads the payload through TanStack Query, matching the app's existing split. Cards are small, individually-nullable components — a null slice renders nothing rather than failing the page. The story is a state machine over an ordered card list, so adding a card is one array entry plus one component.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Tailwind CSS 4, lucide-react, existing `src/components/ui/` primitives.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`

**Mock:** Claude Design `WatchThis Wrapped.dc.html` — artboards `1a`/`1h` (banner), `1b` (profile rows), `1c` (story), `1e` (desktop recap). Consult the artboards for exact spacing and colour; this plan specifies structure, behaviour and copy.

**Dependencies:** Requires plan 3 complete (the API routes must exist).

## Global Constraints

- Next.js 16 App Router, React 19. Pages under `src/app/(authenticated)/` are **server components** using `requireUser` from `src/app/(authenticated)/requireUser`; anything fetching client-side is a `"use client"` component using TanStack Query.
- **Dark only.** There is no light theme and nothing may assume one. Surfaces step `bg-gray-950` (page) → `bg-gray-900` (header) → `bg-gray-800` (card) → `bg-gray-700` (track). Text steps `text-white` → `text-gray-100` → `text-gray-300` → `text-gray-400` → `text-gray-500`.
- Only the seven brand palettes compile: gray, red, purple, orange, green, blue, yellow. `emerald`, `teal`, `indigo` and friends render as nothing.
- **One gradient treatment per view.** `Button variant="gradient"` (red→orange) is the single strongest action; `variant="entertainment"` (purple→red→orange) is for marketing surfaces.
- Reach for an existing primitive before styling a `div`: `Card`, `Button`, `Badge`, `ProfileImage`, `LoadingSpinner`, `PageHeader`, `Modal`. Every variant the mock uses already exists.
- TMDB attribution (`BrandLogo mark="tmdb"`) must appear on any surface showing their metadata, unrestyled.
- **Voice: plain, slightly wry. No exclamation marks. No marketing-speak.** Empty states say what is missing and what to do next.
- Icons from `lucide-react`, matching existing usage.
- Tests: Vitest + React Testing Library, `<name>.test.tsx` beside the component.
- Lint zero-warnings: `npm run lint:ci`. Typecheck: `npm run typecheck`.

## Accessibility requirements (apply to every task)

- The story advances on tap **and** on `ArrowRight` / `ArrowLeft`; it must not be tap-only.
- Every progress bar has `role="progressbar"` with `aria-valuenow` / `aria-valuemax`.
- Charts carry a text alternative — the bar values are already in the copy; give the chart container an `aria-label` naming the peak.
- The story's close control is a real `<button>` with an accessible name, not a styled `div`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/hooks/useSeriesFinale.ts` (create) | Query hooks for list, payload, dismissal |
| `src/components/series-finale/StatTile.tsx` (create) | One big number with a label |
| `src/components/series-finale/BarChart.tsx` (create) | Monthly and weekday bars |
| `src/components/series-finale/ThinYearCard.tsx` (create) | Too-little-data state |
| `src/components/series-finale/RecapClient.tsx` (create) | Desktop recap composition |
| `src/components/series-finale/StoryReel.tsx` (create) | Story state machine and chrome |
| `src/components/series-finale/story-cards/*.tsx` (create) | The 14 cards |
| `src/components/series-finale/SeriesFinaleBanner.tsx` (create) | Dashboard banner |
| `src/components/series-finale/ProfileFinaleRows.tsx` (create) | Profile list |
| `src/app/(authenticated)/series-finale/[period]/page.tsx` (create) | Recap route |
| `src/app/(authenticated)/series-finale/[period]/story/page.tsx` (create) | Story route |
| `src/app/(authenticated)/dashboard/page.tsx` (modify) | Mount the banner |
| `src/app/(authenticated)/profile/page.tsx` (modify) | Mount the profile rows |

---

### Task 1: Query hooks

**Files:**
- Create: `src/hooks/useSeriesFinale.ts`
- Create: `src/hooks/useSeriesFinale.test.tsx`

**Interfaces:**
- Consumes: `SeriesFinalePayload` from `src/lib/series-finale/types`
- Produces:
  - `function useSeriesFinaleList(): UseQueryResult<SeriesFinaleListItem[]>`
  - `function useSeriesFinale(period: string): UseQueryResult<SeriesFinalePayload>`
  - `function useDismissSeriesFinale(): UseMutationResult<void, Error, string>`
  - `interface SeriesFinaleListItem { label: string; generatedAt: string; dismissedAt: string | null; headline: SeriesFinalePayload["headline"] }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useSeriesFinale.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeriesFinale, useSeriesFinaleList } from "./useSeriesFinale";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

afterEach(() => vi.restoreAllMocks());

describe("useSeriesFinaleList", () => {
  it("returns the periods array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ periods: [{ label: "2026" }] }),
      }),
    );

    const { result } = renderHook(() => useSeriesFinaleList(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ label: "2026" }]);
  });
});

describe("useSeriesFinale", () => {
  it("requests the given period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payload: { schemaVersion: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026");
  });

  it("surfaces a failed response as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useSeriesFinale("2026"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useSeriesFinale.test.tsx`
Expected: FAIL — cannot resolve `./useSeriesFinale`.

- [ ] **Step 3: Implement**

Create `src/hooks/useSeriesFinale.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SeriesFinalePayload } from "@/lib/series-finale/types";

export interface SeriesFinaleListItem {
  label: string;
  generatedAt: string;
  dismissedAt: string | null;
  headline: SeriesFinalePayload["headline"];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function useSeriesFinaleList() {
  return useQuery({
    queryKey: ["series-finale", "list"],
    queryFn: async () => {
      const data = await getJson<{ periods: SeriesFinaleListItem[] }>(
        "/api/series-finale",
      );
      return data.periods;
    },
  });
}

export function useSeriesFinale(period: string) {
  return useQuery({
    queryKey: ["series-finale", period],
    queryFn: async () => {
      const data = await getJson<{ payload: SeriesFinalePayload }>(
        `/api/series-finale/${period}`,
      );
      return data.payload;
    },
    // A snapshot is frozen, so there is nothing to refetch for.
    staleTime: Infinity,
    // First generation runs the whole aggregation, which can take seconds.
    retry: false,
  });
}

export function useDismissSeriesFinale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: string) => {
      const response = await fetch(`/api/series-finale/${period}/dismiss`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Dismiss failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series-finale", "list"] });
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useSeriesFinale.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSeriesFinale.ts src/hooks/useSeriesFinale.test.tsx
git commit -m "feat: Series Finale query hooks"
```

---

### Task 2: Shared presentational primitives

**Files:**
- Create: `src/components/series-finale/StatTile.tsx`
- Create: `src/components/series-finale/BarChart.tsx`
- Create: `src/components/series-finale/ThinYearCard.tsx`
- Create: `src/components/series-finale/StatTile.test.tsx`
- Create: `src/components/series-finale/BarChart.test.tsx`
- Create: `src/components/series-finale/ThinYearCard.test.tsx`

**Interfaces:**
- Produces:
  - `function StatTile({ value, label }: { value: string; label: string })`
  - `function BarChart({ bars, ariaLabel }: { bars: { label: string; value: number; highlight?: boolean }[]; ariaLabel: string })`
  - `function ThinYearCard({ label, episodes, titles }: { label: string; episodes: number; titles: number })`

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/StatTile.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders the value and label", () => {
    render(<StatTile value="1,208" label="Episodes watched" />);

    expect(screen.getByText("1,208")).toBeInTheDocument();
    expect(screen.getByText("Episodes watched")).toBeInTheDocument();
  });
});
```

Create `src/components/series-finale/BarChart.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "./BarChart";

describe("BarChart", () => {
  const bars = [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 84 },
    { label: "Mar", value: 174, highlight: true },
  ];

  it("renders one bar per entry with its label", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month, peak March" />);

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Mar")).toBeInTheDocument();
  });

  it("carries a text alternative for the chart as a whole", () => {
    render(<BarChart bars={bars} ariaLabel="Episodes by month, peak March" />);

    expect(
      screen.getByLabelText("Episodes by month, peak March"),
    ).toBeInTheDocument();
  });

  it("renders without dividing by zero when every value is zero", () => {
    render(
      <BarChart
        bars={[{ label: "Jan", value: 0 }]}
        ariaLabel="Episodes by month"
      />,
    );

    expect(screen.getByText("Jan")).toBeInTheDocument();
  });
});
```

Create `src/components/series-finale/ThinYearCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThinYearCard } from "./ThinYearCard";

describe("ThinYearCard", () => {
  it("states what is missing rather than showing an empty story", () => {
    render(<ThinYearCard label="2026" episodes={9} titles={2} />);

    expect(screen.getByText(/9 episodes/)).toBeInTheDocument();
    expect(screen.getByText(/2 titles/)).toBeInTheDocument();
  });

  it("uses no exclamation marks, per the voice guide", () => {
    const { container } = render(
      <ThinYearCard label="2026" episodes={9} titles={2} />,
    );

    expect(container.textContent).not.toContain("!");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `StatTile`**

Create `src/components/series-finale/StatTile.tsx`:

```tsx
interface StatTileProps {
  value: string;
  label: string;
}

/** One big number over a quiet label. The recap's basic unit of stat. */
export function StatTile({ value, label }: StatTileProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-gray-400">{label}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `BarChart`**

Create `src/components/series-finale/BarChart.tsx`:

```tsx
interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

interface BarChartProps {
  bars: Bar[];
  /** Names the chart and its peak, so the shape is available without sight. */
  ariaLabel: string;
}

/**
 * Proportional bars for the monthly and weekday cuts.
 *
 * Heights are a percentage of the largest bar, not of a fixed scale, so a quiet
 * year still reads as a shape rather than a flat line.
 */
export function BarChart({ bars, ariaLabel }: BarChartProps) {
  const peak = Math.max(...bars.map((bar) => bar.value), 0);

  return (
    <div aria-label={ariaLabel} role="img" className="flex items-end gap-2">
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end">
            <div
              className={
                bar.highlight
                  ? "w-full rounded-t bg-red-500"
                  : "w-full rounded-t bg-gray-700"
              }
              // Zero peak would divide by zero and produce NaN, which React
              // renders as no height attribute at all.
              style={{ height: peak === 0 ? "0%" : `${(bar.value / peak) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement `ThinYearCard`**

Create `src/components/series-finale/ThinYearCard.tsx`:

```tsx
interface ThinYearCardProps {
  label: string;
  episodes: number;
  titles: number;
}

/**
 * Shown instead of the story when a period holds too little to characterise.
 *
 * The spec's rule is fewer than 10 episodes and fewer than 5 titles. Offering
 * a fourteen-card journey through nine episodes reads as mockery, so this says
 * plainly what is there and what would change it.
 */
export function ThinYearCard({ label, episodes, titles }: ThinYearCardProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
      <h2 className="text-xl font-semibold text-white">
        Not much of a {label}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">
        {episodes} episodes and {titles} titles is not enough to reconstruct a
        year from. Keep ticking things off and next year will have more to say.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/series-finale/
git commit -m "feat: Series Finale presentational primitives"
```

---

### Task 3: Desktop recap page

**Files:**
- Create: `src/app/(authenticated)/series-finale/[period]/page.tsx`
- Create: `src/components/series-finale/RecapClient.tsx`
- Create: `src/components/series-finale/RecapClient.test.tsx`

**Interfaces:**
- Consumes: `useSeriesFinale` (Task 1), `StatTile` / `BarChart` / `ThinYearCard` (Task 2)
- Produces: `function RecapClient({ period }: { period: string })`

**Layout follows mock artboard `1e`:** header with back arrow, title, "Play as
story" and "Share" actions; a gradient hero carrying the hours figure; a
four-tile stat row; a two-column band (monthly chart, archetype); a two-column
band (top show + niche, genres); a two-column band (big day, walked out on); a
two-column band (crew, comparison); TMDB attribution footer.

- [ ] **Step 1: Write the failing test**

Create `src/components/series-finale/RecapClient.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecapClient } from "./RecapClient";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: {
    hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47,
    titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4,
  },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: null, niche: null, genres: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 0 })),
  bigDay: null,
  rhythm: { archetype: null, weekdayCounts: [0, 0, 0, 0, 0, 0, 0], topWeekday: null, lateShare: null },
  shame: { dropped: [], stillPlanning: [] },
  crew: [], compare: [], thin: false,
  ...overrides,
});

const mockFetch = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
  );

afterEach(() => vi.restoreAllMocks());

describe("RecapClient", () => {
  it("renders the headline hours", async () => {
    mockFetch({ payload: payload() });
    render(<RecapClient period="2026" />, { wrapper });

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  });

  it("renders the thin-year card instead of stats for a thin period", async () => {
    mockFetch({
      payload: payload({
        thin: true,
        headline: { hours: 0, minutes: 0, episodes: 9, titlesCompleted: 2, titlesDropped: 0, unknownRuntimeEpisodes: 0, percentile: null },
      }),
    });
    render(<RecapClient period="2026" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Not much of a 2026/)).toBeInTheDocument(),
    );
  });

  it("omits the percentile line when there is no cohort", async () => {
    mockFetch({
      payload: payload({
        headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: null },
      }),
    });
    render(<RecapClient period="2026" />, { wrapper });

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
  });

  it("shows TMDB attribution", async () => {
    mockFetch({ payload: payload() });
    render(<RecapClient period="2026" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/RecapClient.test.tsx`
Expected: FAIL — cannot resolve `./RecapClient`.

- [ ] **Step 3: Implement `RecapClient`**

Create `src/components/series-finale/RecapClient.tsx`. This is the composition
shell; the per-section panels are added in Task 4.

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSeriesFinale } from "@/hooks/useSeriesFinale";

import { BarChart } from "./BarChart";
import { StatTile } from "./StatTile";
import { ThinYearCard } from "./ThinYearCard";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function RecapClient({ period }: { period: string }) {
  const { data: payload, isLoading, error } = useSeriesFinale(period);

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner />
        <span className="ml-3 text-sm text-gray-400">
          Putting your year together
        </span>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-sm text-gray-400">
          That recap could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  const peakMonth = payload.months.reduce((best, month) =>
    month.episodes > best.episodes ? month : best,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/profile" aria-label="Back to profile">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-white">
            Series Finale {payload.period.label}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series-finale/${period}/story`}>Play as story</Link>
          </Button>
        </div>
      </div>

      {payload.thin ? (
        <ThinYearCard
          label={payload.period.label}
          episodes={payload.headline.episodes}
          titles={payload.headline.titlesCompleted}
        />
      ) : (
        <>
          {/* Hero. The single gradient treatment on this view. */}
          <section className="mb-8 rounded-xl bg-gradient-to-r from-purple-600 via-red-500 to-orange-500 p-8">
            <div className="text-sm text-white/80">
              {payload.period.label}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-6xl font-bold text-white tabular-nums">
                {payload.headline.hours}
              </span>
              <span className="text-xl text-white/80">hours</span>
            </div>
            {payload.headline.percentile !== null && (
              <div className="mt-3 text-sm text-white/80">
                Top {payload.headline.percentile}% of everyone on WatchThis
              </div>
            )}
            {payload.headline.unknownRuntimeEpisodes > 0 && (
              <div className="mt-2 text-xs text-white/60">
                Excludes {payload.headline.unknownRuntimeEpisodes} episodes with
                no runtime on TMDB
              </div>
            )}
          </section>

          <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              value={payload.headline.episodes.toLocaleString()}
              label="Episodes watched"
            />
            <StatTile
              value={String(payload.headline.titlesCompleted)}
              label="Titles completed"
            />
            <StatTile
              value={
                payload.bigDay?.streak
                  ? String(payload.bigDay.streak.days)
                  : "—"
              }
              label="Day streak"
            />
            <StatTile
              value={String(payload.headline.titlesDropped)}
              label="Shows dropped"
            />
          </section>

          <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 text-sm font-semibold text-white">
              Watched by month
            </h2>
            <BarChart
              ariaLabel={`Episodes by month. Peak ${MONTH_LABELS[peakMonth.month - 1]}, ${peakMonth.episodes} episodes.`}
              bars={payload.months.map((month) => ({
                label: MONTH_LABELS[month.month - 1],
                value: month.episodes,
                highlight: month.month === peakMonth.month,
              }))}
            />
          </section>
        </>
      )}

      <footer className="mt-12 border-t border-gray-800 pt-6 text-xs text-gray-500">
        Title metadata from TMDB. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/(authenticated)/series-finale/[period]/page.tsx`:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { RecapClient } from "@/components/series-finale/RecapClient";

import { requireUser } from "../../requireUser";

interface PageProps {
  params: Promise<{ period: string }>;
}

export default async function SeriesFinalePage({ params }: PageProps) {
  const { period } = await params;
  await requireUser(`/series-finale/${period}`);

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader />
      <RecapClient period={period} />
    </div>
  );
}
```

Check the exact signature of `requireUser` in
`src/app/(authenticated)/requireUser.ts` and match it. In Next.js 16 `params`
is a promise and must be awaited.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/ "src/app/(authenticated)/series-finale/"
git commit -m "feat: Series Finale desktop recap page"
```

---

### Task 4: Recap panels — archetype, genres, top show, niche, big day, abandonment

**Files:**
- Modify: `src/components/series-finale/RecapClient.tsx`
- Modify: `src/components/series-finale/RecapClient.test.tsx`
- Create: `src/components/series-finale/ARCHETYPE_LABELS.ts`

**Interfaces:**
- Consumes: `ArchetypeId` from `src/lib/series-finale/types`
- Produces: `const ARCHETYPE_LABELS: Record<ArchetypeId, { name: string; blurb: string }>`

**Archetype display names** (rule 3's name is generated from the user's actual
top weekday, so its entry is a template):

```ts
export const WEEKDAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export const ARCHETYPE_LABELS: Record<ArchetypeId, { name: string; blurb: string }> = {
  "serial-abandoner": {
    name: "The Serial Abandoner",
    blurb: "You start a lot of things. You finish rather fewer of them.",
  },
  completionist: {
    name: "The Completionist",
    blurb: "Once you start something you see it through, whatever it costs.",
  },
  "weekday-marathoner": {
    // {weekday} is replaced with WEEKDAY_NAMES[topWeekday]
    name: "The {weekday} Marathoner",
    blurb: "One day a week does most of the work.",
  },
  "feast-or-famine": {
    name: "Feast or Famine",
    blurb: "Months of nothing, then a fortnight where you watch everything.",
  },
  "nightly-ritualist": {
    name: "The Nightly Ritualist",
    blurb: "Same window, most nights. It is a routine at this point.",
  },
  "one-genre-only": {
    name: "One Genre Only",
    blurb: "You know what you like, and you have stopped pretending otherwise.",
  },
  "deep-cut-hunter": {
    name: "The Deep Cut Hunter",
    blurb: "Most of what you finished, nobody else has heard of.",
  },
  "group-watcher": {
    name: "The Group Watcher",
    blurb: "Half your year happened on somebody else's list.",
  },
};
```

- [ ] **Step 1: Write the failing tests**

Append to `src/components/series-finale/RecapClient.test.tsx`:

```tsx
it("renders the archetype with the user's actual top weekday", async () => {
  mockFetch({
    payload: payload({
      rhythm: {
        archetype: "weekday-marathoner",
        weekdayCounts: [10, 10, 10, 10, 10, 10, 60],
        topWeekday: 6,
        lateShare: 0.41,
      },
    }),
  });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() =>
    expect(screen.getByText("The Sunday Marathoner")).toBeInTheDocument(),
  );
});

it("omits the archetype section when there is none", async () => {
  mockFetch({ payload: payload() });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  expect(screen.queryByText(/Marathoner/)).not.toBeInTheDocument();
});

it("lists dropped shows with the episode that tipped it", async () => {
  mockFetch({
    payload: payload({
      shame: {
        dropped: [{ tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" }],
        stillPlanning: [],
      },
    }),
  });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() =>
    expect(screen.getByText(/Foundation/)).toBeInTheDocument(),
  );
});

it("omits the niche panel when no films were completed", async () => {
  mockFetch({ payload: payload({ niche: null }) });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  expect(screen.queryByText(/Most obscure/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/RecapClient.test.tsx`
Expected: FAIL — archetype text not found.

- [ ] **Step 3: Create the labels module**

Create `src/components/series-finale/ARCHETYPE_LABELS.ts` with the exact
content given above, importing `ArchetypeId` from
`@/lib/series-finale/types`.

- [ ] **Step 4: Add the panels to `RecapClient`**

Insert these sections inside the non-thin branch of `RecapClient`, after the
monthly chart section:

```tsx
{payload.rhythm.archetype && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-2 text-sm font-semibold text-white">Your type</h2>
    <div className="text-2xl font-bold text-red-400">
      {ARCHETYPE_LABELS[payload.rhythm.archetype].name.replace(
        "{weekday}",
        WEEKDAY_NAMES[payload.rhythm.topWeekday ?? 0],
      )}
    </div>
    <p className="mt-2 text-sm text-gray-400">
      {ARCHETYPE_LABELS[payload.rhythm.archetype].blurb}
    </p>
    <div className="mt-4">
      <BarChart
        ariaLabel="Episodes by weekday"
        bars={payload.rhythm.weekdayCounts.map((value, index) => ({
          label: WEEKDAY_NAMES[index].slice(0, 1),
          value,
          highlight: index === payload.rhythm.topWeekday,
        }))}
      />
    </div>
  </section>
)}

{payload.genres.length > 0 && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-4 text-sm font-semibold text-white">Genres</h2>
    <div className="space-y-3">
      {payload.genres.map((genre) => (
        <div key={genre.name}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-300">{genre.name}</span>
            <span className="text-gray-500 tabular-nums">{genre.percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-700">
            <div
              className="h-2 rounded-full bg-purple-500"
              style={{ width: `${genre.percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  </section>
)}

{(payload.topShow || payload.niche) && (
  <section className="mb-8 grid gap-4 md:grid-cols-2">
    {payload.topShow && (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">Most watched</h2>
        <div className="text-lg font-bold text-white">{payload.topShow.title}</div>
        <div className="mt-1 text-sm text-gray-400">
          {payload.topShow.episodes} episodes
          {payload.topShow.minutes > 0 &&
            ` · ${Math.floor(payload.topShow.minutes / 60)}h ${payload.topShow.minutes % 60}m`}
        </div>
        {payload.topShow.alsoTopFor.length > 0 && (
          <div className="mt-3 text-sm text-gray-500">
            Also number one for {payload.topShow.alsoTopFor.join(", ")}.
          </div>
        )}
      </div>
    )}
    {payload.niche && (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">
          Most obscure film
        </h2>
        <div className="text-lg font-bold text-white">{payload.niche.title}</div>
        <div className="mt-1 text-sm text-gray-400">
          TMDB popularity {payload.niche.popularity.toFixed(1)}, against a median
          of {payload.niche.medianPopularity.toFixed(0)} for everything else you
          finished.
        </div>
      </div>
    )}
  </section>
)}

{payload.bigDay && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-2 text-sm font-semibold text-white">Biggest day</h2>
    <p className="text-sm text-gray-400">
      {payload.bigDay.date} · {payload.bigDay.episodes} episodes
    </p>
    {payload.bigDay.timeline === null && (
      <p className="mt-3 text-xs text-gray-500">
        No hour-by-hour breakdown for this one. Most of these were ticked off in
        batches, which says more about how you use the app than how you watch.
      </p>
    )}
    {payload.bigDay.timeline !== null && (
      <p className="mt-3 text-xs text-gray-500">
        From the {payload.bigDay.soloTickCount} episodes you ticked one at a
        time.
      </p>
    )}
  </section>
)}

{(payload.shame.dropped.length > 0 || payload.shame.stillPlanning.length > 0) && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-2 text-sm font-semibold text-white">Walked out on</h2>
    <div className="flex flex-wrap gap-2">
      {payload.shame.dropped.map((show) => (
        <Badge key={show.tmdbId} variant="dropped">
          {show.title}
          {show.lastEpisode ? ` · ${show.lastEpisode}` : ""}
        </Badge>
      ))}
    </div>
    {payload.shame.stillPlanning.length > 0 && (
      <>
        <p className="mt-4 text-sm text-gray-400">
          And even after giving up on those, you still did not find time for
          these.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {payload.shame.stillPlanning.slice(0, 5).map((film) => (
            <Badge key={film.tmdbId} variant="planning">
              {film.title} · {film.days} days
            </Badge>
          ))}
        </div>
      </>
    )}
  </section>
)}
```

Add the imports: `Badge` from `@/components/ui/Badge`, and `ARCHETYPE_LABELS`
and `WEEKDAY_NAMES` from `./ARCHETYPE_LABELS`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/RecapClient.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/
git commit -m "feat: Series Finale recap panels"
```

---

### Task 5: Crew and comparison panels

**Files:**
- Modify: `src/components/series-finale/RecapClient.tsx`
- Modify: `src/components/series-finale/RecapClient.test.tsx`

**Interfaces:**
- Consumes: `payload.crew`, `payload.compare`

**Privacy note:** these panels render only inside the authenticated recap. They
must never be lifted into the share-image renderer (plan 5), which strips these
keys from its input.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/series-finale/RecapClient.test.tsx`:

```tsx
it("ranks the crew by episodes", async () => {
  mockFetch({
    payload: payload({
      crew: [
        { userId: "u1", username: "ana", episodes: 1041, hours: 358 },
        { userId: "u2", username: "marcus", episodes: 760, hours: 241 },
      ],
    }),
  });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() => expect(screen.getByText("ana")).toBeInTheDocument());
  expect(screen.getByText("marcus")).toBeInTheDocument();
});

it("omits the crew panel when nobody is sharing", async () => {
  mockFetch({ payload: payload({ crew: [] }) });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  expect(screen.queryByText(/The crew/)).not.toBeInTheDocument();
});

it("renders the overlap split for a peer", async () => {
  mockFetch({
    payload: payload({
      compare: [
        {
          userId: "u1", username: "ana", onlyYou: 62, both: 34, onlyThem: 28,
          theyFinishedYouDropped: null, bothPlanningNeitherStarted: null,
        },
      ],
    }),
  });
  render(<RecapClient period="2026" />, { wrapper });

  await waitFor(() => expect(screen.getByText("34")).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/RecapClient.test.tsx`
Expected: FAIL — crew text not found.

- [ ] **Step 3: Add the panels**

Insert into `RecapClient`, after the abandonment section:

```tsx
{payload.crew.length > 0 && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-1 text-sm font-semibold text-white">The crew</h2>
    <p className="mb-4 text-sm text-gray-400">
      Everyone you share a list with. Nobody asked to be ranked.
    </p>
    <ol className="space-y-3">
      {payload.crew.map((member) => (
        <li key={member.userId} className="flex items-center gap-3">
          <ProfileImage src={null} username={member.username} size="sm" />
          <span className="flex-1 text-sm text-gray-300">{member.username}</span>
          <span className="text-sm text-gray-500 tabular-nums">
            {member.hours}h
          </span>
        </li>
      ))}
    </ol>
  </section>
)}

{payload.compare.length > 0 && (
  <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="mb-4 text-sm font-semibold text-white">
      You &amp; {payload.compare[0].username}
    </h2>
    <div className="grid grid-cols-3 gap-4 text-center">
      <div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {payload.compare[0].onlyYou}
        </div>
        <div className="text-xs text-gray-500">only you</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-red-400 tabular-nums">
          {payload.compare[0].both}
        </div>
        <div className="text-xs text-gray-500">both</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {payload.compare[0].onlyThem}
        </div>
        <div className="text-xs text-gray-500">
          only {payload.compare[0].username}
        </div>
      </div>
    </div>
  </section>
)}
```

Add the import for `ProfileImage` from `@/components/ui/ProfileImage`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/RecapClient.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/series-finale/
git commit -m "feat: Series Finale crew and comparison panels"
```

---

### Task 6: Story reel shell

**Files:**
- Create: `src/components/series-finale/StoryReel.tsx`
- Create: `src/components/series-finale/StoryReel.test.tsx`
- Create: `src/app/(authenticated)/series-finale/[period]/story/page.tsx`

**Interfaces:**
- Consumes: `useSeriesFinale` (Task 1), `SeriesFinalePayload`
- Produces:
  - `const REEL_ORDER: readonly StoryCardId[]`
  - `function StoryReel({ period }: { period: string })`

**Card order, matching the mock's `REEL_ORDER`:** `intro`, `hours`, `episodes`,
`finished`, `topShow`, `niche`, `genres`, `months`, `bigDay`, `rhythm`, `shame`,
`crew`, `compare`, `summary`.

**Behaviour:** tap the right two-thirds to advance, the left third to go back;
`ArrowRight` / `ArrowLeft` do the same; progress bars across the top show
position; a close button returns to the recap page. Cards whose payload slice is
null are **removed from the order**, not rendered empty.

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/StoryReel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StoryReel } from "./StoryReel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
  headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
  episodes: { total: 1208, perDay: 3.3 },
  finished: { films: 31, shows: 16, total: 47 },
  topShow: null, niche: null, genres: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
  bigDay: null,
  rhythm: { archetype: null, weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
  shame: { dropped: [], stillPlanning: [] },
  crew: [], compare: [], thin: false,
  ...overrides,
});

const mockFetch = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

afterEach(() => vi.restoreAllMocks());

describe("StoryReel", () => {
  it("opens on the intro card", async () => {
    mockFetch({ payload: payload() });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText("Series Finale")).toBeInTheDocument(),
    );
  });

  it("advances on ArrowRight", async () => {
    mockFetch({ payload: payload() });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
  });

  it("goes back on ArrowLeft", async () => {
    mockFetch({ payload: payload() });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    await userEvent.keyboard("{ArrowLeft}");

    await waitFor(() =>
      expect(screen.getByText("Series Finale")).toBeInTheDocument(),
    );
  });

  it("skips cards whose payload slice is null", async () => {
    mockFetch({ payload: payload({ topShow: null, niche: null }) });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() => expect(screen.getByText("Series Finale")).toBeInTheDocument());

    // intro -> hours -> episodes -> finished -> genres (topShow and niche skipped)
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeLessThan(14);
  });

  it("exposes a close control with an accessible name", async () => {
    mockFetch({ payload: payload() });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument(),
    );
  });

  it("renders the thin-year card instead of the reel for a thin period", async () => {
    mockFetch({ payload: payload({ thin: true }) });
    render(<StoryReel period="2026" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Not much of a 2026/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/StoryReel.test.tsx`
Expected: FAIL — cannot resolve `./StoryReel`.

- [ ] **Step 3: Implement**

Create `src/components/series-finale/StoryReel.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSeriesFinale } from "@/hooks/useSeriesFinale";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { StoryCard } from "./story-cards/StoryCard";
import { ThinYearCard } from "./ThinYearCard";

export type StoryCardId =
  | "intro" | "hours" | "episodes" | "finished" | "topShow" | "niche"
  | "genres" | "months" | "bigDay" | "rhythm" | "shame" | "crew"
  | "compare" | "summary";

/**
 * Narrative order. Adding a card is one entry here plus one branch in
 * StoryCard -- no reindexing, matching the mock's own REEL_ORDER note.
 */
export const REEL_ORDER: readonly StoryCardId[] = [
  "intro", "hours", "episodes", "finished", "topShow", "niche",
  "genres", "months", "bigDay", "rhythm", "shame", "crew",
  "compare", "summary",
];

/** Whether a card has anything to say for this payload. */
function hasContent(id: StoryCardId, payload: SeriesFinalePayload): boolean {
  switch (id) {
    case "topShow": return payload.topShow !== null;
    case "niche": return payload.niche !== null;
    case "genres": return payload.genres.length > 0;
    case "bigDay": return payload.bigDay !== null;
    case "rhythm": return payload.rhythm.archetype !== null;
    case "shame":
      return (
        payload.shame.dropped.length > 0 ||
        payload.shame.stillPlanning.length > 0
      );
    case "crew": return payload.crew.length > 0;
    case "compare": return payload.compare.length > 0;
    default: return true;
  }
}

export function StoryReel({ period }: { period: string }) {
  const router = useRouter();
  const { data: payload, isLoading, error } = useSeriesFinale(period);
  const [index, setIndex] = useState(0);

  const cards = useMemo(
    () => (payload ? REEL_ORDER.filter((id) => hasContent(id, payload)) : []),
    [payload],
  );

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = current + delta;
        if (next < 0) return 0;
        if (next > cards.length - 1) return cards.length - 1;
        return next;
      });
    },
    [cards.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8">
        <p className="text-sm text-gray-400">
          That recap could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (payload.thin) {
    return (
      <div className="min-h-screen bg-gray-950 p-4">
        <ThinYearCard
          label={payload.period.label}
          episodes={payload.headline.episodes}
          titles={payload.headline.titlesCompleted}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950">
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3">
        {cards.map((id, position) => (
          <div
            key={id}
            role="progressbar"
            aria-valuenow={position <= index ? 1 : 0}
            aria-valuemax={1}
            aria-label={`Card ${position + 1} of ${cards.length}`}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20"
          >
            <div
              className="h-full bg-white transition-all"
              style={{ width: position <= index ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Close story"
        onClick={() => router.push(`/series-finale/${period}`)}
        className="absolute right-3 top-8 z-20 rounded-full p-2 text-white/70 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Tap zones. Buttons rather than divs so they are reachable and named. */}
      <button
        type="button"
        aria-label="Previous card"
        onClick={() => go(-1)}
        className="absolute inset-y-0 left-0 z-10 w-1/3"
      />
      <button
        type="button"
        aria-label="Next card"
        onClick={() => go(1)}
        className="absolute inset-y-0 right-0 z-10 w-2/3"
      />

      <StoryCard id={cards[index]} payload={payload} />
    </div>
  );
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/(authenticated)/series-finale/[period]/story/page.tsx`:

```tsx
import { StoryReel } from "@/components/series-finale/StoryReel";

import { requireUser } from "../../../requireUser";

interface PageProps {
  params: Promise<{ period: string }>;
}

export default async function SeriesFinaleStoryPage({ params }: PageProps) {
  const { period } = await params;
  await requireUser(`/series-finale/${period}/story`);

  return <StoryReel period={period} />;
}
```

Verify the relative depth of the `requireUser` import against the actual file
location before committing.

- [ ] **Step 5: Run tests**

The tests will still fail until Task 7 provides `StoryCard`. Confirm the failure
is only "cannot resolve ./story-cards/StoryCard" and move on.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/StoryReel.tsx "src/app/(authenticated)/series-finale/"
git commit -m "feat: Series Finale story reel shell"
```

---

### Task 7: Story cards

**Files:**
- Create: `src/components/series-finale/story-cards/StoryCard.tsx`
- Create: `src/components/series-finale/story-cards/StoryCard.test.tsx`

**Interfaces:**
- Consumes: `StoryCardId` from Task 6, `SeriesFinalePayload`,
  `ARCHETYPE_LABELS` / `WEEKDAY_NAMES` from Task 4
- Produces: `function StoryCard({ id, payload }: { id: StoryCardId; payload: SeriesFinalePayload })`

**Copy comes from the mock (artboard `1c`).** Reproduce it exactly — it is
already in the house voice and was reviewed. No exclamation marks.

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/story-cards/StoryCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StoryCard } from "./StoryCard";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";

const payload = (overrides: Partial<SeriesFinalePayload> = {}) =>
  ({
    schemaVersion: 1,
    period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
    headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
    episodes: { total: 1208, perDay: 3.3 },
    finished: { films: 31, shows: 16, total: 47 },
    topShow: null, niche: null, genres: [],
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
    bigDay: null,
    rhythm: { archetype: null, weekdayCounts: [1, 1, 1, 1, 1, 1, 1], topWeekday: 0, lateShare: null },
    shame: { dropped: [], stillPlanning: [] },
    crew: [], compare: [], thin: false,
    ...overrides,
  }) as SeriesFinalePayload;

describe("StoryCard", () => {
  it("renders the intro", () => {
    render(<StoryCard id="intro" payload={payload()} />);
    expect(screen.getByText("Series Finale")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("renders the hours card with the percentile", () => {
    render(<StoryCard id="hours" payload={payload()} />);
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText(/Top 4%/)).toBeInTheDocument();
  });

  it("omits the percentile line when null", () => {
    render(
      <StoryCard
        id="hours"
        payload={payload({
          headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: null },
        })}
      />,
    );
    expect(screen.queryByText(/Top/)).not.toBeInTheDocument();
  });

  it("splits finished titles into films and shows", () => {
    render(<StoryCard id="finished" payload={payload()} />);
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("films")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("renders the summary card", () => {
    render(<StoryCard id="summary" payload={payload()} />);
    expect(screen.getByText(/412/)).toBeInTheDocument();
  });

  it("uses no exclamation marks anywhere", () => {
    for (const id of ["intro", "hours", "episodes", "finished", "summary"] as const) {
      const { container, unmount } = render(
        <StoryCard id={id} payload={payload()} />,
      );
      expect(container.textContent).not.toContain("!");
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/story-cards/`
Expected: FAIL — cannot resolve `./StoryCard`.

- [ ] **Step 3: Implement**

Create `src/components/series-finale/story-cards/StoryCard.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/Badge";
import { ProfileImage } from "@/components/ui/ProfileImage";
import type { SeriesFinalePayload } from "@/lib/series-finale/types";

import { ARCHETYPE_LABELS, WEEKDAY_NAMES } from "../ARCHETYPE_LABELS";
import { BarChart } from "../BarChart";
import type { StoryCardId } from "../StoryReel";

const MONTH_INITIALS = ["J","F","M","A","M","J","J","A","S","O","N","D"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-center px-8 py-20">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-400">
      {children}
    </div>
  );
}

export function StoryCard({
  id,
  payload,
}: {
  id: StoryCardId;
  payload: SeriesFinalePayload;
}) {
  switch (id) {
    case "intro":
      return (
        <Shell>
          <div className="text-4xl font-bold text-white">Series Finale</div>
          <div className="mt-1 text-5xl font-bold text-red-400">
            {payload.period.label}
          </div>
          <p className="mt-6 text-gray-400">
            A year of yours, reconstructed from every episode you ticked off.
          </p>
          <p className="mt-8 text-sm text-gray-600">Tap to begin</p>
        </Shell>
      );

    case "hours":
      return (
        <Shell>
          <Eyebrow>You spent</Eyebrow>
          <div className="flex items-baseline gap-2">
            <span className="text-7xl font-bold text-white tabular-nums">
              {payload.headline.hours}
            </span>
            <span className="text-2xl text-gray-400">hrs</span>
          </div>
          <p className="mt-6 text-gray-400">
            in front of something. That is{" "}
            {Math.round(payload.headline.hours / 24)} straight days.
          </p>
          {payload.headline.percentile !== null && (
            <p className="mt-6 text-sm text-red-400">
              Top {payload.headline.percentile}% of everyone on WatchThis
            </p>
          )}
        </Shell>
      );

    case "episodes":
      return (
        <Shell>
          <Eyebrow>Episodes ticked off</Eyebrow>
          <div className="text-7xl font-bold text-white tabular-nums">
            {payload.episodes.total.toLocaleString()}
          </div>
          <p className="mt-6 text-gray-400">
            Every one of them ticked by hand. {payload.episodes.perDay.toFixed(1)}{" "}
            a day, every day.
          </p>
        </Shell>
      );

    case "finished":
      return (
        <Shell>
          <Eyebrow>You finished</Eyebrow>
          <div className="text-7xl font-bold text-white tabular-nums">
            {payload.finished.total}
          </div>
          <p className="mt-6 text-gray-400">
            things, all the way to the end.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-900 p-4">
              <div className="text-2xl font-bold text-white">
                {payload.finished.films}
              </div>
              <div className="text-xs text-gray-500">films</div>
            </div>
            <div className="rounded-lg bg-gray-900 p-4">
              <div className="text-2xl font-bold text-white">
                {payload.finished.shows}
              </div>
              <div className="text-xs text-gray-500">shows</div>
            </div>
          </div>
        </Shell>
      );

    case "topShow":
      if (!payload.topShow) return null;
      return (
        <Shell>
          <Eyebrow>Your number one show</Eyebrow>
          <div className="text-3xl font-bold text-white">
            {payload.topShow.title}
          </div>
          <p className="mt-3 text-gray-400">
            {payload.topShow.episodes} episodes
            {payload.topShow.minutes > 0 &&
              ` · ${Math.floor(payload.topShow.minutes / 60)}h ${payload.topShow.minutes % 60}m`}
          </p>
          {payload.topShow.alsoTopFor.length > 0 && (
            <p className="mt-6 text-sm text-gray-500">
              Also number one for {payload.topShow.alsoTopFor.join(" and ")}. You
              need new material.
            </p>
          )}
        </Shell>
      );

    case "niche":
      if (!payload.niche) return null;
      return (
        <Shell>
          <Eyebrow>Your most obscure film</Eyebrow>
          <div className="text-3xl font-bold text-white">
            {payload.niche.title}
          </div>
          <p className="mt-4 text-gray-400">
            TMDB popularity {payload.niche.popularity.toFixed(1)}, against a
            median of {payload.niche.medianPopularity.toFixed(0)} for everything
            else you finished.
          </p>
          {payload.niche.mostPopular && (
            <p className="mt-6 text-sm text-gray-600">
              Most famous: {payload.niche.mostPopular.title}
            </p>
          )}
        </Shell>
      );

    case "genres":
      return (
        <Shell>
          <Eyebrow>Your genres</Eyebrow>
          <div className="mt-4 space-y-3">
            {payload.genres.map((genre) => (
              <div key={genre.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-gray-300">{genre.name}</span>
                  <span className="text-gray-500 tabular-nums">
                    {genre.percent}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-purple-500"
                    style={{ width: `${genre.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-600">Genre data from TMDB</p>
        </Shell>
      );

    case "months": {
      const peak = payload.months.reduce((best, month) =>
        month.episodes > best.episodes ? month : best,
      );
      return (
        <Shell>
          <Eyebrow>Your year had a shape</Eyebrow>
          <div className="mt-6">
            <BarChart
              ariaLabel={`Episodes by month. Peak month ${peak.month}, ${peak.episodes} episodes.`}
              bars={payload.months.map((month) => ({
                label: MONTH_INITIALS[month.month - 1],
                value: month.episodes,
                highlight: month.month === peak.month,
              }))}
            />
          </div>
          <p className="mt-6 text-sm text-gray-400">
            {peak.episodes} episodes in your busiest month.
          </p>
        </Shell>
      );
    }

    case "bigDay":
      if (!payload.bigDay) return null;
      return (
        <Shell>
          <Eyebrow>Your worst / best day</Eyebrow>
          <div className="text-3xl font-bold text-white">
            {payload.bigDay.date}
          </div>
          <p className="mt-4 text-gray-400">
            {payload.bigDay.episodes} episodes in one day.
          </p>
          {payload.bigDay.timeline !== null ? (
            <p className="mt-6 text-xs text-gray-600">
              From the {payload.bigDay.soloTickCount} episodes you ticked one at
              a time.
            </p>
          ) : (
            <p className="mt-6 text-xs text-gray-600">
              No hour-by-hour breakdown. Most of these were ticked in batches.
            </p>
          )}
          {payload.bigDay.streak && (
            <p className="mt-4 text-sm text-gray-500">
              Longest streak: {payload.bigDay.streak.days} days,{" "}
              {payload.bigDay.streak.start} to {payload.bigDay.streak.end}
            </p>
          )}
        </Shell>
      );

    case "rhythm": {
      if (!payload.rhythm.archetype) return null;
      const label = ARCHETYPE_LABELS[payload.rhythm.archetype];
      return (
        <Shell>
          <Eyebrow>Your watching type</Eyebrow>
          <div className="text-4xl font-bold text-white">
            {label.name.replace(
              "{weekday}",
              WEEKDAY_NAMES[payload.rhythm.topWeekday ?? 0],
            )}
          </div>
          <p className="mt-4 text-gray-400">{label.blurb}</p>
          <div className="mt-8">
            <BarChart
              ariaLabel="Episodes by weekday"
              bars={payload.rhythm.weekdayCounts.map((value, index) => ({
                label: WEEKDAY_NAMES[index].slice(0, 1),
                value,
                highlight: index === payload.rhythm.topWeekday,
              }))}
            />
          </div>
        </Shell>
      );
    }

    case "shame":
      return (
        <Shell>
          <Eyebrow>Hall of shame</Eyebrow>
          <div className="text-2xl font-bold text-white">
            {payload.shame.dropped.length} shows you walked out on
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {payload.shame.dropped.map((show) => (
              <Badge key={show.tmdbId} variant="dropped">
                {show.title}
                {show.lastEpisode ? ` · ${show.lastEpisode}` : ""}
              </Badge>
            ))}
          </div>
          {payload.shame.stillPlanning.length > 0 && (
            <div className="mt-8">
              <div className="text-sm text-gray-500">Still planning</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {payload.shame.stillPlanning.slice(0, 3).map((film) => (
                  <Badge key={film.tmdbId} variant="planning">
                    {film.title} · {film.days} days
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Shell>
      );

    case "crew":
      return (
        <Shell>
          <Eyebrow>Your crew</Eyebrow>
          <ol className="mt-6 space-y-4">
            {payload.crew.map((member, position) => (
              <li key={member.userId} className="flex items-center gap-3">
                <span className="w-4 text-sm text-gray-600 tabular-nums">
                  {position + 1}
                </span>
                <ProfileImage src={null} username={member.username} size="sm" />
                <span className="flex-1 text-gray-300">{member.username}</span>
                <span className="text-gray-500 tabular-nums">
                  {member.episodes.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </Shell>
      );

    case "compare": {
      const peer = payload.compare[0];
      if (!peer) return null;
      return (
        <Shell>
          <Eyebrow>You &amp; {peer.username}</Eyebrow>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-3xl font-bold text-white tabular-nums">
                {peer.onlyYou}
              </div>
              <div className="text-xs text-gray-500">only you</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-400 tabular-nums">
                {peer.both}
              </div>
              <div className="text-xs text-gray-500">both</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white tabular-nums">
                {peer.onlyThem}
              </div>
              <div className="text-xs text-gray-500">only {peer.username}</div>
            </div>
          </div>
        </Shell>
      );
    }

    case "summary":
      return (
        <Shell>
          <div className="rounded-xl bg-gradient-to-br from-purple-600 via-red-500 to-orange-500 p-6">
            <div className="text-sm text-white/80">
              {payload.period.label}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {payload.headline.hours}
                </div>
                <div className="text-xs text-white/70">hours</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {payload.headline.episodes.toLocaleString()}
                </div>
                <div className="text-xs text-white/70">episodes</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {payload.headline.titlesCompleted}
                </div>
                <div className="text-xs text-white/70">titles finished</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {payload.headline.titlesDropped}
                </div>
                <div className="text-xs text-white/70">abandoned</div>
              </div>
            </div>
          </div>
        </Shell>
      );

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/`
Expected: PASS — both `StoryCard` and the `StoryReel` tests from Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/components/series-finale/story-cards/
git commit -m "feat: Series Finale story cards"
```

---

### Task 8: Dashboard banner

**Files:**
- Create: `src/components/series-finale/SeriesFinaleBanner.tsx`
- Create: `src/components/series-finale/SeriesFinaleBanner.test.tsx`
- Modify: `src/app/(authenticated)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useSeriesFinaleList`, `useDismissSeriesFinale` (Task 1)
- Produces: `function SeriesFinaleBanner()`

**Behaviour (mock artboards `1a` and `1h`):** shows the newest generated,
non-dismissed period. "See your Series Finale" links to the story; "Not now"
dismisses. Renders nothing when there is no eligible period.

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/SeriesFinaleBanner.test.tsx`:

```tsx
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

afterEach(() => vi.restoreAllMocks());

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/SeriesFinaleBanner.test.tsx`
Expected: FAIL — cannot resolve `./SeriesFinaleBanner`.

- [ ] **Step 3: Implement**

Create `src/components/series-finale/SeriesFinaleBanner.tsx`:

```tsx
"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  useDismissSeriesFinale,
  useSeriesFinaleList,
} from "@/hooks/useSeriesFinale";

/**
 * Dashboard promotion for the newest recap.
 *
 * Renders nothing rather than an empty shell when there is no eligible period --
 * for most of the year that is the correct state, not an error.
 */
export function SeriesFinaleBanner() {
  const { data: periods } = useSeriesFinaleList();
  const dismiss = useDismissSeriesFinale();

  const newest = periods?.find((period) => period.dismissedAt === null);
  if (!newest) return null;

  return (
    <div className="mb-8 overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-red-500 to-orange-500 p-px">
      <div className="rounded-xl bg-gray-950 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
          <Sparkles className="h-4 w-4" />
          Your {newest.label} Series Finale is ready
        </div>
        <p className="mt-3 text-lg text-white">
          {newest.headline.episodes.toLocaleString()} episodes.{" "}
          {newest.headline.titlesCompleted} titles.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          A card at a time on your year.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Button variant="entertainment" size="lg" asChild>
            <Link href={`/series-finale/${newest.label}/story`}>
              See your Series Finale
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss.mutate(newest.label)}
            disabled={dismiss.isPending}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount it on the dashboard**

In `src/app/(authenticated)/dashboard/page.tsx`, add the import and render
`<SeriesFinaleBanner />` as the first element inside `<main>`, above the
Activity Feed section.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/ "src/app/(authenticated)/dashboard/"
git commit -m "feat: Series Finale dashboard banner"
```

---

### Task 9: Profile rows and the crew opt-out control

**Files:**
- Create: `src/components/series-finale/ProfileFinaleRows.tsx`
- Create: `src/components/series-finale/ProfileFinaleRows.test.tsx`
- Modify: `src/app/(authenticated)/profile/page.tsx`

**Interfaces:**
- Consumes: `useSeriesFinaleList` (Task 1)
- Produces: `function ProfileFinaleRows()`

**Behaviour (mock artboard `1b`):** one row per generated period under "Your
data", newest first, each linking to the recap page. Plus a `Switch` bound to
`shareStatsWithCollaborators`, posting to `PUT /api/auth/session`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/ProfileFinaleRows.test.tsx`:

```tsx
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

afterEach(() => vi.restoreAllMocks());

const listResponse = (periods: unknown[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ periods }) }),
  );

describe("ProfileFinaleRows", () => {
  it("lists every generated period newest first", async () => {
    listResponse([
      { label: "2026", generatedAt: "2027-01-01T00:00:00.000Z", dismissedAt: null, headline: { episodes: 1208, titlesCompleted: 47 } },
      { label: "2025", generatedAt: "2026-01-01T00:00:00.000Z", dismissedAt: null, headline: { episodes: 844, titlesCompleted: 31 } },
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/ProfileFinaleRows.test.tsx`
Expected: FAIL — cannot resolve `./ProfileFinaleRows`.

- [ ] **Step 3: Implement**

Create `src/components/series-finale/ProfileFinaleRows.tsx`:

```tsx
"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { useSeriesFinaleList } from "@/hooks/useSeriesFinale";

export function ProfileFinaleRows() {
  const { data: periods, isLoading } = useSeriesFinaleList();

  if (isLoading) return null;

  if (!periods || periods.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No Series Finale yet. One is put together for each calendar year once it
        has finished.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {periods.map((period) => (
        <li
          key={period.label}
          className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4"
        >
          <BarChart3 className="h-5 w-5 text-gray-400" />
          <div className="flex-1">
            <div className="text-sm font-medium text-white">
              Series Finale {period.label}
            </div>
            <div className="text-xs text-gray-500">
              {period.headline.episodes.toLocaleString()} episodes ·{" "}
              {period.headline.titlesCompleted} titles
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series-finale/${period.label}`}>Open</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Mount it and add the opt-out switch**

In `src/app/(authenticated)/profile/page.tsx`, add a "Series Finale" section
under the existing "Your data" area rendering `<ProfileFinaleRows />`, plus a
`Switch` bound to the user's `shareStatsWithCollaborators` value that issues
`PUT /api/auth/session` with the new value. Label it:

> **Include me in crew comparisons** — People you share a list with can see your
> episode and hour totals in their Series Finale. Turning this off removes you
> from theirs.

Follow the existing patterns in that page for how settings are read and saved.

- [ ] **Step 5: Run tests and verify**

Run: `npx vitest run src/components/series-finale/ && npm run typecheck && npm run lint:ci`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/ "src/app/(authenticated)/profile/"
git commit -m "feat: Series Finale profile rows and crew opt-out"
```

---

## Verification

```bash
npm run lint:ci && npm run typecheck && npm test
```

Then check by hand, with the dev server running (`npm run dev`):

1. The recap page renders at `/series-finale/2025` for a user with 2025 data.
2. The story advances with both taps and arrow keys, and closes back to the recap.
3. The banner appears on the dashboard, and "Not now" makes it stay gone across a reload.
4. Every profile row opens its year.
5. Turning the crew switch off and regenerating a recap removes that user from other people's crew lists.
