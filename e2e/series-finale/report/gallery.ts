// The run's gallery and report, built from what the run left in artifacts/:
//
// - artifacts/index.html: a dark, self-contained page for reviewing the run by
//   eye. Findings first, then counts and failed checks, then every screenshot
//   grouped by surface with its projects side by side. Images are referenced
//   by relative path and the page has no scripts.
// - artifacts/report.md: the same results as text, plus the environment, the
//   seeded cast, ava's oracle block, timings, skips and every check.
//
// Inputs (ruling E8): evidence.jsonl, results-readonly.json and
// results-mutating.json (one per Playwright invocation), oracle.json,
// screenshots/<project>/**, cards/*.png, and mutation-i1/ when the one-off I1
// mutation check (ruling E9) has left its evidence there.
//
// Nothing here touches the database or the app: `npm run e2e:gallery` can
// rebuild both files from the artifacts at any time.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Oracle, OracleYear } from "../seed/oracle";
import { PERSONAS } from "../seed/personas";
import type { Evidence } from "../support/evidence";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const PROJECTS = ["desktop", "phone", "small-phone", "webkit-phone", "desktop-mutating"] as const;

export interface Shot {
  /** Path relative to artifacts/, with forward slashes: what index.html links. */
  src: string;
  /** The project folder, or "" for a share card or a shot outside any project. */
  project: string;
  /** The name the spec gave it (`recap/ava-2025/hero`), or `cards/<file>` for a share card. */
  name: string;
}

export interface TestResult {
  invocation: string;
  file: string;
  /** Describe blocks and the test's title, joined by " › ". */
  title: string;
  project: string;
  /** Playwright's outcome: expected, unexpected, flaky or skipped. */
  status: string;
  durationMs: number;
  skipReason: string | null;
  errors: string[];
}

export interface Invocation {
  name: string;
  found: boolean;
  startTime: string | null;
  durationMs: number;
  tests: TestResult[];
  /** Errors outside any test (config, webServer). */
  errors: string[];
}

export interface Environment {
  gitSha: string;
  gitDirty: boolean;
  playwright: string;
  chromium: string;
  webkit: string;
  dbImage: string;
  node: string;
  generatedAt: string;
}

export interface MutationRun {
  meta: {
    baseCommit?: string;
    mutation?: string;
    diff?: string;
    playwrightExit?: number | null;
    finishedAt?: string;
  };
  evidence: Evidence[];
  invocation: Invocation;
  shots: Shot[];
}

