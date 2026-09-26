// Every assertion that belongs in the report goes through check(): it is a
// soft assertion (the test carries on and fails at the end) and one line in
// artifacts/evidence.jsonl, pass or fail, for the gallery to read.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
}

export function check(id: string, description: string, expected: unknown, actual: unknown): void {
  const info = test.info();
  // pass is whatever expect.soft decided: a failed soft assertion adds an error.
  const errorsBefore = info.errors.length;
  expect.soft(actual, `${id}: ${description}`).toEqual(expected);
  const pass = info.errors.length === errorsBefore;

  const line: Evidence = { id, project: info.project.name, description, expected, actual, pass };
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  appendFileSync(EVIDENCE_PATH, `${JSON.stringify(line)}\n`);
}
