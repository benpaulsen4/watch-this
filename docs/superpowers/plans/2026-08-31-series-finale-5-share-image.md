# Series Finale 5 — Share Image

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a 1080×1350 shareable card from a frozen snapshot, carrying only the viewer's own statistics, and wire a Share control that hands it to the native share sheet or a download.

**Architecture:** A Node-runtime route renders the card with `ImageResponse` from `next/og`. Before rendering, the payload passes through a pure sanitiser that **removes** every cross-user field — crew, comparison, and the "also number one for" list — so no other person's data can reach an image that leaves the app. The QR points at the marketing splash page, never at personal data. There is no public route.

**Tech Stack:** Next.js 16 `next/og` (Satori), `qrcode`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-series-finale-design.md`

**Mock:** artboard `1g` — 1080×1350, shown at half size.

**Dependencies:** Requires plan 3 complete (the snapshot must exist). Task 4 requires plan 4 Task 3 (`RecapClient`).

## Global Constraints

- **The route must run on the Node runtime.** `export const runtime = "edge"` — as used in `src/app/opengraph-image.tsx` — **will not work here**: this route reads the database, and `postgres-js` opens raw TCP sockets that the edge runtime does not provide. Do not copy that line.
- `ImageResponse` renders through Satori, which supports **a subset of CSS**: flexbox only (no grid, no float), every element with more than one child needs an explicit `display: "flex"`, and there is no `gap` on non-flex containers. Tailwind classes do **not** apply — use inline `style` objects, as `opengraph-image.tsx` does.
- Colours come from the brand palette as literal hex, since there is no Tailwind here: page `#030712`, card `#111827`, border `#1F2937`, text `#F9FAFB` / `#9CA3AF`, accent red `#EF4444`, purple `#A855F7`, orange `#F97316`.
- **No cross-user data in the image.** This is the hard privacy line from the spec.
- Voice: plain, slightly wry, **no exclamation marks**.
- Tests: Vitest. Lint zero-warnings: `npm run lint:ci`. Typecheck: `npm run typecheck`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/series-finale/share.ts` (create) | Pure payload sanitiser + QR data URL |
| `src/lib/series-finale/share.test.ts` (create) | Tests |
| `src/app/api/series-finale/[period]/card/route.tsx` (create) | The 1080×1350 PNG |
| `src/components/series-finale/ShareButton.tsx` (create) | Share control |
| `src/components/series-finale/RecapClient.tsx` (modify) | Mount the Share button |

---

### Task 1: Payload sanitiser

**Files:**
- Create: `src/lib/series-finale/share.ts`
- Create: `src/lib/series-finale/share.test.ts`

**Interfaces:**
- Consumes: `SeriesFinalePayload` from plan 2 Task 1
- Produces:
  - `type ShareablePayload = Omit<SeriesFinalePayload, "crew" | "compare">`
  - `function stripCrossUserData(payload: SeriesFinalePayload): ShareablePayload`

**Why a separate, tested function:** the privacy guarantee is that no other
person's data reaches an image that leaves the app. Enforcing that by
remembering not to render those fields is a guarantee that lasts until someone
adds a field. Enforcing it by deleting them from the object, with a test that
fails if a cross-user field survives, is a guarantee.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/series-finale/share.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { stripCrossUserData } from "./share";
import type { SeriesFinalePayload } from "./types";

const payload = (): SeriesFinalePayload =>
  ({
    schemaVersion: 1,
    period: { start: "2026-01-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", label: "2026" },
    headline: { hours: 412, minutes: 24720, episodes: 1208, titlesCompleted: 47, titlesDropped: 6, unknownRuntimeEpisodes: 0, percentile: 4 },
    episodes: { total: 1208, perDay: 3.3 },
    finished: { films: 31, shows: 16, total: 47 },
    topShow: {
      tmdbId: 1, title: "The Bear", posterPath: null, episodes: 38,
      minutes: 1002, finishedAt: "2026-04-04", alsoTopFor: ["marcus"],
    },
    niche: {
      tmdbId: 2, title: "Ich war zuhause, aber", posterPath: null,
      popularity: 2.1, medianPopularity: 68, mostPopular: null, filmPopularities: [],
    },
    genres: [{ name: "Drama", percent: 22 }],
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 10 })),
    bigDay: null,
    rhythm: { archetype: "weekday-marathoner", weekdayCounts: [1, 1, 1, 1, 1, 1, 6], topWeekday: 6, lateShare: 0.41 },
    shame: { dropped: [], stillPlanning: [] },
    crew: [{ userId: "u1", username: "ana", episodes: 1041, hours: 358 }],
    compare: [{ userId: "u1", username: "ana", onlyYou: 62, both: 34, onlyThem: 28, theyFinishedYouDropped: null, bothPlanningNeitherStarted: null }],
    thin: false,
  }) as SeriesFinalePayload;

describe("stripCrossUserData", () => {
  it("removes the crew list entirely, rather than emptying it", () => {
    const result = stripCrossUserData(payload());

    expect("crew" in result).toBe(false);
  });

  it("removes the comparison list entirely", () => {
    const result = stripCrossUserData(payload());

    expect("compare" in result).toBe(false);
  });

  it("clears alsoTopFor, which names other people", () => {
    const result = stripCrossUserData(payload());

    expect(result.topShow?.alsoTopFor).toEqual([]);
  });

  it("keeps the viewer's own statistics", () => {
    const result = stripCrossUserData(payload());

    expect(result.headline.hours).toBe(412);
    expect(result.topShow?.title).toBe("The Bear");
    expect(result.niche?.title).toBe("Ich war zuhause, aber");
    expect(result.rhythm.archetype).toBe("weekday-marathoner");
  });

  it("contains no other username anywhere in its serialised form", () => {
    const serialised = JSON.stringify(stripCrossUserData(payload()));

    expect(serialised).not.toContain("ana");
    expect(serialised).not.toContain("marcus");
  });

  it("handles a null topShow", () => {
    const source = { ...payload(), topShow: null };

    expect(stripCrossUserData(source).topShow).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/share.test.ts`
