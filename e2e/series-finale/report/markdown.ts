// artifacts/report.md: the run's results as text, plus the environment, the
// seeded cast, ava's oracle block, timings, skips and every check.
import type { Oracle, OracleYear } from "../seed/oracle";
import { PERSONAS } from "../seed/personas";
import { countTests, findingState, findingStatuses, I1_SENSITIVE, mutationVerdict, NOT_AUTOMATED, NOTES, overallLine, projectCounts, skipReasons } from "./findings";
import { clip, groupBy, json, resultLabel, seconds, specOf } from "./format";
import { type Artifacts, cardLookup, relatedChecks } from "./load";

/**
 * Text made safe for one Markdown table cell. Backslashes are escaped first:
 * otherwise a backslash already before a pipe would swallow that pipe's
 * escape and the pipe would split the cell.
 */
export function cell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
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
    const state = findingState(s);
    out.push(`### ${s.def.id}: ${s.def.title}`, "");
    out.push(`- **Status:** ${state} (${s.def.kind === "check" ? "checked" : "informational note"})`);
    out.push(`- **Where:** \`${s.def.where}\``);
    out.push(`- **Diagnosis:** ${s.def.diagnosis}`);
    out.push(`- **Fix:** ${s.def.fix}`);
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

  out.push("", "### Not automated", "");
  for (const n of NOT_AUTOMATED) out.push(`- **${n.title}.** ${n.text}`);
  const cardAt = cardLookup(a.evidence);
  const unlinked = a.shots.filter((shot) => relatedChecks(shot, a.evidence, cardAt).length === 0);
  out.push("", "### Screenshots no check links to", "");
  out.push(
    unlinked.length === 0
      ? "None: every screenshot links to at least one check or note."
      : `${unlinked.length} -- a renamed shot or check can drop its link (report/load.ts RULES): ${unlinked.map((s) => `\`${s.src}\``).join(", ")}`,
  );

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
  out.push("| note | project | result | actual |", "|---|---|---|---|");
  for (const e of a.evidence.filter((x) => x.informational)) out.push(`| \`${e.id}\` | ${e.project} | ${resultLabel(e)} | ${codeCell(e.actual, 300)} |`);

  out.push("", "## Every check", "");
  out.push("Values longer than 400 characters are clipped; `evidence.jsonl` holds them whole.", "");
  for (const [spec, lines] of [...groupBy(a.evidence, specOf)].sort(([x], [y]) => x.localeCompare(y))) {
    out.push(`### ${spec}`, "", "| check | project | expected | actual | result |", "|---|---|---|---|---|");
    for (const e of lines) {
      const result = !e.informational && !e.pass ? "**FAIL**" : resultLabel(e);
      out.push(`| \`${e.id}\` | ${e.project} | ${codeCell(e.expected)} | ${codeCell(e.actual)} | ${result} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

