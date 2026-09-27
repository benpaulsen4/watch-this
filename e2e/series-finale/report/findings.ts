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
  where: string;
  diagnosis: string;
  /** A failing check (the run fails on it) or an informational note. */
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
    kind: "check",
    matches: (e) => /^visual-.+-no-horizontal-scroll$/.test(e.id),
  },
  {
    id: "F2",
    title: "Phone recap header title wraps and clips",
    where: "src/components/ui/PageHeader.tsx:24-26 (fixed h-16 bar)",
    diagnosis:
      "Beside \"Play as story\" and Share, \"Series Finale 2025\" wraps to three lines inside the fixed-height header; the title column has no min-w-0/truncate, so the text spills above and below the bar.",
    kind: "check",
    matches: (e) => /^visual-.+-header-title-fits$/.test(e.id),
  },
  {
    id: "F3",
    title: "Crew capped by user id, before activity is loaded",
    where: "src/lib/series-finale/service.ts:238-275 (loadCollaboratorIds)",
    diagnosis:
      "Consenting collaborators are sorted by user id and the first 8 kept before any activity is loaded, so who is left out depends on ids, not on how much they watched. Informational: the note compares the crew the app stored for e2e_jon (nine consenting collaborators) with the oracle's 8 most active, and is met once the cap goes by activity.",
    kind: "note",
    matches: (e) => e.id === "crew-cap-rule",
  },
  {
    id: "F4",
    title: "Story summary card overflows on a long username",
    where: "src/components/series-finale/story-cards/SummaryCard.tsx:58-60",
    diagnosis:
      "The \"<username>'s year\" line has no break rule; underscores give no break opportunity, so flo's 725 px name runs out of the card (desktop) and scrolls the whole page sideways (phones). The share image wraps the same name.",
    kind: "check",
    matches: (e) => /^story-visual-.+-(fits-column|no-horizontal-scroll)$/.test(e.id),
  },
  {
    id: "F5",
    title: "Compare disc label clipped on phones (story and recap)",
    where: "src/components/series-finale/CompareSplit.tsx:113-123 (line 117: the peer label's truncate, in both the default and the large variant)",
    diagnosis:
      "The peer's disc label is exactly as wide as its box and overflow-hidden, so at DPR 2 the last glyph's ink is cut: \"only e2e_bo\" reads \"only e2e_bc\" on the story card's large disc and on the recap panel's default one. DOM widths cannot see it; the verdict is a person's reading of the phone screenshots (Task 7 review, final review), recorded as a manual observation. Informational.",
    kind: "note",
    matches: (e) => e.id === "F5-compare-disc-label-clipped",
  },
  {
    id: "F6",
    title: "Phone Share failure line overflows the header",
    where: "src/components/ui/PageHeader.tsx:24-26 + src/components/series-finale/ShareButton.tsx:130-136",
    diagnosis:
      "The Share wrapper is a flex column holding the button and the failure line; in the fixed h-16 bar it grows to 84 px and is centred past both edges: the button's top is off-screen and the line spills below the header.",
    kind: "check",
    matches: (e) => /^share-failure-layout(-boxes)?$/.test(e.id),
  },
];

export interface FindingStatus {
  def: FindingDef;
  /** Evidence indexes that show the finding: failing checks, or unmet notes (never a manual observation). */
  showing: number[];
  /** Every evidence index the finding covers, shown or not. */
  covered: number[];
  /** Every covering line is a manual observation: this run cannot say whether the finding still holds. */
  manualOnly: boolean;
  extra: string | null;
}

/** A finding's status in words, for the gallery and the report. */
export function findingState(s: FindingStatus): string {
  if (s.covered.length === 0) return "no evidence this run";
  if (s.manualOnly) return "manual observation; not re-verified by this run";
  if (s.showing.length === 0) return "not reproduced this run";
  return s.def.kind === "check" ? `reproduced: ${s.showing.length} failing check(s)` : "reproduced (note not met)";
}

/** F3's run-specific detail: who the id rule leaves out of e2e_jon's own 2025 crew. */
function jonCrewDetail(oracle: Oracle | null): string | null {
  const jon = oracle?.e2e_jon?.["2025"];
  if (!jon || !oracle) return null;
  const left = jon.crewCappedOut.map((u) => `${u} (${oracle[u]?.["2025"]?.episodes ?? "?"} episodes in 2025)`);
  return (
    `By the id rule, e2e_jon's 2025 crew leaves out ${left.join(", ") || "nobody"}; ava's leaves out ` +
    `${oracle.e2e_ava?.["2025"]?.crewCappedOut.join(", ") || "nobody"}. The seeder pins dee's id to sort last among jon's ` +
    "collaborators, so the rule leaves out a busy collaborator every run; the status compares the crew the app stored for " +
    "jon with his 8 most active (crew-cap-rule)."
  );
}

export function findingStatuses(a: Pick<Artifacts, "evidence" | "oracle">): FindingStatus[] {
  return FINDINGS.map((def) => {
    const covered = a.evidence.flatMap((e, i) => (def.matches(e) ? [i] : []));
    return {
      def,
      covered,
      showing: covered.filter((i) => !a.evidence[i]!.pass && !a.evidence[i]!.manual),
      manualOnly: covered.length > 0 && covered.every((i) => a.evidence[i]!.manual),
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
    title: "flo's banner reads \"0 episodes. 28 titles.\"",
    ids: ["banner-flo-headline"],
    text: "A films-only, non-thin year leads with a zero. It matches the oracle (so the check passes); it is a copy candidate for the visual review.",
  },
  {
    title: "Generation timing is not representative",
    ids: ["gen-time"],
    text: "The seeder pre-warms every TMDB cache, so first generation here never waits on TMDB.",
  },
  {
    title: "WebKit could not launch on this host",
    ids: [],
    text: "Missing system libraries (Task 1); installing them needs `sudo npx playwright install-deps`, a system change outside this suite. webkit-phone skips with that reason, so there are no Safari-engine screenshots.",
  },
  {
    title: "P19 logout flash not reproduced",
    ids: ["P19-logout-flash-security", "P19-logout-flash-streaming"],
    text: "No error line was seen between clicking Logout and /auth on either tab; the transition screenshots are kept for the visual review.",
  },
];

/**
 * What the suite does not check automatically (the final review's M8), so the
 * report's coverage story is honest. Each is visual, manual, or left to unit
 * tests.
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
    title: "F5, the clipped disc label",
    text: "Only visible in the phone screenshots; recorded as a manual observation with the screenshot paths and DOM widths, never as reproduced or fixed by a run.",
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
  if (failedTests.length === 0 && failedChecks.length === 0) return "Every test and every check passed.";
  const head =
    `The run exits non-zero: ${failedTests.length} test(s) and ${failedChecks.length} check(s) fail` +
    (shown.length ? `, from app finding(s) ${shown.join(", ")}` : "");
  return unexplained.length === 0
    ? `${head}. Every failing check is an app finding -- the expected, correct outcome; no harness bug is left.`
    : `${head}. ${unexplained.length} failing check(s) belong to no known finding -- see "Failed checks".`;
}