Expected: FAIL — cannot resolve `./share`.

- [ ] **Step 3: Implement**

Create `src/lib/series-finale/share.ts`:

```ts
import type { SeriesFinalePayload } from "./types";

/** A payload safe to render into an image that leaves the app. */
export type ShareablePayload = Omit<SeriesFinalePayload, "crew" | "compare">;

/**
 * Remove every field describing somebody other than the viewer.
 *
 * The fields are deleted from the object rather than left in place and ignored
 * by the renderer. A renderer that merely declines to draw them is a promise
 * that holds until the next person adds a field; an object that does not carry
 * them cannot leak them however it is rendered.
 *
 * The spec's rule: crew and comparison data exist only inside the authenticated
 * app, never in anything shareable.
 */
export function stripCrossUserData(
  payload: SeriesFinalePayload,
): ShareablePayload {
  // Destructured out deliberately -- naming them here is what removes them.
  const { crew: _crew, compare: _compare, ...rest } = payload;

  return {
    ...rest,
    topShow: rest.topShow
      ? { ...rest.topShow, alsoTopFor: [] }
      : null,
  };
}
```

If the lint rule for unused variables rejects the `_crew` / `_compare` bindings,
check `eslint.config.mjs` for the configured `argsIgnorePattern` /
`varsIgnorePattern` and match its convention rather than disabling the rule.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/share.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/share.ts src/lib/series-finale/share.test.ts
git commit -m "feat: strip cross-user data from shareable payloads"
```

---

### Task 2: QR data URL

**Files:**
- Modify: `src/lib/series-finale/share.ts`
- Modify: `src/lib/series-finale/share.test.ts`

**Interfaces:**
- Consumes: `qrcode` (already a dependency — see `src/components/ui/QRCode.tsx`)
- Produces: `async function shareQrDataUrl(siteUrl: string): Promise<string | null>`

**Destination:** the marketing splash page, from `SITE_URL`. Never a personal
URL — the spec has no public route, and a QR is the one part of the card a
stranger will actually scan.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/series-finale/share.test.ts`:

```ts
import { shareQrDataUrl } from "./share";

describe("shareQrDataUrl", () => {
  it("encodes the site URL as a PNG data URL", async () => {
    const url = await shareQrDataUrl("https://watchthis.example");

    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null rather than throwing for an empty site URL", async () => {
    expect(await shareQrDataUrl("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/series-finale/share.test.ts`
Expected: FAIL — `shareQrDataUrl is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/series-finale/share.ts`:

