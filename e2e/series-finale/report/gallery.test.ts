import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Oracle } from "../seed/oracle";
import type { Evidence } from "../support/evidence";
import { RECAP_SECTIONS } from "../support/recap";
import { findingState, findingStatuses, mutationVerdict } from "./findings";
import { renderHtml } from "./html";
import { type Artifacts, cardLookup, parseInvocation, readEvidence, readJson, relatedChecks, type Shot } from "./load";
import { renderMarkdown } from "./markdown";

const ev = (id: string, project: string, pass = true, extra: Partial<Evidence> = {}): Evidence => ({
  id,
  project,
  description: `${id} description`,
  expected: 1,
  actual: pass ? 1 : 2,
  pass,
  ...extra,
});

const shot = (project: string, name: string): Shot => ({
  project,
  name,
  src: name.startsWith("cards/") ? `${name}.png` : `screenshots/${project}/${name}.png`,
});

const idsOf = (indexes: number[], evidence: Evidence[]) => indexes.map((i) => `${evidence[i]!.project}:${evidence[i]!.id}`);

describe("relatedChecks", () => {
  const evidence = [
    ev("visual-ava-2025-no-horizontal-scroll", "phone", false),
    ev("visual-ava-2025-sections", "phone"),
    ev("recap-hero-hours", "phone"),
    ev("recap-hero-hours", "desktop"),
    ev("recap-crew-rows", "phone"),
    ev("story-walk-headings", "phone", true, { informational: true, actual: [{ nn: "12", card: "crew", heading: "x" }] }),
    ev("story-crew-rows", "phone"),
    ev("story-walk-12-progress", "phone"),
    ev("card-ava-2025-status", "desktop"),
    ev("some-note", "phone", false, {
      informational: true,
      actual: { screenshot: "artifacts/screenshots/phone/story/ava-2025/13-a-shared-list.png" },
    }),
    ev("F5-compare-labels-whole-story-e2e_bo", "phone"),
    ev("F5-compare-labels-whole-recap-e2e_bo", "phone"),
    ev("gate-phone-recap-to-story", "phone"),
    ev("gate-cy-precondition", "phone"),
    ev("gate-desktop-recap-shown", "desktop"),
    ev("completion-posted", "desktop-mutating"),
    ev("completion-recap-route-shows-recap", "desktop-mutating"),
  ];
  const cardAt = cardLookup(evidence);

  it("links a full recap shot to that persona-year's visual checks, in its own project only", () => {
    expect(idsOf(relatedChecks(shot("phone", "recap/ava-2025/full"), evidence, cardAt), evidence)).toEqual([
      "phone:visual-ava-2025-no-horizontal-scroll",
      "phone:visual-ava-2025-sections",
    ]);
  });

  it("links a recap section shot to 40-recap's checks for that section", () => {
    expect(idsOf(relatedChecks(shot("phone", "recap/ava-2025/hero"), evidence, cardAt), evidence)).toEqual([
      "phone:visual-ava-2025-sections",
      "phone:recap-hero-hours",
    ]);
  });

  it("maps a story position to its card through 50-story's walk note", () => {
    expect(idsOf(relatedChecks(shot("phone", "story/ava-2025/12-you-out-watched"), evidence, cardAt), evidence)).toEqual([
      "phone:story-crew-rows",
      "phone:story-walk-12-progress",
    ]);
  });

  it("links a share card to checks from any project", () => {
    expect(idsOf(relatedChecks(shot("", "cards/ava-2025"), evidence, cardAt), evidence)).toEqual(["desktop:card-ava-2025-status"]);
  });

  it("links a shot to any evidence line that names it", () => {
    expect(idsOf(relatedChecks(shot("phone", "story/ava-2025/13-a-shared-list"), evidence, cardAt), evidence)).toEqual(["phone:some-note"]);
  });

  it("links each F5 compare shot to its own surface's and peer's check", () => {
    expect(idsOf(relatedChecks(shot("phone", "story/ava-2025-compare/e2e_bo"), evidence, cardAt), evidence)).toEqual([
      "phone:F5-compare-labels-whole-story-e2e_bo",
    ]);
    expect(idsOf(relatedChecks(shot("phone", "recap/ava-2025-compare/e2e_bo"), evidence, cardAt), evidence)).toEqual([
      "phone:F5-compare-labels-whole-recap-e2e_bo",
    ]);
  });

  it("links the story gate's and the completion flow's shots to their checks", () => {
    expect(idsOf(relatedChecks(shot("phone", "story/cy-2025-gate/handed-on"), evidence, cardAt), evidence)).toEqual([
      "phone:gate-phone-recap-to-story",
      "phone:gate-cy-precondition",
    ]);
    expect(idsOf(relatedChecks(shot("desktop", "recap/cy-2025-gate-desktop"), evidence, cardAt), evidence)).toEqual(["desktop:gate-desktop-recap-shown"]);
    expect(idsOf(relatedChecks(shot("desktop-mutating", "story/cy-2025-completion/summary"), evidence, cardAt), evidence)).toEqual([
      "desktop-mutating:completion-posted",
    ]);
    expect(idsOf(relatedChecks(shot("desktop-mutating", "recap/cy-2025-after-completion"), evidence, cardAt), evidence)).toEqual([
      "desktop-mutating:completion-recap-route-shows-recap",
    ]);
  });
});

