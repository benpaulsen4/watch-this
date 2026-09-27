// Every assertion that belongs in the report goes through check(): it is a
// soft assertion (the test carries on and fails at the end) and one line in
// artifacts/evidence.jsonl, pass or fail, for the gallery to read.
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { expect, test } from "@playwright/test";

import { ARTIFACTS_DIR } from "../env/test-env";

export const EVIDENCE_PATH = join(ARTIFACTS_DIR, "evidence.jsonl");

export interface Evidence {
  id: string;
  project: string;
  description: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  /** Set by note(): recorded for the report, never fails the test. */
  informational?: true;
  /** The spec file that wrote the line (e.g. `40-recap.e2e.ts`), so the report can group by spec. */
  spec?: string;
}

export function check(id: string, description: string, expected: unknown, actual: unknown): void {
  const info = test.info();
  // pass is whatever expect.soft decided: a failed soft assertion adds an error.
  const errorsBefore = info.errors.length;
  expect.soft(actual, `${id}: ${description}`).toEqual(expected);
  const pass = info.errors.length === errorsBefore;

  const line: Evidence = { id, project: info.project.name, description, expected, actual, pass, spec: basename(info.file) };
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  appendFileSync(EVIDENCE_PATH, `${JSON.stringify(line)}\n`);
}

/**
 * An evidence line that is informational only -- timings and the like, where
 * the brief wants the number in the report but a slow run is not a failure.
 * `pass` says whether it met `expected`; the test is not failed either way.
 */
export function note(id: string, description: string, expected: unknown, actual: unknown, pass: boolean): void {
  const info = test.info();
  info.annotations.push({ type: "note", description: `${id}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})` });

  const line: Evidence = {
    id,
    project: info.project.name,
    description,
    expected,
    actual,
    pass,
    informational: true,
    spec: basename(info.file),
  };
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  appendFileSync(EVIDENCE_PATH, `${JSON.stringify(line)}\n`);
}