```ts
import QRCodeLib from "qrcode";

/**
 * QR for the share card, pointing at the marketing splash page.
 *
 * Deliberately not a personal link. There is no public recap route, and this is
 * the one element of the card a stranger is likely to scan.
 *
 * Returns null rather than throwing: a missing QR should cost the corner of a
 * card, not the whole image.
 */
export async function shareQrDataUrl(siteUrl: string): Promise<string | null> {
  if (!siteUrl) return null;

  try {
    return await QRCodeLib.toDataURL(siteUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 180,
      color: { dark: "#101828", light: "#F3F4F6" },
    });
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series-finale/share.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series-finale/share.ts src/lib/series-finale/share.test.ts
git commit -m "feat: QR data URL for the Series Finale share card"
```

---

### Task 3: The share-image route

**Files:**
- Create: `src/app/api/series-finale/[period]/card/route.tsx`

**Interfaces:**
- Consumes: `getOrGenerateSnapshot` (plan 3), `parsePeriodLabel` (plan 3),
  `stripCrossUserData` / `shareQrDataUrl` (Tasks 1–2), `withAuth`
- Produces: `GET /api/series-finale/[period]/card` returning `image/png`

**Note the `.tsx` extension** — this route returns JSX.

- [ ] **Step 1: Write the route**

Create `src/app/api/series-finale/[period]/card/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { parsePeriodLabel } from "@/lib/series-finale/periods";
import { getOrGenerateSnapshot } from "@/lib/series-finale/service";
import { shareQrDataUrl, stripCrossUserData } from "@/lib/series-finale/share";

// NOT edge. This route reads the database, and postgres-js opens raw TCP
// sockets the edge runtime does not provide -- unlike src/app/opengraph-image.tsx,
// which reads nothing and can afford `runtime = "edge"`.
export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;

// Literal hex rather than Tailwind classes: Satori does not run Tailwind.
const PAGE = "#030712";
const TEXT = "#F9FAFB";
const MUTED = "#9CA3AF";
const CARD = "#111827";
const BORDER = "#1F2937";

// GET /api/series-finale/[period]/card - 1080x1350 share image
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const period = parsePeriodLabel(segments.at(-2) ?? "");

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const full = await getOrGenerateSnapshot(request.user.id, period);

    // The privacy boundary. Everything below renders from `payload`, which by
    // construction carries nobody else's data.
    const payload = stripCrossUserData(full);
    const qr = await shareQrDataUrl(process.env.SITE_URL ?? "");

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 80,
            backgroundColor: PAGE,
            backgroundImage:
              "radial-gradient(900px circle at 15% 10%, rgba(168,85,247,0.30), transparent 55%), radial-gradient(800px circle at 90% 80%, rgba(249,115,22,0.22), transparent 60%), radial-gradient(700px circle at 50% 45%, rgba(239,68,68,0.20), transparent 65%)",
            color: TEXT,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              <span>WatchThis</span>
              <span style={{ color: MUTED }}>{payload.period.label}</span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 90,
              }}
            >
              <div style={{ fontSize: 32, color: MUTED }}>
                {request.user.username} watched
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 200, fontWeight: 700, lineHeight: 1 }}>
                  {payload.headline.hours}
                </span>
                <span style={{ fontSize: 48, color: MUTED, marginLeft: 18 }}>
                  hours
                </span>
              </div>
            </div>

            <div style={{ display: "flex", marginTop: 70 }}>
              {[
                { value: payload.headline.episodes.toLocaleString(), label: "episodes" },
                { value: String(payload.headline.titlesCompleted), label: "finished" },
                { value: String(payload.headline.titlesDropped), label: "abandoned" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    padding: "28px 24px",
                    marginRight: 16,
                    borderRadius: 16,
                    backgroundColor: CARD,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <span style={{ fontSize: 52, fontWeight: 700 }}>
                    {stat.value}
                  </span>
                  <span style={{ fontSize: 24, color: MUTED, marginTop: 6 }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {payload.topShow && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 50,
                }}
              >
                <span style={{ fontSize: 24, color: MUTED }}>Top show</span>
                <span style={{ fontSize: 44, fontWeight: 700, marginTop: 4 }}>
                  {payload.topShow.title}
                </span>
              </div>
            )}

            {payload.niche && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 30,
                }}
              >
                <span style={{ fontSize: 24, color: MUTED }}>
                  Most obscure film
                </span>
                <span style={{ fontSize: 44, fontWeight: 700, marginTop: 4 }}>
                  {payload.niche.title}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, color: MUTED }}>
                Title metadata from TMDB
              </span>
            </div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} width={140} height={140} alt="" />
            )}
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  } catch (error) {
    return handleApiError(error, "Series Finale card");
  }
});
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint:ci`
Expected: PASS. If the `<img>` lint rule fires under a different name than the
disable comment above, match whatever `eslint.config.mjs` actually configures.