export interface Artifacts {
  evidence: Evidence[];
  invocations: Invocation[];
  oracle: Oracle | null;
  shots: Shot[];
  mutation: MutationRun | null;
  env: Environment;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface PwSuite {
  title: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwSpec {
  title: string;
  file: string;
  tests: PwTest[];
}
interface PwAnnotation {
  type: string;
  description?: string;
}
interface PwTest {
  projectName: string;
  status: string;
  annotations?: PwAnnotation[];
  results: { duration: number; errors?: { message?: string }[]; annotations?: PwAnnotation[] }[];
}
interface PwReport {
  config?: { version?: string };
  suites?: PwSuite[];
  stats?: { startTime?: string; duration?: number };
  errors?: { message?: string }[];
}

// ANSI colour codes in Playwright's error messages.
const ANSI = /\u001b\[[0-9;]*m/g;

function cleanError(message: string | undefined): string {
  return (message ?? "").replace(ANSI, "").trim();
}

export function readEvidence(path: string): Evidence[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Evidence);
}

/** One Playwright JSON report, flattened to a row per test and project. */
export function parseInvocation(name: string, report: PwReport | null): Invocation {
  if (!report) return { name, found: false, startTime: null, durationMs: 0, tests: [], errors: [] };
  const tests: TestResult[] = [];
  const walk = (suite: PwSuite, titles: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const annotations = [...(test.annotations ?? []), ...test.results.flatMap((r) => r.annotations ?? [])];
        tests.push({
          invocation: name,
          file: spec.file,
          title: [...titles, spec.title].join(" › "),
          project: test.projectName,
          status: test.status,
          durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
          skipReason: annotations.find((a) => a.type === "skip")?.description ?? null,
          errors: test.results.flatMap((r) => (r.errors ?? []).map((e) => cleanError(e.message))),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return {
    name,
    found: true,
    startTime: report.stats?.startTime ?? null,
    durationMs: report.stats?.duration ?? 0,
    tests,
    errors: (report.errors ?? []).map((e) => cleanError(e.message)),
  };
}

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (path: string, prefix: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(path, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(dir, "");
  return out.sort();
}

/** Screenshots under `<base>/screenshots` and cards under `<base>/cards`, with `src` prefixed by `srcPrefix`. */
export function readShots(base: string, srcPrefix = ""): Shot[] {
  const shots: Shot[] = [];
  for (const rel of listFiles(join(base, "screenshots")).filter((f) => f.endsWith(".png"))) {
    const parts = rel.replace(/\.png$/, "").split("/");
    const inProject = (PROJECTS as readonly string[]).includes(parts[0] ?? "");
    shots.push({
      src: `${srcPrefix}screenshots/${rel}`,
      project: inProject ? parts[0]! : "",
      name: (inProject ? parts.slice(1) : parts).join("/"),
    });
  }
  for (const rel of listFiles(join(base, "cards")).filter((f) => f.endsWith(".png"))) {
    shots.push({ src: `${srcPrefix}cards/${rel}`, project: "", name: `cards/${rel.replace(/\.png$/, "")}` });
  }
  return shots;
}

function browserVersion(browsers: { browsers?: { name: string; browserVersion?: string; revision?: string }[] } | null, name: string): string {
  const entry = browsers?.browsers?.find((b) => b.name === name);
  return entry ? `${entry.browserVersion ?? "?"} (revision ${entry.revision ?? "?"})` : "unknown";
}

function readEnvironment(artifactsDir: string, playwright: string | undefined): Environment {
  const repo = join(artifactsDir, "..", "..", "..");
  const git = (args: string[]) => {
    try {
      return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  const browsers = readJson<{ browsers?: { name: string; browserVersion?: string; revision?: string }[] }>(
    join(repo, "node_modules", "playwright-core", "browsers.json"),
  );
  const dbSh = existsSync(join(artifactsDir, "..", "env", "db.sh")) ? readFileSync(join(artifactsDir, "..", "env", "db.sh"), "utf8") : "";
  return {
    gitSha: git(["rev-parse", "HEAD"]) || "unknown",
    gitDirty: git(["status", "--porcelain"]) !== "",
    playwright: playwright ?? "unknown",
    chromium: browserVersion(browsers, "chromium"),
    webkit: browserVersion(browsers, "webkit"),
    dbImage: /^IMAGE=(\S+)/m.exec(dbSh)?.[1] ?? "unknown",
    node: process.version,
    generatedAt: new Date().toISOString(),
  };
}

function readMutation(artifactsDir: string): MutationRun | null {
  const dir = join(artifactsDir, "mutation-i1");
  if (!existsSync(dir)) return null;
  return {
    meta: readJson<MutationRun["meta"]>(join(dir, "meta.json")) ?? {},
    evidence: readEvidence(join(dir, "evidence.jsonl")),
    invocation: parseInvocation("mutation-i1", readJson<PwReport>(join(dir, "results.json"))),
    shots: readShots(dir, "mutation-i1/"),
  };
}

export function loadArtifacts(artifactsDir: string): Artifacts {
  const reports = ["readonly", "mutating"].map((name) => ({
    name,
    report: readJson<PwReport>(join(artifactsDir, `results-${name}.json`)),
  }));
  const playwright = reports.find((r) => r.report?.config?.version)?.report?.config?.version;
  return {
    evidence: readEvidence(join(artifactsDir, "evidence.jsonl")),
    invocations: reports.map((r) => parseInvocation(r.name, r.report)),
    oracle: readJson<Oracle>(join(artifactsDir, "oracle.json")),
    shots: readShots(artifactsDir),
    mutation: readMutation(artifactsDir),
    env: readEnvironment(artifactsDir, playwright),
  };
}

// ---------------------------------------------------------------------------
// Which checks each screenshot illustrates
// ---------------------------------------------------------------------------

const re = (source: string) => new RegExp(source);

/** 40-recap's checks per recap section (ava 2025 only). */
const RECAP_SECTION_CHECKS: Record<string, RegExp[]> = {
  hero: [/^recap-hero-/],
  tiles: [/^recap-tile-/],
  "top-show": [/^recap-top-show-/, /^recap-also-top-for$/],
  niche: [/^recap-niche-/],
  shame: [/^recap-shame-/],
  "big-day": [/^recap-big-day$/],
  crew: [/^recap-crew-/, /^crew-cap-rule$/],
  compare: [/^recap-compare-/],
  footer: [/^recap-footer-/],
};

/** 50-story's checks per story card (ava 2025 only), by card id. */
const STORY_CARD_CHECKS: Record<string, RegExp[]> = {
  intro: [/^story-ava-rendered$/, /^story-one-h1/, /^story-left-at-start$/, /^story-walk-(cards|headings)$/, /^story-cards-without-h2$/],
  hours: [/^story-reach-hours$/, /^story-parity-straight-days$/],
  finished: [/^story-reach-finished$/, /^story-parity-dropped$/],
  topShow: [/^story-reach-topShow$/, /^story-parity-last-watched$/],
  shame: [/^story-reach-shame$/, /^story-small-shame-/],
  crew: [/^story-reach-crew$/, /^story-crew-/, /^story-small-crew-/],
  compare: [/^story-small-compare-/],
  summary: [/^story-reach-summary$/, /^story-right-at-end$/, /^story-share-/, /^story-parity-summary-/, /^story-small-summary-/],
};

/** A story position ("08") to its card id ("months"), per project, from 50-story's `story-walk-headings` note. */
export type CardAt = (project: string, nn: string) => string | undefined;

export function cardLookup(evidence: Evidence[]): CardAt {
  const byProject = new Map<string, Map<string, string>>();
  for (const e of evidence) {
    if (e.id !== "story-walk-headings" || !Array.isArray(e.actual)) continue;
    const cards = new Map<string, string>();
    for (const row of e.actual as { nn?: string; card?: string }[]) {
      if (row.nn && row.card) cards.set(row.nn, row.card);
    }
    byProject.set(e.project, cards);
  }
  return (project, nn) => byProject.get(project)?.get(nn);
}

type Rule = [RegExp, (m: RegExpMatchArray, project: string, cardAt: CardAt) => RegExp[]];

// First match wins. Shot names come from the specs' shot()/shotElement() calls.
const RULES: Rule[] = [
  [/^recap\/([a-z]+)-(\d{4})\/full$/, (m) => [
    re(`^visual-${m[1]}-${m[2]}-`),
    ...(m[1] === "ava" && m[2] === "2025" ? [/^recap-ava-rendered$/, /^recap-header-/] : []),
  ]],
  [/^recap\/([a-z]+)-(\d{4})\/thin-card$/, (m) => [re(`^visual-${m[1]}-${m[2]}-thin$`), re(`^gating-${m[1]}-${m[2]}-`)]],
  [/^recap\/([a-z]+)-(\d{4})\/([\w-]+)$/, (m) => [
    re(`^visual-${m[1]}-${m[2]}-sections$`),
    ...(m[3] === "big-day" ? [re(`^visual-${m[1]}-${m[2]}-clock-disclosure$`)] : []),
    ...(m[3] === "rhythm" ? [re(`^visual-${m[1]}-${m[2]}-no-late-share$`)] : []),
    ...(m[1] === "ava" && m[2] === "2025" ? (RECAP_SECTION_CHECKS[m[3]!] ?? []) : []),
  ]],
  [/^recap\/ava-2025-after-cy-optout\//, () => [/^consent-after-/]],
  [/^recap\/ava-2025-after-rename\//, () => [/^rename-ava-recap$/, /^rename-recap-/]],
  [/^story\/ava-2025-after-rename\//, () => [/^rename-story-/]],
  [/^recap\/bat-2025-after-switch$/, () => [/^switch-(bat|same|no|observer)-/]],
  [/^recap\/state-(\w+)$/, (m) => [re(`^recap-state-${m[1]}-`)]],
  [/^recap\/malformed-404$/, () => [/^gating-malformed-/]],
  [/^recap\/neo-2025-unavailable$/, () => [/^gating-neo-2025-/]],
  [/^recap\/tia-2025-thin$/, () => [/^gating-tia-2025-(oracle-thin|recap-|no-)/]],
  [/^story\/tia-2025(\/thin|-thin)$/, () => [/^story-visual-tia-/, /^gating-tia-2025-story-/]],
  [/^story\/([a-z]+)-(\d{4})\/(\d\d)-/, (m, project, cardAt) => {
    const [, user, year, nn] = m;
    const patterns = [re(`^story-visual-${user}-${year}-${nn}-`)];
    if (nn === "01") patterns.push(re(`^story-visual-${user}-${year}-(rendered|cards)$`));
    if (user === "ava" && year === "2025") {
      patterns.push(re(`^story-walk-${nn}-`));
      const card = cardAt(project, nn!);
      if (card) patterns.push(...(STORY_CARD_CHECKS[card] ?? []));
    }
    return patterns;
  }],
  [/^dashboard\/ava-banner(-card)?$/, () => [/^banner-ava-/]],
  [/^dashboard\/flo-banner$/, () => [/^banner-flo-/]],
  [/^dashboard\/ava-after-dismiss$/, () => [/^dismiss-(?!failed)/]],
  [/^dashboard\/bo-dismiss-failed$/, () => [/^dismiss-failed-/]],
  [/^profile\/ava-rows$/, () => [/^profile-rows(?!-error)/]],
  [/^profile\/rows-error$/, () => [/^profile-rows-error-/]],
  [/^profile\/crew-switch-on$/, () => [/^profile-crew-(switch|consent)/]],
  [/^profile\/crew-switch-failed$/, () => [/^profile-crew-failed-/]],
  [/^profile\/ava-data-tab$/, () => [/^profile-ava-data-tab$/]],
  [/^profile\/neo-empty$/, () => [/^gating-neo-(profile|list)-empty$/]],
  [/^profile\/cy-switch-off$/, () => [/^consent-cy-/]],
  [/^profile\/bo-renamed$/, () => [/^rename-(precondition|profile-tab|put|shown|stored|bo-recap-hero)$/]],
  [/^profile\/logout-transition-(\w+)$/, (m) => [
    re(`^P19-logout-flash-${m[1]}$`),
    re(`^logout-${m[1]}-`),
    ...(m[1] === "security" ? [/^switch-ava-security-tab$/] : []),
  ]],
  [/^share\/failure-line$/, () => [/^share-failure-/]],
  [/^auth\/registered-dashboard$/, () => [/^auth-/]],
  [/^cards\/ava-2025-downloaded$/, () => [/^share-desktop-download/]],
  [/^cards\/ava-2025-shared-from-story$/, () => [/^share-story-/]],
  [/^cards\/bo-2025-renamed$/, () => [/^rename-bo-card/]],
  [/^cards\/ava-2025-before-switch$/, () => [/^switch-ava-(card|prefetch)$/]],
  [/^cards\/bat-2025-after-switch$/, () => [/^switch-bat-(download|card-)/]],
  [/^cards\/([a-z]+)-(\d{4})$/, (m) => [
    re(`^card-${m[1]}-${m[2]}-`),
    re(`^card-save-${m[1]}-${m[2]}\\.png$`),
    re(`^card-${m[1]}-no-`),
    ...(m[1] === "ava" ? [/^privacy-/] : []),
  ]],
];

/**
 * Indexes into `evidence` of the checks `shot` illustrates: the rule for its
 * name (same project; any project for a share card), plus any evidence line
 * that names the shot itself (F5's note carries its screenshot path).
 */
export function relatedChecks(shot: Shot, evidence: Evidence[], cardAt: CardAt): number[] {
  const rule = RULES.map(([pattern, build]) => ({ m: pattern.exec(shot.name), build })).find((r) => r.m);
  const patterns = rule?.m ? rule.build(rule.m, shot.project, cardAt) : [];
  const isCard = shot.name.startsWith("cards/");
  const out: number[] = [];
  evidence.forEach((e, i) => {
    if (!isCard && e.project !== shot.project) return;
    const byRule = patterns.some((p) => p.test(e.id));
    const byMention = !isCard && `${e.description} ${JSON.stringify(e.actual)}`.includes(shot.name);
    if (byRule || byMention) out.push(i);
  });
  return out;
}

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
      "Consenting collaborators are sorted by user id and the first 8 kept before any activity is loaded, so which busy collaborator is left out depends on random registration ids, not on how much they watched. Informational.",
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
    title: "Compare disc label clipped on phones",
    where: "src/components/series-finale/CompareSplit.tsx:117 (large variant, truncate)",
    diagnosis:
      "The large disc label is exactly as wide as its box and overflow-hidden, so at DPR 2 the last glyph's ink is cut: \"only e2e_bo\" reads \"only e2e_bc\". DOM widths cannot see it; the verdict is by eye. Informational.",
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
  /** Evidence indexes that show the finding: failing checks, or unmet notes. */
  showing: number[];
  /** Every evidence index the finding covers, shown or not. */
  covered: number[];
  extra: string | null;
}

/** F3's run-specific detail: who the id rule leaves out of e2e_jon's own 2025 crew. */
function jonCrewDetail(oracle: Oracle | null): string | null {
  const jon = oracle?.e2e_jon?.["2025"];
  if (!jon || !oracle) return null;
  const left = jon.crewCappedOut.map((u) => `${u} (${oracle[u]?.["2025"]?.episodes ?? "?"} episodes in 2025)`);
  return (
    `e2e_jon's 2025 crew leaves out ${left.join(", ") || "nobody"}; ava's leaves out ` +
    `${oracle.e2e_ava?.["2025"]?.crewCappedOut.join(", ") || "nobody"}. The one left out of jon's varies with the random ` +
    "registration ids (earlier runs dropped e2e_ava, 230 episodes, and e2e_eli, 185)."
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

function countTests(tests: TestResult[]) {
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

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function json(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function specOf(e: Evidence): string {
  return e.spec ?? "(spec not recorded)";
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

function skipReasons(invocations: Invocation[]): Map<string, TestResult[]> {
  const skipped = invocations.flatMap((i) => i.tests).filter((t) => t.status === "skipped");
  return groupBy(skipped, (t) => t.skipReason ?? "(no reason given)");
}

/** Why a project has no shot: its tests' skip reason, when they were all skipped. */
function missingReason(invocations: Invocation[], project: string): string {
  const tests = invocations.flatMap((i) => i.tests).filter((t) => t.project === project);
  if (tests.length > 0 && tests.every((t) => t.status === "skipped")) {
    return `not run: ${tests.find((t) => t.skipReason)?.skipReason ?? "skipped"}`;
  }
  return "not captured";
}

function overallLine(a: Artifacts, statuses: FindingStatus[]): string {
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

// ---------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------

interface Column {
  project: string;
  label: string;
  weight: number;
}

const COL = {
  desktop: { project: "desktop", label: "desktop 1440×900", weight: 2 },
  phone: { project: "phone", label: "phone 390×844", weight: 1 },
  smallPhone: { project: "small-phone", label: "small-phone 360×640", weight: 1 },
  webkit: { project: "webkit-phone", label: "webkit-phone 390×844", weight: 1 },
  mutating: { project: "desktop-mutating", label: "desktop-mutating", weight: 2 },
} satisfies Record<string, Column>;

const RECAP_COLUMNS: Column[] = [COL.desktop, COL.phone, COL.webkit];
const STORY_COLUMNS: Column[] = [COL.phone, COL.smallPhone, { ...COL.desktop, weight: 1.6 }, COL.webkit];
const PAIR_COLUMNS: Column[] = [COL.desktop, COL.phone];
const MUTATING_COLUMNS: Column[] = [COL.mutating];

const RECAP_SECTION_ORDER = [
  "full", "hero", "tiles", "months", "rhythm", "top-show", "niche", "genres",
  "big-day", "shame", "crew", "compare", "footer", "thin-card",
];
const PERSONA_ORDER = ["ava", "bo", "bat", "flo", "tia"];

class Page {
  private readonly placed = new Set<string>();
  private readonly byKey = new Map<string, Shot>();
  private readonly cardAt: CardAt;
  private readonly mutationCardAt: CardAt;

  constructor(private readonly a: Artifacts) {
    for (const shot of [...a.shots, ...(a.mutation?.shots ?? [])]) this.byKey.set(shot.src, shot);
    this.cardAt = cardLookup(a.evidence);
    this.mutationCardAt = cardLookup(a.mutation?.evidence ?? []);
  }

  shot(project: string, name: string, mutation = false): Shot | undefined {
    const prefix = mutation ? "mutation-i1/" : "";
    const src = name.startsWith("cards/") ? `${prefix}${name}.png` : `${prefix}screenshots/${project ? `${project}/` : ""}${name}.png`;
    return this.byKey.get(src);
  }

  names(test: (name: string) => boolean): string[] {
    return [...new Set(this.a.shots.filter((s) => s.project !== "" && test(s.name)).map((s) => s.name))].sort();
  }

  chip(e: Evidence, anchor: string, times = 1): string {
    const cls = e.informational ? (e.pass ? "note" : "note unmet") : e.pass ? "pass" : "fail";
    const title = `${e.description}\nexpected: ${clip(json(e.expected), 300)}\nactual: ${clip(json(e.actual), 300)}`;
    return `<a class="chip ${cls}" href="#${anchor}" title="${esc(title)}">${esc(e.id)}${times > 1 ? ` ×${times}` : ""}</a>`;
  }

  /** One chip per check id and outcome (a test that repeats a check gets "×n"), linking to the first line. */
  chips(indexes: number[], evidence: Evidence[], prefix: "e" | "m"): string {
    const groups = new Map<string, number[]>();
    for (const i of indexes) {
      const e = evidence[i]!;
      const key = `${e.id}|${e.project}|${e.pass}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return [...groups.values()].map((group) => this.chip(evidence[group[0]!]!, `${prefix}${group[0]}`, group.length)).join("");
  }

  figure(shot: Shot | undefined, missing: string): string {
    if (!shot) return `<div class="shot missing"><span>${esc(missing)}</span></div>`;
    this.placed.add(shot.src);
    const fromMutation = shot.src.startsWith("mutation-i1/");
    const evidence = fromMutation ? (this.a.mutation?.evidence ?? []) : this.a.evidence;
    const related = relatedChecks(shot, evidence, fromMutation ? this.mutationCardAt : this.cardAt);
    const chips = related.length ? this.chips(related, evidence, fromMutation ? "m" : "e") : `<span class="muted">no checks</span>`;
    const label = shot.project ? `${shot.project}/${shot.name}` : shot.name;
    return (
      `<figure class="shot"><a class="frame" href="${esc(shot.src)}"><img src="${esc(shot.src)}" loading="lazy" alt="${esc(label)}"></a>` +
      `<figcaption><code>${esc(fromMutation ? `I1 mutant: ${label}` : label)}</code><div class="chips">${chips}</div></figcaption></figure>`
    );
  }

  grid(columns: Column[], rows: { label: string; cells: (Shot | undefined)[] }[]): string {
    const template = columns.map((c) => `${c.weight}fr`).join(" ");
    const head = columns.map((c) => `<div class="colhead">${esc(c.label)}</div>`).join("");
    const body = rows
      .map(
        (row) =>
          `<div class="rowlabel">${esc(row.label)}</div><div class="cells" style="grid-template-columns:${template}">` +
          row.cells.map((cell, i) => this.figure(cell, missingReason(this.a.invocations, columns[i]!.project))).join("") +
          `</div>`,
      )
      .join("");
    return `<div class="grid"><div class="cells head" style="grid-template-columns:${template}">${head}</div>${body}</div>`;
  }

  /** Rows for `names` in `columns`; names seen only in desktop-mutating get their own grid. */
  projectGrid(names: string[], columns: Column[], label: (name: string) => string = (n) => n): string {
    const readOnly = names.filter((n) => columns.some((c) => this.shot(c.project, n)));
    const mutating = names.filter((n) => !readOnly.includes(n) && this.shot("desktop-mutating", n));
    const rows = (ns: string[], cols: Column[]) => ns.map((n) => ({ label: label(n), cells: cols.map((c) => this.shot(c.project, n)) }));
    return (
      (readOnly.length ? this.grid(columns, rows(readOnly, columns)) : "") +
      (mutating.length ? this.grid(MUTATING_COLUMNS, rows(mutating, MUTATING_COLUMNS)) : "")
    );
  }

  section(id: string, title: string, body: string, intro = ""): string {
    return `<section id="${id}"><h2>${esc(title)}</h2>${intro ? `<p class="intro">${intro}</p>` : ""}${body}</section>`;
  }

  // -- summary parts --------------------------------------------------------

  findings(statuses: FindingStatus[]): string {
    const shotsFor = (indexes: number[]) => {
      const out: Shot[] = [];
      for (const shot of this.a.shots) {
        const related = relatedChecks(shot, this.a.evidence, this.cardAt);
        if (related.some((i) => indexes.includes(i))) out.push(shot);
      }
      return out;
    };
    const cards = statuses
      .map((s) => {
        const shown = s.showing.length > 0;
        const state = s.covered.length === 0 ? "no evidence this run" : shown ? (s.def.kind === "check" ? `${s.showing.length} failing check(s)` : "note not met") : "not reproduced this run";
        const evidenceIdx = shown ? s.showing : s.covered;
        const found = shotsFor(evidenceIdx);
        const shots = found
          .map((shot) => `<a href="${esc(shot.src)}"><code>${esc(shot.project ? `${shot.project}/${shot.name}` : shot.name)}</code></a>`)
          .join(" ");
        const thumbs = found
          .slice(0, 6)
          .map((shot) => `<a href="${esc(shot.src)}"><img src="${esc(shot.src)}" loading="lazy" alt="${esc(`${shot.project}/${shot.name}`)}"></a>`)
          .join("");
        return (
          `<article class="finding ${shown ? "shown" : "quiet"}"><h3><span class="fid">${s.def.id}</span> ${esc(s.def.title)} <span class="state">${esc(state)} · ${s.def.kind === "check" ? "failing check" : "informational"}</span></h3>` +
          `<p><b>Where:</b> <code>${esc(s.def.where)}</code></p><p>${esc(s.def.diagnosis)}</p>` +
          (s.extra ? `<p>${esc(s.extra)}</p>` : "") +
          `<p><b>Checks:</b> <span class="chips">${this.chips(evidenceIdx, this.a.evidence, "e") || "none"}</span></p>` +
          `<p><b>Screenshots:</b> ${shots || "none"}</p>${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}</article>`
        );
      })
      .join("");
    return this.section("findings", "Findings", cards, esc(overallLine(this.a, statuses)));
  }

  summary(): string {
    const inv = this.a.invocations
      .map((i) => {
        if (!i.found) return `<tr><td>${esc(i.name)}</td><td colspan="6" class="muted">no results file</td></tr>`;
        const c = countTests(i.tests);
        const outcome = c.failed > 0 || i.errors.length > 0 ? `<span class="bad">failed</span>` : `<span class="good">passed</span>`;
        return `<tr><td>${esc(i.name)}</td><td>${c.passed}</td><td class="${c.failed ? "bad" : ""}">${c.failed}</td><td>${c.skipped}</td><td>${c.flaky}</td><td>${seconds(i.durationMs)}</td><td>${outcome}</td></tr>`;
      })
      .join("");
    const proj = projectCounts(this.a.invocations, this.a.evidence)
      .map(
        (p) =>
          `<tr><td>${esc(p.project)}</td><td>${p.passed}</td><td class="${p.failed ? "bad" : ""}">${p.failed}</td><td>${p.skipped}</td>` +
          `<td>${p.checksPass}</td><td class="${p.checksFail ? "bad" : ""}">${p.checksFail}</td><td>${p.notesMet}</td><td>${p.notesNotMet}</td></tr>`,
      )
      .join("");
    return this.section(
      "summary",
      "Counts",
      `<h3>Per Playwright invocation</h3><table><tr><th>invocation</th><th>passed</th><th>failed</th><th>skipped</th><th>flaky</th><th>duration</th><th>outcome</th></tr>${inv}</table>` +
        `<h3>Per project</h3><table><tr><th>project</th><th>tests passed</th><th>tests failed</th><th>skipped</th><th>checks pass</th><th>checks fail</th><th>notes met</th><th>notes not met</th></tr>${proj}</table>`,
    );
  }

  failed(statuses: FindingStatus[]): string {
    const findingOf = new Map<number, string>();
    for (const s of statuses) for (const i of s.showing) findingOf.set(i, s.def.id);
    const rows = this.a.evidence
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.informational && !e.pass)
      .map(
        ({ e, i }) =>
          `<tr><td><a href="#e${i}"><code>${esc(e.id)}</code></a><div class="muted">${esc(specOf(e))}</div></td><td>${esc(e.project)}</td>` +
          `<td>${esc(e.description)}</td><td><pre>${esc(json(e.expected))}</pre></td><td><pre>${esc(json(e.actual))}</pre></td>` +
          `<td>${esc(findingOf.get(i) ?? "unclassified")}</td></tr>`,
      )
      .join("");
    const tests = this.a.invocations
      .flatMap((i) => i.tests)
      .filter((t) => t.status === "unexpected")
      .map((t) => `<tr><td>${esc(t.file)}</td><td>${esc(t.title)}</td><td>${esc(t.project)}</td><td><pre>${esc(clip(t.errors[0] ?? "", 600))}</pre></td></tr>`)
      .join("");
    return this.section(
      "failed",
      "Failed checks",
      (rows
        ? `<table class="wide"><tr><th>check</th><th>project</th><th>what</th><th>expected</th><th>actual</th><th>finding</th></tr>${rows}</table>`
        : `<p class="good">No check failed.</p>`) +
        (tests ? `<h3>Failed tests</h3><table class="wide"><tr><th>spec</th><th>test</th><th>project</th><th>first error</th></tr>${tests}</table>` : ""),
    );
  }

  mutation(): string {
    const m = this.a.mutation;
    const v = mutationVerdict(m);
    if (!m || !v.ran) return this.section("mutation", "Mutation check (I1)", `<p class="muted">Not run: artifacts/mutation-i1/ holds no evidence.</p>`);
    const verdict = v.caught
      ? `<p class="good"><b>Caught.</b> With AuthProvider's <code>queryClient.clear()</code> reverted, the I1 regression test fails on ${esc(v.failed.filter((e) => I1_SENSITIVE.includes(e.id)).map((e) => e.id).join(", "))}.</p>`
      : `<p class="bad"><b>Not caught.</b> With the cache clear reverted, none of ${esc(I1_SENSITIVE.join(", "))} failed.</p>`;
    const rows = m.evidence
      .map(
        (e, i) =>
          `<tr id="m${i}" class="${e.informational ? "info" : e.pass ? "" : "failrow"}"><td><code>${esc(e.id)}</code></td><td>${e.informational ? (e.pass ? "note met" : "note not met") : e.pass ? "PASS" : "FAIL"}</td>` +
          `<td><pre>${esc(clip(json(e.expected), 400))}</pre></td><td><pre>${esc(clip(json(e.actual), 400))}</pre></td></tr>`,
      )
      .join("");
    const meta =
      `<p>Base commit <code>${esc(m.meta.baseCommit ?? "?")}</code>; mutation: ${esc(m.meta.mutation ?? "?")}; ` +
      `Playwright exit ${esc(String(m.meta.playwrightExit ?? "?"))}; finished ${esc(m.meta.finishedAt ?? "?")}.</p>` +
      (m.meta.diff ? `<pre class="diff">${esc(m.meta.diff)}</pre>` : "");
    const passed = m.evidence.filter((e) => !e.informational && e.pass).map((e) => e.id);
    const still = `<p>Still passed in the mutant (preconditions, ava-side checks and bat-side checks that cannot see a stale payload): <code>${esc(passed.join(", ") || "none")}</code>. See the Account switch section for the mutant's screenshots.</p>`;
    return this.section(
      "mutation",
      "Mutation check (I1)",
      verdict + meta + still + `<details><summary>The mutant run's ${m.evidence.length} evidence lines</summary><table class="wide"><tr><th>check</th><th>result</th><th>expected</th><th>actual</th></tr>${rows}</table></details>`,
    );
  }

  notes(): string {
    const byId = (id: string) => this.a.evidence.flatMap((e, i) => (e.id === id ? [i] : []));
    const listed = NOTES.map((n) => {
      const idx = n.ids.flatMap(byId);
      const chips = this.chips(idx, this.a.evidence, "e");
      return `<li><b>${esc(n.title)}.</b> ${esc(n.text)} ${chips ? `<span class="chips">${chips}</span>` : ""}</li>`;
    }).join("");
    const rows = this.a.evidence
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.informational)
      .map(
        ({ e, i }) =>
          `<tr><td><a href="#e${i}"><code>${esc(e.id)}</code></a></td><td>${esc(e.project)}</td><td>${esc(e.description)}</td>` +
          `<td>${e.pass ? "met" : "not met"}</td><td><pre>${esc(clip(json(e.actual), 500))}</pre></td></tr>`,
      )
      .join("");
    return this.section(
      "notes",
      "Notes",
      `<ul class="notes">${listed}</ul><h3>Every informational evidence line</h3><table class="wide"><tr><th>note</th><th>project</th><th>what</th><th>expected met?</th><th>actual</th></tr>${rows}</table>`,
      "Informational lines (<code>note()</code>) never fail a test.",
    );
  }

  // -- galleries ------------------------------------------------------------

  shareCards(): string {
    const cards = this.a.shots.filter((s) => s.name.startsWith("cards/"));
    return this.section("cards", "Share cards", `<div class="cardrow">${cards.map((s) => this.figure(s, "")).join("")}</div>`, "1080×1350 PNGs as the app served them (and as downloaded or shared).");
  }

  dashboard(): string {
    return this.section("dashboard", "Dashboard banner", this.projectGrid(this.names((n) => n.startsWith("dashboard/")), PAIR_COLUMNS));
  }

  recap(): string {
    const dirs = new Set<string>();
    for (const n of this.names((n) => /^recap\/[a-z]+-\d{4}\//.test(n))) dirs.add(n.split("/")[1]!);
    const ordered = [...dirs].sort((x, y) => {
      const [px, yx] = x.split("-");
      const [py, yy] = y.split("-");
      const rank = (p: string | undefined) => (PERSONA_ORDER.indexOf(p ?? "") + 100) % 100;
      return rank(px) - rank(py) || (yy ?? "").localeCompare(yx ?? "");
    });
    const body = ordered
      .map((dir) => {
        const sections = this.names((n) => n.startsWith(`recap/${dir}/`)).map((n) => n.split("/")[2]!);
        const rank = (s: string) => (RECAP_SECTION_ORDER.indexOf(s) + 100) % 100;
        sections.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
        return `<h3 id="recap-${esc(dir)}">${esc(dir)}</h3>` + this.projectGrid(sections.map((s) => `recap/${dir}/${s}`), RECAP_COLUMNS, (n) => n.split("/")[2]!);
      })
      .join("");
    const toc = ordered.map((d) => `<a href="#recap-${esc(d)}">${esc(d)}</a>`).join(" · ");
    return this.section("recap", "Recap", body, `Per persona and year, one row per section. ${toc}`);
  }

  story(): string {
    const dirs = [...new Set(this.names((n) => /^story\/[a-z]+-\d{4}\//.test(n)).map((n) => n.split("/")[1]!))].sort(
      (x, y) => ((PERSONA_ORDER.indexOf(x.split("-")[0]!) + 100) % 100) - ((PERSONA_ORDER.indexOf(y.split("-")[0]!) + 100) % 100),
    );
    const body = dirs
      .map((dir) => `<h3 id="story-${esc(dir)}">${esc(dir)}</h3>` + this.projectGrid(this.names((n) => n.startsWith(`story/${dir}/`)), STORY_COLUMNS, (n) => n.split("/")[2]!))
      .join("");
    const toc = dirs.map((d) => `<a href="#story-${esc(d)}">${esc(d)}</a>`).join(" · ");
    return this.section("story", "Story", body, `One row per card, in reel order. ${toc}`);
  }

  profile(): string {
    const names = this.names((n) => n.startsWith("profile/") && !!this.shot("desktop", n));
    return this.section("profile", "Profile", this.projectGrid(names, PAIR_COLUMNS));
  }

  states(): string {
    const names = [
      "recap/state-loading", "recap/state-error", "recap/state-retried", "recap/state-unavailable",
      "recap/neo-2025-unavailable", "recap/malformed-404", "recap/tia-2025-thin", "story/tia-2025-thin", "share/failure-line",
    ].filter((n) => PAIR_COLUMNS.some((c) => this.shot(c.project, n)));
    return this.section("states", "States", this.projectGrid(names, PAIR_COLUMNS), "Loading, error and retry, unavailable, the 404 for a malformed period, a thin year, and the Share failure line.");
  }

  consent(): string {
    const storyCard = (card: string) => {
      const nn = [...Array(20).keys()].map((i) => String(i + 1).padStart(2, "0")).find((n) => this.cardAt("desktop", n) === card);
      const name = nn ? this.names((n) => n.startsWith(`story/ava-2025/${nn}-`))[0] : undefined;
      return name ? this.shot("desktop", name) : undefined;
    };
    const m = "desktop-mutating";
    const columns: Column[] = [
      { project: "desktop", label: "before (desktop, read-only run)", weight: 1 },
      { project: m, label: "after cy opts out", weight: 1 },
      { project: m, label: "after bo renames", weight: 1 },
    ];
    const rows = [
      { label: "recap crew", cells: [this.shot("desktop", "recap/ava-2025/crew"), this.shot(m, "recap/ava-2025-after-cy-optout/crew"), this.shot(m, "recap/ava-2025-after-rename/crew")] },
      { label: "recap compare", cells: [this.shot("desktop", "recap/ava-2025/compare"), this.shot(m, "recap/ava-2025-after-cy-optout/compare"), this.shot(m, "recap/ava-2025-after-rename/compare")] },
      { label: "recap top show", cells: [this.shot("desktop", "recap/ava-2025/top-show"), undefined, this.shot(m, "recap/ava-2025-after-rename/top-show")] },
      { label: "story top show", cells: [storyCard("topShow"), undefined, this.shot(m, "story/ava-2025-after-rename/top-show")] },
      { label: "story crew", cells: [storyCard("crew"), undefined, this.shot(m, "story/ava-2025-after-rename/crew")] },
      { label: "story compare", cells: [storyCard("compare"), undefined, this.shot(m, "story/ava-2025-after-rename/compare")] },
      { label: "profile", cells: [undefined, this.shot(m, "profile/cy-switch-off"), this.shot(m, "profile/bo-renamed")] },
      { label: "bo's share card", cells: [this.shot("", "cards/bo-2025"), undefined, this.shot("", "cards/bo-2025-renamed")] },
    ];
    return this.section(
      "consent",
      "Consent & rename, before and after",
      this.gridNoReason(columns, rows),
      "ava's recap and story before the mutating specs, after e2e_cy withdraws consent (withheld on read), and after e2e_bo renames himself e2e_bo_renamed.",
    );
  }

  accountSwitch(): string {
    const m = "desktop-mutating";
    const columns: Column[] = [
      { project: m, label: "this run (desktop-mutating)", weight: 1 },
      { project: m, label: "I1 mutant: cache clear reverted", weight: 1 },
    ];
    const rows = [
      { label: "logout from Security (P19)", cells: [this.shot(m, "profile/logout-transition-security"), this.shot(m, "profile/logout-transition-security", true)] },
      { label: "logout from Streaming (P19)", cells: [this.shot(m, "profile/logout-transition-streaming"), this.shot(m, "profile/logout-transition-streaming", true)] },
      { label: "bat's recap after the switch", cells: [this.shot(m, "recap/bat-2025-after-switch"), this.shot(m, "recap/bat-2025-after-switch", true)] },
      { label: "ava's card before the switch", cells: [this.shot("", "cards/ava-2025-before-switch"), this.shot("", "cards/ava-2025-before-switch", true)] },
      { label: "bat's downloaded card", cells: [this.shot("", "cards/bat-2025-after-switch"), this.shot("", "cards/bat-2025-after-switch", true)] },
    ];
    return this.section(
      "switch",
      "Account switch",
      this.gridNoReason(columns, rows),
      "ava signs out and bat signs in within one document (no page load). The right column is the one-off I1 mutation run, if it was kept.",
    );
  }

  /** A grid whose empty cells just say "none" (the columns are not projects). */
  private gridNoReason(columns: Column[], rows: { label: string; cells: (Shot | undefined)[] }[]): string {
    const template = columns.map((c) => `${c.weight}fr`).join(" ");
    const head = columns.map((c) => `<div class="colhead">${esc(c.label)}</div>`).join("");
    const body = rows
      .map((row) => `<div class="rowlabel">${esc(row.label)}</div><div class="cells" style="grid-template-columns:${template}">${row.cells.map((c) => this.figure(c, "none")).join("")}</div>`)
      .join("");
    return `<div class="grid"><div class="cells head" style="grid-template-columns:${template}">${head}</div>${body}</div>`;
  }

  other(): string {
    const rest = this.a.shots.filter((s) => !this.placed.has(s.src));
    if (rest.length === 0) return "";
    return this.section("other", "Other screenshots", `<div class="cardrow">${rest.map((s) => this.figure(s, "")).join("")}</div>`, "Everything not placed in a section above.");
  }

  skipped(): string {
    const rows = [...skipReasons(this.a.invocations)]
      .map(([reason, tests]) => `<tr><td>${esc(reason)}</td><td>${tests.length}</td><td>${esc([...new Set(tests.map((t) => `${t.project}: ${t.file}`))].join("; "))}</td></tr>`)
      .join("");
    return this.section("skipped", "Skipped tests", rows ? `<table class="wide"><tr><th>reason</th><th>tests</th><th>where</th></tr>${rows}</table>` : `<p>Nothing was skipped.</p>`);
  }

  checks(): string {
    const bySpec = groupBy(
      this.a.evidence.map((e, i) => ({ e, i })),
      ({ e }) => specOf(e),
    );
    const body = [...bySpec]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(
        ([spec, lines]) =>
          `<h3>${esc(spec)} <span class="muted">${lines.length} lines</span></h3><table class="wide checks"><tr><th>check</th><th>project</th><th>result</th><th>what</th><th>expected</th><th>actual</th></tr>` +
          lines
            .map(
              ({ e, i }) =>
                `<tr id="e${i}" class="${e.informational ? "info" : e.pass ? "" : "failrow"}"><td><code>${esc(e.id)}</code></td><td>${esc(e.project)}</td>` +
                `<td>${e.informational ? (e.pass ? "note met" : "note not met") : e.pass ? "PASS" : "FAIL"}</td><td>${esc(e.description)}</td>` +
                `<td><pre>${esc(clip(json(e.expected), 500))}</pre></td><td><pre>${esc(clip(json(e.actual), 500))}</pre></td></tr>`,
            )
            .join("") +
          `</table>`,
      )
      .join("");
    return this.section("checks", "Every check", body, "Grouped by spec, in the order they were written. Values over 500 characters are clipped here; report.md and evidence.jsonl hold them whole.");
  }

  render(): string {
    const statuses = findingStatuses(this.a);
    const top = [this.findings(statuses), this.summary(), this.failed(statuses), this.mutation(), this.notes()];
    const galleries = [this.shareCards(), this.dashboard(), this.recap(), this.story(), this.profile(), this.states(), this.consent(), this.accountSwitch()];
    const tail = [this.other(), this.skipped(), this.checks()];
    const nav = [
      ["findings", "Findings"], ["summary", "Counts"], ["failed", "Failed"], ["mutation", "I1 mutation"], ["notes", "Notes"],
      ["cards", "Share cards"], ["dashboard", "Banner"], ["recap", "Recap"], ["story", "Story"], ["profile", "Profile"],
      ["states", "States"], ["consent", "Consent & rename"], ["switch", "Account switch"], ["skipped", "Skipped"], ["checks", "Every check"],
    ]
      .map(([id, label]) => `<a href="#${id}">${label}</a>`)
      .join("");
    const env = this.a.env;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Series Finale e2e</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><h1>Series Finale e2e</h1>
<p class="muted">git <code>${esc(env.gitSha.slice(0, 12))}</code>${env.gitDirty ? " (uncommitted changes)" : ""} · Playwright ${esc(env.playwright)} · Chromium ${esc(env.chromium)} · ${esc(env.dbImage)} · generated ${esc(env.generatedAt)}</p>
<nav>${nav}</nav></header>
<main>
${top.join("\n")}
${galleries.join("\n")}
${tail.join("\n")}
</main>
</body>
</html>
`;
  }
}

const CSS = `
:root{color-scheme:dark;--bg:#0d0f14;--panel:#161a22;--line:#2a303c;--text:#e6e8ee;--muted:#8a93a6;--good:#4ec27f;--bad:#ff6b6b;--warn:#e7b54a;--accent:#7aa2ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header.top{background:var(--bg);border-bottom:1px solid var(--line);padding:10px 20px}
header.top h1{margin:0;font-size:18px}
nav{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px}
nav a,a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
main{padding:0 20px 60px;max-width:1800px;margin:0 auto}
section{border-bottom:1px solid var(--line);padding:18px 0}
h2{font-size:20px;margin:0 0 8px}
h3{font-size:15px;margin:18px 0 8px}
.intro,.muted{color:var(--muted)}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
pre.diff{background:var(--panel);border:1px solid var(--line);padding:8px;margin:8px 0}
table{border-collapse:collapse;margin:6px 0 12px}
th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
th{background:var(--panel);font-weight:600}
table.wide{width:100%}
tr.failrow td{background:rgba(255,107,107,.08)}
tr.info td{color:#b9c0cf}
tr:target td{outline:2px solid var(--accent)}
.good{color:var(--good)}.bad{color:var(--bad)}
.finding{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--muted);border-radius:6px;padding:10px 14px;margin:10px 0}
.finding.shown{border-left-color:var(--bad)}
.finding h3{margin:0 0 6px}
.finding p{margin:4px 0}
.fid{display:inline-block;background:var(--bad);color:#000;border-radius:4px;padding:0 6px;margin-right:4px}
.finding.quiet .fid{background:var(--muted)}
.state{color:var(--muted);font-weight:400;font-size:13px}
.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.thumbs img{display:block;height:200px;width:200px;border:1px solid var(--line);border-radius:4px;object-fit:cover;object-position:top}
ul.notes li{margin:6px 0}
.chips{display:inline-flex;flex-wrap:wrap;gap:4px}
.chip{display:inline-block;border-radius:10px;padding:0 7px;font:11px/18px ui-monospace,monospace;border:1px solid var(--line)}
.chip.pass{color:var(--good);border-color:rgba(78,194,127,.4)}
.chip.fail{color:#000;background:var(--bad);border-color:var(--bad)}
.chip.note{color:var(--muted)}
.chip.note.unmet{color:var(--warn);border-color:rgba(231,181,74,.5)}
.grid{margin:6px 0 16px}
.cells{display:grid;gap:12px;align-items:start}
.cells.head{position:sticky;top:0;z-index:1;background:var(--bg);padding:4px 0}
.colhead{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.rowlabel{margin:12px 0 4px;font-weight:600}
figure.shot{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden;min-width:0}
figure.shot .frame{display:block;max-height:720px;overflow:auto;background:#000}
figure.shot img{display:block;width:100%;height:auto}
figcaption{padding:6px 8px;display:flex;flex-direction:column;gap:4px}
.shot.missing{min-height:80px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;color:var(--muted);font-size:12px;padding:8px;text-align:center}
.cardrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
details summary{cursor:pointer;color:var(--accent);margin:6px 0}
@media (max-width:900px){.cells{grid-template-columns:1fr !important}.cells.head{display:none}main{padding:0 12px 40px}}
`;

export function renderHtml(a: Artifacts): string {
  return new Page(a).render();
}

// ---------------------------------------------------------------------------
// report.md
// ---------------------------------------------------------------------------

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function codeCell(value: unknown, max = 400): string {
  const text = clip(json(value), max);
  return text.includes("`") ? cell(text) : `\`${cell(text)}\``;
}

function castTable(oracle: Oracle): string {
  const personas = new Map(PERSONAS.map((p) => [p.username, p]));
  const lines = [
    "| persona | zone | signs in | years (thin marked) | 2025 episodes | 2025 hours | 2025 titles completed | 2025 top show | 2025 crew |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [username, years] of Object.entries(oracle)) {
    const p = personas.get(username);
    const avail = Object.entries(years)
      .filter(([, y]) => y.available)
      .map(([year, y]) => (y.thin ? `${year} (thin)` : year))
      .join(", ");
    const y25: OracleYear | undefined = years["2025"];
    lines.push(
      `| ${cell(username)} | ${p?.timezone ?? "?"} | ${p?.signsIn ? "yes" : "no"} | ${avail || "none"} | ${y25?.episodes ?? "-"} | ${y25?.hours ?? "-"} | ` +
        `${y25?.titlesCompleted ?? "-"} | ${cell(y25?.topShow ?? "-")} | ${y25 && y25.crew.length ? `${y25.crew.length} (cap left out ${y25.crewCappedOut.join(", ") || "nobody"})` : "-"} |`,
    );
  }
  return lines.join("\n");
}

export function renderMarkdown(a: Artifacts): string {
  const statuses = findingStatuses(a);
  const out: string[] = [];
  const env = a.env;
  out.push("# Series Finale e2e report", "");
  out.push(`Generated ${env.generatedAt} from \`e2e/series-finale/artifacts/\`. The gallery is \`artifacts/index.html\`.`, "");
  out.push("## Outcome", "", overallLine(a, statuses), "");

  out.push("## Environment", "");
  out.push(
    `- git: \`${env.gitSha}\`${env.gitDirty ? " (working tree had uncommitted changes)" : ""}`,
    `- Playwright: ${env.playwright}`,
    `- Chromium: ${env.chromium}`,
    `- WebKit: ${env.webkit} -- cached, but cannot launch on this host (missing system libraries)`,
    `- Database: ${env.dbImage} (podman, 127.0.0.1:5433, ephemeral)`,
    `- Node: ${env.node}`,
    "",
  );

  out.push("## Results per Playwright invocation", "");
  out.push("| invocation | started | passed | failed | skipped | flaky | duration | outcome |", "|---|---|---|---|---|---|---|---|");
  for (const i of a.invocations) {
    if (!i.found) {
      out.push(`| ${i.name} | - | - | - | - | - | - | no results file |`);
      continue;
    }
    const c = countTests(i.tests);
    out.push(`| ${i.name} | ${i.startTime ?? "?"} | ${c.passed} | ${c.failed} | ${c.skipped} | ${c.flaky} | ${seconds(i.durationMs)} | ${c.failed || i.errors.length ? "failed" : "passed"} |`);
  }
  out.push("", "## Results per project", "");
  out.push("| project | tests passed | tests failed | skipped | checks pass | checks fail | notes met | notes not met |", "|---|---|---|---|---|---|---|---|");
  for (const p of projectCounts(a.invocations, a.evidence)) {
    out.push(`| ${p.project} | ${p.passed} | ${p.failed} | ${p.skipped} | ${p.checksPass} | ${p.checksFail} | ${p.notesMet} | ${p.notesNotMet} |`);
  }

  out.push("", "## Findings", "");
  const shotsFor = (indexes: number[]) => {
    const cardAt = cardLookup(a.evidence);
    return a.shots.filter((s) => relatedChecks(s, a.evidence, cardAt).some((i) => indexes.includes(i))).map((s) => `\`${s.src}\``);
  };
  for (const s of statuses) {
    const shown = s.showing.length > 0;
    const idx = shown ? s.showing : s.covered;
    const state = s.covered.length === 0 ? "no evidence this run" : shown ? (s.def.kind === "check" ? `reproduced: ${s.showing.length} failing check(s)` : "reproduced (note not met)") : "not reproduced this run";
    out.push(`### ${s.def.id}: ${s.def.title}`, "");
    out.push(`- **Status:** ${state} (${s.def.kind === "check" ? "failing check" : "informational note"})`);
    out.push(`- **Where:** \`${s.def.where}\``);
    out.push(`- **Diagnosis:** ${s.def.diagnosis}`);
    if (s.extra) out.push(`- **This run:** ${s.extra}`);
    const ev = idx.map((i) => {
      const e = a.evidence[i]!;
      return `\`${e.id}\` (${e.project}: expected ${clip(json(e.expected), 120)}, actual ${clip(json(e.actual), 160)})`;
    });
    out.push(`- **Evidence:** ${ev.join("; ") || "none"}`);
    out.push(`- **Screenshots:** ${shotsFor(idx).join(", ") || "none"}`, "");
  }
  out.push("### Notes", "");
  for (const n of NOTES) {
    const ev = n.ids.flatMap((id) => a.evidence.filter((e) => e.id === id).map((e) => `\`${e.id}\` ${e.project}: ${clip(json(e.actual), 160)}`));
    out.push(`- **${n.title}.** ${n.text}${ev.length ? ` Evidence: ${ev.join("; ")}.` : ""}`);
  }
  const explained = new Set(statuses.flatMap((s) => s.showing));
  const unclassified = a.evidence.filter((e, i) => !e.informational && !e.pass && !explained.has(i));
  if (unclassified.length) {
    out.push("", "### Unclassified failing checks", "");
    for (const e of unclassified) out.push(`- \`${e.id}\` (${e.project}, ${specOf(e)}): expected ${json(e.expected)}, actual ${json(e.actual)}`);
  }

  out.push("", "## Mutation check (I1)", "");
  const v = mutationVerdict(a.mutation);
  if (!a.mutation || !v.ran) {
    out.push("Not run: `artifacts/mutation-i1/` holds no evidence.");
  } else {
    const m = a.mutation;
    const c = countTests(m.invocation.tests);
    out.push(
      `Ruling E9: a scratch git worktree at \`${m.meta.baseCommit ?? "?"}\` with one change -- ${m.meta.mutation ?? "?"} -- built and served on 3100 against a freshly reset and reseeded e2e database (same \`buildE2eEnv()\`), running only \`90-account-switch.e2e.ts\` in \`desktop-mutating\`. The worktree was removed afterwards.`,
      "",
      `**${v.caught ? "Caught" : "NOT caught"}.** Tests: ${c.passed} passed, ${c.failed} failed (Playwright exit ${m.meta.playwrightExit ?? "?"}). ` +
        (v.caught
          ? `The regression-sensitive checks failed as expected: ${v.failed.filter((e) => I1_SENSITIVE.includes(e.id)).map((e) => `\`${e.id}\``).join(", ")}.`
          : `None of ${I1_SENSITIVE.map((id) => `\`${id}\``).join(", ")} failed.`),
      "",
    );
    if (m.meta.diff) out.push("The mutation:", "", "```diff", m.meta.diff.trimEnd(), "```", "");
    out.push("Failing checks in the mutant run:", "");
    out.push("| check | expected | actual |", "|---|---|---|");
    for (const e of v.failed) out.push(`| \`${e.id}\` | ${codeCell(e.expected, 200)} | ${codeCell(e.actual, 300)} |`);
    const counts = m.evidence.find((e) => e.id === "switch-observer-counts");
    if (counts) out.push("", `Observer counts in the mutant: ${codeCell(counts.actual)}.`);
    const passed = m.evidence.filter((e) => !e.informational && e.pass).map((e) => `\`${e.id}\``);
    out.push(
      "",
      `Checks that still passed in the mutant (preconditions, ava-side checks and bat-side checks that cannot see a stale payload): ${passed.join(", ") || "none"}. ` +
        "The card byte checks (`switch-bat-card-*`) cannot catch it by construction -- the card query key already includes the username -- " +
        "and the hero reads the signed-in viewer's name, not the cached payload's.",
      "",
      "Evidence: `artifacts/mutation-i1/` (evidence.jsonl, results.json, meta.json, screenshots/, cards/, test-output/ with the trace, playwright-report/).",
    );
  }

  out.push("", "## Seeded cast", "");
  if (a.oracle) out.push(castTable(a.oracle));
  else out.push("oracle.json is missing.");
  out.push("", "## ava's 2025 oracle block", "");
  out.push("```json", JSON.stringify(a.oracle?.e2e_ava?.["2025"] ?? null, null, 2), "```", "");

  out.push("## Timing evidence", "");
  const timings = a.evidence.filter((e) => e.id === "gen-time");
  for (const e of timings) out.push(`- \`${e.id}\` (${e.project}): ${json(e.actual)} against ${json(e.expected)} -- caches were pre-warmed by the seeder, so this is not representative of production.`);
  out.push("", "Wall time per spec file (all projects of an invocation together):", "", "| invocation | spec | tests | total |", "|---|---|---|---|");
  for (const i of a.invocations) {
    for (const [file, tests] of groupBy(i.tests, (t) => t.file)) {
      out.push(`| ${i.name} | ${file} | ${tests.length} | ${seconds(tests.reduce((sum, t) => sum + t.durationMs, 0))} |`);
    }
  }

  out.push("", "## Skipped tests", "");
  out.push("| reason | tests | where |", "|---|---|---|");
  for (const [reason, tests] of skipReasons(a.invocations)) {
    out.push(`| ${cell(reason)} | ${tests.length} | ${cell([...new Set(tests.map((t) => `${t.project}: ${t.file}`))].join("; "))} |`);
  }

  out.push("", "## Failed tests", "");
  const failedTests = a.invocations.flatMap((i) => i.tests).filter((t) => t.status === "unexpected");
  if (failedTests.length === 0) out.push("None.");
  for (const t of failedTests) out.push(`- ${t.file} › ${t.title} [${t.project}]: ${cell(clip(t.errors[0]?.split("\n")[0] ?? "", 300))}`);

  out.push("", "## Notes (informational evidence)", "");
  out.push("| note | project | met | actual |", "|---|---|---|---|");
  for (const e of a.evidence.filter((x) => x.informational)) out.push(`| \`${e.id}\` | ${e.project} | ${e.pass ? "yes" : "no"} | ${codeCell(e.actual, 300)} |`);

  out.push("", "## Every check", "");
  out.push("Values longer than 400 characters are clipped; `evidence.jsonl` holds them whole.", "");
  for (const [spec, lines] of [...groupBy(a.evidence, specOf)].sort(([x], [y]) => x.localeCompare(y))) {
    out.push(`### ${spec}`, "", "| check | project | expected | actual | result |", "|---|---|---|---|---|");
    for (const e of lines) {
      const result = e.informational ? (e.pass ? "note (met)" : "note (not met)") : e.pass ? "PASS" : "**FAIL**";
      out.push(`| \`${e.id}\` | ${e.project} | ${codeCell(e.expected)} | ${codeCell(e.actual)} | ${result} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

/** Writes artifacts/index.html and artifacts/report.md; returns their paths. */
export function writeGallery(artifactsDir: string): { html: string; markdown: string } {
  const artifacts = loadArtifacts(artifactsDir);
  const html = join(artifactsDir, "index.html");
  const markdown = join(artifactsDir, "report.md");
  writeFileSync(html, renderHtml(artifacts));
  writeFileSync(markdown, renderMarkdown(artifacts));
  return { html, markdown };
}
