// Reading what a run left in artifacts/ (evidence.jsonl, the Playwright JSON
// results per invocation, oracle.json, screenshots/, cards/, mutation-i1/),
// and which checks each screenshot illustrates.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Oracle } from "../seed/oracle";
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

/**
 * Parses `text` as JSON, or throws an error naming the file (and line) and
 * what to do -- a run cut short can leave a truncated results file, and
 * `npm run e2e:gallery` is run by hand.
 */
function parseJson<T>(text: string, where: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${where} is not valid JSON (${reason}); a run cut short can leave it truncated -- re-run the specs, or delete the file`);
  }
}

export function readEvidence(path: string): Evidence[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, index }) => parseJson<Evidence>(line, `${path}:${index + 1}`));
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

export function readJson<T>(path: string): T | null {
  return existsSync(path) ? parseJson<T>(readFileSync(path, "utf8"), path) : null;
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
  tiles: [/^recap-tile-/, /^recap-zone-edges-discriminate$/],
  "top-show": [/^recap-top-show-/, /^recap-also-top-for$/],
  niche: [/^recap-niche-/],
  shame: [/^recap-shame-/],
  months: [/^recap-months-/],
  rhythm: [/^recap-rhythm-/],
  "big-day": [/^recap-big-day/],
  crew: [/^recap-crew-/, /^crew-cap-rule$/],
  compare: [/^recap-compare-/, /^F5-compare-labels-whole-recap-/],
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
  months: [/^story-reach-months$/, /^story-small-months-/],
  bigDay: [/^story-reach-bigDay$/, /^story-big-day-/, /^story-small-bigDay-/],
  compare: [/^story-compare-/, /^story-small-compare-/, /^F5-compare-labels-whole-story-/],
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
  [/^(recap|story)\/ava-2025-compare\/([\w-]+)$/, (m) => [re(`^F5-compare-labels-whole-${m[1]}-${m[2]}$`)]],
  [/^story\/cy-2025-gate\//, () => [/^gate-phone-/, /^gate-cy-/]],
  [/^recap\/cy-2025-gate-desktop$/, () => [/^gate-desktop-/]],
  [/^story\/cy-2025-completion\//, () => [/^completion-(precondition|starts|summary|posted|stored|recap-link)/]],
  [/^recap\/cy-2025-after-completion$/, () => [/^completion-(link-opens|recap-route|no-second|close)/]],
  [/^recap\/([a-z]+)-(\d{4})\/full$/, (m) => [
    re(`^visual-${m[1]}-${m[2]}-`),
    ...(m[1] === "ava" && m[2] === "2025" ? [/^recap-ava-rendered$/, /^recap-header-/] : []),
  ]],
  [/^recap\/([a-z]+)-(\d{4})\/thin-card$/, (m) => [re(`^visual-${m[1]}-${m[2]}-thin$`), re(`^gating-${m[1]}-${m[2]}-`)]],
  [/^recap\/([a-z]+)-(\d{4})\/([\w-]+)$/, (m) => [
    re(`^visual-${m[1]}-${m[2]}-sections$`),
    ...(m[3] === "big-day" ? [re(`^visual-${m[1]}-${m[2]}-clock-disclosure$`)] : []),
    ...(m[3] === "rhythm" ? [re(`^visual-${m[1]}-${m[2]}-late-share$`)] : []),
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
  [/^dashboard\/cy-banner(-card)?$/, () => [/^banner-cy-/]],
  [/^dashboard\/ava-after-dismiss$/, () => [/^dismiss-(?!failed)/]],
  [/^dashboard\/ava-after-recap-foot$/, () => [/^banner-recap-foot-/]],
  [/^dashboard\/ava-after-story$/, () => [/^banner-story-end-/]],
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
 * that names the shot itself (in its description or its actual value).
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