- [ ] **Step 3: Verify it renders**

Start the dev server (`npm run dev`), sign in, and open
`http://localhost:3000/api/series-finale/2025/card` for a user with 2025 data.

Expected: a 1080×1350 PNG. Common Satori failures and their causes:
- *"Expected <div> to have explicit display"* — a container with more than one
  child is missing `display: "flex"`.
- Blank regions — `gap` was used on a non-flex container, or a `grid` layout
  slipped in. Satori supports neither.
- A connection error — `export const runtime = "edge"` was left in.

- [ ] **Step 4: Verify the privacy boundary by inspection**

Confirm that the only payload identifier referenced anywhere in the JSX is
`payload`, never `full`. `full` exists solely to be sanitised.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/series-finale/"
git commit -m "feat: Series Finale share image route"
```

---

### Task 4: Share control

**Files:**
- Create: `src/components/series-finale/ShareButton.tsx`
- Create: `src/components/series-finale/ShareButton.test.tsx`
- Modify: `src/components/series-finale/RecapClient.tsx`

**Interfaces:**
- Produces: `function ShareButton({ period }: { period: string })`

**Behaviour:** fetch the card, then hand it to `navigator.share` when the
browser supports sharing files, otherwise fall back to a download. Both paths
must work — `navigator.share` is absent on most desktop browsers.

- [ ] **Step 1: Write the failing tests**

Create `src/components/series-finale/ShareButton.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "./ShareButton";

afterEach(() => vi.restoreAllMocks());

const mockCardFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    }),
  );

describe("ShareButton", () => {
  it("fetches the card for the given period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });

    render(<ShareButton period="2026" />);
    await userEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/card"),
    );
  });

  it("uses the native share sheet when it can share files", async () => {
    mockCardFetch();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: vi.fn(() => true),
    });

    render(<ShareButton period="2026" />);
    await userEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("reports a failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<ShareButton period="2026" />);
    await userEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(screen.getByText(/could not be made/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/series-finale/ShareButton.test.tsx`
Expected: FAIL — cannot resolve `./ShareButton`.

- [ ] **Step 3: Implement**

Create `src/components/series-finale/ShareButton.tsx`:

```tsx
"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Fetches the rendered card and hands it to the platform.
 *
 * `navigator.share` with files is absent on most desktop browsers, so the
 * download path is a real path rather than a fallback nobody hits.
 */
export function ShareButton({ period }: { period: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const share = async () => {
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/series-finale/${period}/card`);
      if (!response.ok) throw new Error(`Card failed: ${response.status}`);

      const blob = await response.blob();
      const file = new File([blob], `series-finale-${period}.png`, {
        type: "image/png",
      });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file] });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // A cancelled native share also lands here. Showing the fallback message
      // is harmless and avoids distinguishing cancellation from failure.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <Button variant="gradient" size="sm" onClick={share} disabled={busy}>
        <Share2 className="mr-2 h-4 w-4" />
        Share
      </Button>
      {failed && (
        <span className="mt-1 text-xs text-gray-500">
          That card could not be made. Try again in a moment.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount it in the recap header**

In `src/components/series-finale/RecapClient.tsx`, add
`<ShareButton period={period} />` next to the "Play as story" button in the
header actions.

**Gradient budget:** `ShareButton` uses `variant="gradient"` and the hero uses
the `entertainment` gradient. That is two gradient treatments on one view, which
the design system forbids. Resolve it by changing the hero to a flat
`bg-gray-900` panel with a red accent rule, keeping the gradient on the single
strongest action — the Share button. Update the `RecapClient` test that asserts
on the hero if it depends on the gradient classes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/series-finale/ && npm run typecheck && npm run lint:ci`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/series-finale/
git commit -m "feat: Series Finale share control"
```

---

## Verification

```bash
npm run lint:ci && npm run typecheck && npm test
```

Then by hand, with the dev server running:

1. `GET /api/series-finale/<year>/card` returns a 1080×1350 PNG while signed in.
2. The same URL returns 401 when signed out.
3. The Share button produces a file on desktop (download) and offers the share
   sheet on a mobile browser.
4. Open the returned PNG and confirm no other username appears anywhere on it.
5. Confirm exactly one gradient treatment is visible on the recap page.
