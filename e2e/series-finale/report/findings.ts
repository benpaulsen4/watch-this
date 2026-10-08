// What the run found: the app findings and their status (computed from this
// run's evidence), the controller's informational notes, and the counts.
import type { Oracle } from "../seed/oracle";
import type { Evidence } from "../support/evidence";
import { groupBy } from "./format";
import type { Artifacts, Invocation, MutationRun, TestResult } from "./load";
import { PROJECTS } from "./load";

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface FindingDef {
  id: string;
  title: string;
  /** Where the problem was, when the finding was made. */
  where: string;
  /** What was wrong, as found (the run's evidence says whether it still is). */
  diagnosis: string;
  /** How plan 6 fixed it, and what the checks now hold the app to. */
  fix: string;
  /** Checks that fail while the finding holds, or an informational note. */
  kind: "check" | "note";
  matches: (e: Evidence) => boolean;
}

export const FINDINGS: FindingDef[] = [
  {
    id: "F1",
    title: "Phone recap scrolls sideways",
    where: "src/components/series-finale/RecapClient.tsx:236-258 (Band)",
    diagnosis:
      "The wide band holding \"Watched by month\" and \"Your type\" has no column rule below lg, so its one implicit column grows to its widest item's min-content width: the page is 473 px wide in a 390 px viewport.",
    fix: "Plan 6 Task 4: every Band is grid-cols-1 below lg (minmax columns from lg), and the months chart names each month by its initial below sm. Checked: every recap page is exactly as wide as the viewport.",
    kind: "check",
    matches: (e) => /^visual-.+-no-horizontal-scroll$/.test(e.id),
  },
  {
    id: "F2",
    title: "Phone recap header title wraps and clips",
    where: "src/components/ui/PageHeader.tsx:24-26 (fixed h-16 bar)",
    diagnosis:
      "Beside \"Play as story\" and Share, \"Series Finale 2025\" wraps to three lines inside the fixed-height header; the title column has no min-w-0/truncate, so the text spills above and below the bar.",
    fix: "Plan 6 Tasks 4-5: the title column is min-w-0 and the h1 truncates (with its full title on hover); below sm the header's actions fold to their icons. Checked: the title lies inside the bar and is whole, not truncated.",
    kind: "check",
    matches: (e) => /^visual-.+-header-title-fits$/.test(e.id),
  },
  {
    id: "F3",
    title: "Crew capped by user id, before activity is loaded",
    where: "src/lib/series-finale/service.ts:238-275 (loadCollaboratorIds, before plan 6)",
    diagnosis:
      "Consenting collaborators were sorted by user id and the first 8 kept before any activity was loaded, so who was left out depended on ids, not on how much they watched.",
    fix: "Plan 6 Task 1: every consenting collaborator is ranked by episodes in the period, then username, then id, and the 8 most active are kept (service.ts:301-314 mostActiveCollaborators). Checked: the crew the app stored for e2e_jon -- nine consenting collaborators, dee's id pinned to sort last -- is his 8 most active (crew-cap-rule).",
    kind: "check",
    matches: (e) => e.id === "crew-cap-rule",
  },
  {
    id: "F4",
    title: "Story summary card overflows on a long username",
    where: "src/components/series-finale/story-cards/SummaryCard.tsx:58-60",
    diagnosis:
      "The \"<username>'s year\" line has no break rule; underscores give no break opportunity, so flo's 725 px name runs out of the card (desktop) and scrolls the whole page sideways (phones). The share image wraps the same name.",
    fix: "Plan 6 Task 4: the line (and the recap hero's name line, and a panel's title) wraps anywhere. Checked: every story card of flo's fits its column and the viewport.",
    kind: "check",
    matches: (e) => /^story-visual-.+-(fits-column|no-horizontal-scroll)$/.test(e.id),
  },
  {
    id: "F5",
    title: "Compare disc label clipped on phones (story and recap)",
    where: "src/components/series-finale/CompareSplit.tsx:113-123 (the peer label's truncate, before plan 6)",
    diagnosis:
      "The peer's disc label was exactly as wide as its box and overflow-hidden, so at DPR 2 the last glyph's ink was cut: \"only e2e_bo\" read \"only e2e_bc\" on the story card's large disc and on the recap panel's default one. It was a person's reading of the phone screenshots; the DOM widths fitted.",
    fix: "Plan 6 Tasks 4-5: the Venn sets each label beneath the picture in its own third, wrapping anywhere, with nothing above it clipping. Checked on every project, for every peer swapped in, in both disc sizes (the story's large card, the recap's default panel): every label's content fits its box, with a screenshot of each.",
    kind: "check",
    matches: (e) => /^F5-compare-labels-whole-(story|recap)-/.test(e.id),
  },
  {
    id: "F6",
    title: "Phone Share failure line overflows the header",
    where: "src/components/ui/PageHeader.tsx:24-26 + src/components/series-finale/ShareButton.tsx:130-136",
    diagnosis:
      "The Share wrapper is a flex column holding the button and the failure line; in the fixed h-16 bar it grows to 84 px and is centred past both edges: the button's top is off-screen and the line spills below the header.",
    fix: "Plan 6 Task 4: the recap shows the failure as a notice below the header, outside the bar, and the button no longer moves. Checked: with the failure shown, the Share button lies inside the bar and the line below it, visible.",
    kind: "check",
    matches: (e) => /^share-failure-layout(-boxes)?$/.test(e.id),
  },
];

