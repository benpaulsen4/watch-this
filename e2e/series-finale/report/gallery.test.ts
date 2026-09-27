import { describe, expect, it } from "vitest";

import type { Oracle } from "../seed/oracle";
import type { Evidence } from "../support/evidence";
import {
  type Artifacts,
  cardLookup,
  findingStatuses,
  mutationVerdict,
  parseInvocation,
  relatedChecks,
  renderHtml,
  renderMarkdown,
  type Shot,
} from "./gallery";

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
    ev("F5-compare-disc-label-clipped", "phone", false, {
      informational: true,
      actual: { screenshot: "artifacts/screenshots/phone/story/ava-2025/13-a-shared-list.png" },
    }),
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
    expect(idsOf(relatedChecks(shot("phone", "story/ava-2025/13-a-shared-list"), evidence, cardAt), evidence)).toEqual([
      "phone:F5-compare-disc-label-clipped",
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
        ev("crew-cap-rule", "desktop", false, { informational: true }),
      ]),
    );
    const byId = new Map(statuses.map((s) => [s.def.id, s]));
    expect(byId.get("F1")).toMatchObject({ showing: [0], covered: [0, 1] });
    expect(byId.get("F2")).toMatchObject({ showing: [], covered: [2] });
    expect(byId.get("F3")?.showing).toEqual([3]);
    expect(byId.get("F3")?.extra).toContain("e2e_ivy (40 episodes in 2025)");
    expect(byId.get("F6")?.covered).toEqual([]);
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
    expect(md).toContain("The run exits non-zero: 1 test(s) and 1 check(s) fail, from app finding(s) F1. Every failing check is an app finding");
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