describe("parseInvocation", () => {
  it("flattens nested suites, keeps skip reasons and strips colour codes from errors", () => {
    const inv = parseInvocation("readonly", {
      suites: [
        {
          title: "41-recap-visual.e2e.ts",
          file: "41-recap-visual.e2e.ts",
          suites: [
            {
              title: "ava-2025",
              specs: [
                {
                  title: "renders",
                  file: "41-recap-visual.e2e.ts",
                  tests: [
                    { projectName: "phone", status: "unexpected", results: [{ duration: 1200, errors: [{ message: "\u001b[31mExpected\u001b[39m 390" }] }] },
                    { projectName: "webkit-phone", status: "skipped", annotations: [{ type: "skip", description: "no WebKit" }], results: [{ duration: 0 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
      stats: { startTime: "2026-09-27T00:00:00.000Z", duration: 5000 },
    });
    expect(inv.found).toBe(true);
    expect(inv.tests).toEqual([
      expect.objectContaining({ title: "ava-2025 › renders", project: "phone", status: "unexpected", errors: ["Expected 390"] }),
      expect.objectContaining({ project: "webkit-phone", status: "skipped", skipReason: "no WebKit" }),
    ]);
  });

  it("marks a missing results file as not found", () => {
    expect(parseInvocation("mutating", null)).toMatchObject({ found: false, tests: [] });
  });
});

const ORACLE = {
  e2e_jon: { "2025": { crewCappedOut: ["e2e_ivy"], crew: [], episodes: 0 } },
  e2e_ivy: { "2025": { crewCappedOut: [], crew: [], episodes: 40 } },
  e2e_ava: { "2025": { crewCappedOut: ["e2e_jon"], crew: [], episodes: 230 } },
} as unknown as Oracle;

function artifacts(evidence: Evidence[], extra: Partial<Artifacts> = {}): Artifacts {
  return {
    evidence,
    invocations: [
      parseInvocation("readonly", {
        suites: [
          {
            title: "41-recap-visual.e2e.ts",
            specs: [
              {
                title: "ava",
                file: "41-recap-visual.e2e.ts",
                tests: [
                  { projectName: "phone", status: "unexpected", results: [{ duration: 10 }] },
                  { projectName: "webkit-phone", status: "skipped", annotations: [{ type: "skip", description: "WebKit does not launch here" }], results: [{ duration: 0 }] },
                ],
              },
            ],
          },
        ],
      }),
      parseInvocation("mutating", null),
    ],
    oracle: ORACLE,
    shots: [shot("phone", "recap/ava-2025/full"), shot("desktop", "recap/ava-2025/full"), shot("", "cards/ava-2025")],
    mutation: null,
    env: {
      gitSha: "abc123",
      gitDirty: false,
      playwright: "1.62.1",
      chromium: "151",
      webkit: "26.5",
      dbImage: "postgres:17",
      node: "v26",
      generatedAt: "2026-09-27T00:00:00.000Z",
    },
    ...extra,
  };
}

describe("findingStatuses", () => {
  it("shows a finding only while one of its checks fails, and adds jon's crew detail to F3", () => {
    const statuses = findingStatuses(
      artifacts([
        ev("visual-ava-2025-no-horizontal-scroll", "phone", false),
        ev("visual-ava-2025-no-horizontal-scroll", "desktop", true),
        ev("visual-ava-2025-header-title-fits", "phone", true),
        ev("crew-cap-rule", "desktop", false),
      ]),
    );
    const byId = new Map(statuses.map((s) => [s.def.id, s]));
    expect(byId.get("F1")).toMatchObject({ showing: [0], covered: [0, 1] });
    expect(byId.get("F2")).toMatchObject({ showing: [], covered: [2] });
    expect(byId.get("F3")?.showing).toEqual([3]);
    expect(byId.get("F3")?.extra).toContain("e2e_ivy (40 episodes in 2025)");
    expect(byId.get("F6")?.covered).toEqual([]);
  });

  it("reads FIXED while every one of a finding's checks passes, REPRODUCED once one fails", () => {
    const f5 = (pass: boolean) =>
      findingStatuses({
        oracle: null,
        evidence: [ev("F5-compare-labels-whole-story-e2e_bo", "phone"), ev("F5-compare-labels-whole-recap-e2e_bo", "small-phone", pass)],
      }).find((s) => s.def.id === "F5")!;
    expect(f5(true)).toMatchObject({ covered: [0, 1], showing: [] });
    expect(findingState(f5(true))).toBe("FIXED: all 2 check(s) pass");
    expect(findingState(f5(false))).toBe("REPRODUCED: 1 failing check(s)");
  });

  it("derives F3 from its check, and says when a finding has no evidence", () => {
    const f3 = (pass: boolean) => findingStatuses({ oracle: null, evidence: [ev("crew-cap-rule", "desktop", pass)] }).find((s) => s.def.id === "F3")!;
    expect(findingState(f3(false))).toBe("REPRODUCED: 1 failing check(s)");
    expect(findingState(f3(true))).toBe("FIXED: all 1 check(s) pass");
    expect(findingState(findingStatuses({ oracle: null, evidence: [] })[0]!)).toBe("no evidence this run");
  });
});

describe("every recap screenshot links to a check", () => {
  // The shots 41-recap-visual takes for ava's 2025 (every section, the full
  // page) and the lines it and 40-recap always write for that recap. A shot
  // or check renamed without report/load.ts RULES would drop its chips.
  const evidence = [
    ev("visual-ava-2025-rendered", "desktop"),
    ev("visual-ava-2025-sections", "desktop"),
    ev("visual-ava-2025-late-share", "desktop"),
    ev("recap-ava-rendered", "desktop"),
    ev("recap-hero-hours", "desktop"),
    ev("recap-tile-episodes", "desktop"),
    ev("recap-months-bars", "desktop"),
    ev("recap-rhythm-late-share", "desktop"),
    ev("recap-top-show-title", "desktop"),
    ev("recap-niche-title", "desktop"),
    ev("recap-big-day", "desktop"),
    ev("recap-shame-count", "desktop"),
    ev("recap-crew-rows", "desktop"),
    ev("recap-compare-e2e_bo-split", "desktop"),
    ev("recap-footer-tmdb-logo", "desktop"),
  ];
  const cardAt = cardLookup(evidence);

  it.each(["full", ...RECAP_SECTIONS])("desktop/recap/ava-2025/%s", (section) => {
    expect(relatedChecks(shot("desktop", `recap/ava-2025/${section}`), evidence, cardAt).length).toBeGreaterThan(0);
  });

  it.each(RECAP_SECTIONS.filter((section) => section !== "genres"))("desktop/recap/ava-2025/%s links a 40-recap check", (section) => {
    const linked = relatedChecks(shot("desktop", `recap/ava-2025/${section}`), evidence, cardAt).map((i) => evidence[i]!.id);
    expect(linked.some((id) => id.startsWith("recap-"))).toBe(true);
  });
});

describe("mutationVerdict", () => {
  const run = (evidence: Evidence[]) => ({ meta: {}, evidence, invocation: parseInvocation("mutation-i1", null), shots: [] });

  it("is caught when an I1-sensitive check fails", () => {
    expect(mutationVerdict(run([ev("switch-bat-no-crew", "desktop-mutating", false)])).caught).toBe(true);
  });

  it("is not caught when only other checks fail", () => {
    expect(mutationVerdict(run([ev("switch-bat-download", "desktop-mutating", false), ev("switch-bat-no-crew", "desktop-mutating")]))).toMatchObject({
      ran: true,
      caught: false,
    });
  });

  it("has not run without evidence", () => {
    expect(mutationVerdict(null).ran).toBe(false);
  });
});

describe("renderHtml", () => {
  const html = renderHtml(artifacts([ev("visual-ava-2025-no-horizontal-scroll", "phone", false)]));

  it("is a self-contained page: no scripts, relative image paths", () => {
    expect(html).not.toMatch(/<script/i);
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(src).toMatch(/^(screenshots|cards|mutation-i1)\//);
  });

  it("puts the findings first and the galleries after the failed checks", () => {
    const at = (id: string) => html.indexOf(`<section id="${id}">`);
    expect(at("findings")).toBeGreaterThan(-1);
    expect(at("findings")).toBeLessThan(at("summary"));
    expect(at("failed")).toBeLessThan(at("cards"));
    expect(at("cards")).toBeLessThan(at("recap"));
  });

  it("says why a project has no screenshot", () => {
    expect(html).toContain("not run: WebKit does not launch here");
  });
});

describe("renderMarkdown", () => {
  it("states the outcome and has per-project counts and the mutation section", () => {
    const md = renderMarkdown(artifacts([ev("visual-ava-2025-no-horizontal-scroll", "phone", false)]));
    expect(md).toContain(
      "The run exits non-zero: 1 test(s) and 1 check(s) fail, from app finding(s) F1. Every failing check belongs to a known app finding, which plan 6 fixed",
    );
    expect(md).toContain("| phone | 0 | 1 | 0 | 0 | 1 | 0 | 0 |");
    expect(md).toContain("## Mutation check (I1)");
    expect(md).toContain("Not run: `artifacts/mutation-i1/` holds no evidence.");
  });

  it("names a failing check no finding explains", () => {
    const md = renderMarkdown(artifacts([ev("something-else", "desktop", false)]));
    expect(md).toContain("1 failing check(s) belong to no known finding");
    expect(md).toContain("### Unclassified failing checks");
  });
});

describe("reading artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-gallery-"));

  it("names a truncated results file and says what to do", () => {
    const path = join(dir, "results-readonly.json");
    writeFileSync(path, '{"suites": [');
    expect(() => readJson(path)).toThrow(`${path} is not valid JSON`);
    expect(() => readJson(path)).toThrow("re-run the specs, or delete the file");
  });

  it("names the evidence line that does not parse", () => {
    const path = join(dir, "evidence.jsonl");
    writeFileSync(path, '{"id":"a"}\n\n{"id":\n');
    expect(() => readEvidence(path)).toThrow(`${path}:3 is not valid JSON`);
  });

  it("reads a missing file as absent", () => {
    expect(readJson(join(dir, "missing.json"))).toBeNull();
    expect(readEvidence(join(dir, "missing.jsonl"))).toEqual([]);
  });
});