export interface FindingStatus {
  def: FindingDef;
  /** Evidence indexes that show the finding: failing checks, or unmet notes. */
  showing: number[];
  /** Every evidence index the finding covers, shown or not. */
  covered: number[];
  extra: string | null;
}

/** A finding's status in words, for the gallery and the report. */
export function findingState(s: FindingStatus): string {
  if (s.covered.length === 0) return "no evidence this run";
  if (s.showing.length > 0) return s.def.kind === "check" ? `REPRODUCED: ${s.showing.length} failing check(s)` : "REPRODUCED (note not met)";
  return s.def.kind === "check" ? `FIXED: all ${s.covered.length} check(s) pass` : `FIXED (note met, ${s.covered.length} line(s))`;
}

/** F3's run-specific detail: who the activity rule leaves out of e2e_jon's and ava's 2025 crews. */
function jonCrewDetail(oracle: Oracle | null): string | null {
  const jon = oracle?.e2e_jon?.["2025"];
  if (!jon || !oracle) return null;
  const left = (username: string) => `${username} (${oracle[username]?.["2025"]?.episodes ?? "?"} episodes in 2025)`;
  return (
    `By the activity rule, e2e_jon's 2025 crew leaves out ${jon.crewCappedOut.map(left).join(", ") || "nobody"}; ava's leaves out ` +
    `${oracle.e2e_ava?.["2025"]?.crewCappedOut.map(left).join(", ") || "nobody"}. The seeder pins dee's id to sort last among jon's ` +
    "collaborators, so the old id rule would leave her out every run; crew-cap-rule compares the crew the app stored for jon with his 8 most active."
  );
}

export function findingStatuses(a: Pick<Artifacts, "evidence" | "oracle">): FindingStatus[] {
  return FINDINGS.map((def) => {
    const covered = a.evidence.flatMap((e, i) => (def.matches(e) ? [i] : []));
    return {
      def,
      covered,
      showing: covered.filter((i) => !a.evidence[i]!.pass),
      extra: def.id === "F3" ? jonCrewDetail(a.oracle) : null,
    };
  });
}

/** Informational observations the controller listed alongside the findings (task 9 addendum). */
export interface NoteDef {
  title: string;
  ids: string[];
  text: string;
}

export const NOTES: NoteDef[] = [
  {
    title: "10 of 14 story cards have no h2",
    ids: ["story-cards-without-h2"],
    text: "StoryShell renders a Headline only where the mock has one, so heading navigation reaches months, shame, crew and compare only. The group label and live region still announce every card.",
  },
  {
    title: "A failed crew-switch save hides the consent text",
    ids: ["profile-crew-failed-consent-text"],
    text: "Switch renders its error or its helper text, never both, so after \"Could not save that. Reverted.\" the consent disclosure is gone until the next toggle.",
  },
  {
    title: "Generation timing is not representative",
    ids: ["gen-time"],
    text: "The seeder pre-warms every TMDB cache, so first generation here never waits on TMDB.",
  },
  {
    title: "WebKit could not launch on this host",
    ids: [],
    text: "Missing system libraries (Task 1); installing them needs `sudo pnpm exec playwright install-deps`, a system change outside this suite. webkit-phone skips with that reason, so there are no Safari-engine screenshots.",
  },
  {
    title: "P19 logout flash not reproduced",
    ids: ["P19-logout-flash-security", "P19-logout-flash-streaming"],
    text: "No error line was seen between clicking Logout and /auth on either tab; the transition screenshots are kept for the visual review.",
  },
];

/**
 * What the suite does not check automatically (the final review's M8), so the
 * report's coverage story is honest. Each is visual or left to unit tests.
 */
