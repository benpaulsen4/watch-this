// Read-side access to artifacts/oracle.json (written by `pnpm e2e:oracle`):
// what each persona's recap must show, computed from plain SQL.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTIFACTS_DIR } from "../env/test-env";
import type { Oracle, OracleYear } from "../seed/oracle";

let cached: Oracle | undefined;

function loadOracle(): Oracle {
  cached ??= JSON.parse(readFileSync(join(ARTIFACTS_DIR, "oracle.json"), "utf8")) as Oracle;
  return cached;
}

/** The oracle's view of `username`'s `year`; throws if the oracle has no such entry. */
export function oracleYear(username: string, year: string): OracleYear {
  const entry = loadOracle()[username]?.[year];
  if (!entry) throw new Error(`oracle.json has no ${year} entry for ${username}; run pnpm e2e:oracle`);
  return entry;
}

/** The years the oracle says are available to `username`, newest first. */
export function oracleAvailableYears(username: string): string[] {
  const years = loadOracle()[username];
  if (!years) throw new Error(`oracle.json has no entry for ${username}; run pnpm e2e:oracle`);
  return Object.keys(years)
    .filter((year) => years[year]?.available)
    .sort()
    .reverse();
}
