// artifacts/index.html: a dark, self-contained page for reviewing the run by
// eye. Findings first, then counts and failed checks, then every screenshot
// grouped by surface with its projects side by side. Images are referenced by
// relative path and the page has no scripts.
import type { Evidence } from "../support/evidence";
import { countTests, type FindingStatus, findingStatuses, I1_SENSITIVE, mutationVerdict, NOTES, overallLine, projectCounts, skipReasons } from "./findings";
import { clip, esc, groupBy, json, seconds, specOf } from "./format";
import { type Artifacts, type CardAt, cardLookup, type Invocation, relatedChecks, type Shot } from "./load";

/** Why a project has no shot: its tests' skip reason, when they were all skipped. */
function missingReason(invocations: Invocation[], project: string): string {
  const tests = invocations.flatMap((i) => i.tests).filter((t) => t.project === project);
  if (tests.length > 0 && tests.every((t) => t.status === "skipped")) {
    return `not run: ${tests.find((t) => t.skipReason)?.skipReason ?? "skipped"}`;
  }
  return "not captured";
}

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

  /**
   * Rows of shots under column headings. An empty cell says why: for project
   * columns, the project's skip reason (`missingReason`); pass `missing` where
   * the columns are not projects.
   */
  grid(
    columns: Column[],
    rows: { label: string; cells: (Shot | undefined)[] }[],
    missing: (column: Column) => string = (column) => missingReason(this.a.invocations, column.project),
  ): string {
    const template = columns.map((c) => `${c.weight}fr`).join(" ");
    const head = columns.map((c) => `<div class="colhead">${esc(c.label)}</div>`).join("");
    const body = rows
      .map(
        (row) =>
          `<div class="rowlabel">${esc(row.label)}</div><div class="cells" style="grid-template-columns:${template}">` +
          row.cells.map((cell, i) => this.figure(cell, missing(columns[i]!))).join("") +
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
      this.grid(columns, rows, () => "none"),
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
      this.grid(columns, rows, () => "none"),
      "ava signs out and bat signs in within one document (no page load). The right column is the one-off I1 mutation run, if it was kept.",
    );
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