export const NOT_AUTOMATED: { title: string; text: string }[] = [
  {
    title: "The percentile line's absence above 50",
    text: "No signing-in persona ranks below the top half, so the recap is never seen without its percentile line. pop12's stored percentile (> 50) is checked (api-pop12-percentile); hiding the line is left to the unit tests (format.ts percentileLine). ava's own value (Top 14%) is a note: it depends on the cohort at generation time.",
  },
  {
    title: "A gap year",
    text: "No persona has an empty year between two active ones; thin, none and not-over periods are covered.",
  },
  {
    title: "The share card's content",
    text: "Satori draws the card's text as paths, so its numbers (hours, episodes, titles, dropped, top show, niche), flo's long name wrapping and the QR code's target are checked by eye in the saved cards only. Its size, statuses, cache headers and privacy (byte identity across other people's changes, privacy-ava-card-unchanged) are automated.",
  },
  {
    title: "Archetype pictures no persona has",
    text: "The cast's 2025s are a weekday marathoner (ava), one-genre-only (bo, bat) and a completionist (flo), and those pictures are checked against the oracle on the recap and the story. The nightly ritualist's clock, the deep cut hunter's popularity strip, feast or famine's months, the group watcher's shared-list bar and the serial abandoner's finished-against-dropped bar are left to the unit tests (ArchetypeVisual.test.tsx, format.test.ts); the oracle computes their numbers (hourCounts, busiestWindow, sharedListShare, months), and the payload's are checked against it for ava (api-payload-v4-fields).",
  },
  {
    title: "The biggest day's edge cases",
    text: "ava's big day (Brisbane, no daylight saving) has no two ticks close enough to stack, 14 points (no \"And N more.\"), and an axis within one day; stacking, the 16-row cap, half-hour zones and the few-points list are left to the unit tests (BigDayTimeline.test.tsx, format.test.ts).",
  },
  {
    title: "Completion on desktop, and a failed completion",
    text: "Every persona whose story a read-only spec walks is marked gone through by the seeder, so the summary card posts nothing there; the marking itself is exercised on a phone (85-story-completion). That a desktop marks completion too, and the summary card's \"Could not save your progress. Try again.\" after a failed POST, are left to the unit tests (StoryReel.test.tsx, SummaryCard.test.tsx).",
  },
  {
    title: "WebKit",
    text: "webkit-phone cannot launch on this host (missing system libraries), so there is no Safari-engine run or screenshot.",
  },
  {
    title: "The P19 logout flash",
    text: "Recorded as a note with transition screenshots; it did not reproduce, and a flash too short to sample would not show.",
  },
];

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export interface ProjectCounts {
  project: string;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  checksPass: number;
  checksFail: number;
  notesMet: number;
  notesNotMet: number;
}

export function countTests(tests: TestResult[]) {
  return {
    passed: tests.filter((t) => t.status === "expected").length,
    failed: tests.filter((t) => t.status === "unexpected").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
    flaky: tests.filter((t) => t.status === "flaky").length,
  };
}

export function projectCounts(invocations: Invocation[], evidence: Evidence[]): ProjectCounts[] {
  const tests = invocations.flatMap((i) => i.tests);
  const known = new Set<string>([...tests.map((t) => t.project), ...evidence.map((e) => e.project)]);
  const order = [...PROJECTS, ...[...known].filter((p) => !(PROJECTS as readonly string[]).includes(p)).sort()];
  return order
    .filter((p) => known.has(p))
    .map((project) => {
      const lines = evidence.filter((e) => e.project === project);
      const checks = lines.filter((e) => !e.informational);
      const notes = lines.filter((e) => e.informational);
      return {
        project,
        ...countTests(tests.filter((t) => t.project === project)),
        checksPass: checks.filter((e) => e.pass).length,
        checksFail: checks.filter((e) => !e.pass).length,
        notesMet: notes.filter((e) => e.pass).length,
        notesNotMet: notes.filter((e) => !e.pass).length,
      };
    });
}

/** The I1 checks that must fail when AuthProvider's cache clear is reverted (task 8 review). */
export const I1_SENSITIVE = ["switch-no-ava-crew-after-logout", "switch-bat-no-crew"];

export function mutationVerdict(m: MutationRun | null): { ran: boolean; caught: boolean; failed: Evidence[] } {
  if (!m || m.evidence.length === 0) return { ran: false, caught: false, failed: [] };
  const failed = m.evidence.filter((e) => !e.informational && !e.pass);
  return { ran: true, caught: failed.some((e) => I1_SENSITIVE.includes(e.id)), failed };
}

export function skipReasons(invocations: Invocation[]): Map<string, TestResult[]> {
  const skipped = invocations.flatMap((i) => i.tests).filter((t) => t.status === "skipped");
  return groupBy(skipped, (t) => t.skipReason ?? "(no reason given)");
}


export function overallLine(a: Artifacts, statuses: FindingStatus[]): string {
  const tests = a.invocations.flatMap((i) => i.tests);
  const failedTests = tests.filter((t) => t.status === "unexpected");
  const failedChecks = a.evidence.filter((e) => !e.informational && !e.pass);
  const explained = new Set(statuses.filter((s) => s.def.kind === "check").flatMap((s) => s.showing));
  const unexplained = failedChecks.filter((e) => !explained.has(a.evidence.indexOf(e)));
  const shown = statuses.filter((s) => s.def.kind === "check" && s.showing.length > 0).map((s) => s.def.id);
  const fixed = statuses.filter((s) => s.covered.length > 0 && s.showing.length === 0).map((s) => s.def.id);
  if (failedTests.length === 0 && failedChecks.length === 0) {
    return `Every test and every check passed${fixed.length ? `; findings ${fixed.join(", ")} read FIXED` : ""}.`;
  }
  const head =
    `The run exits non-zero: ${failedTests.length} test(s) and ${failedChecks.length} check(s) fail` +
    (shown.length ? `, from app finding(s) ${shown.join(", ")}` : "");
  return unexplained.length === 0
    ? `${head}. Every failing check belongs to a known app finding, which plan 6 fixed -- so it has come back.`
    : `${head}. ${unexplained.length} failing check(s) belong to no known finding -- see "Failed checks".`;
}
