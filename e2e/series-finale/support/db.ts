// Small SQL helper for specs and scripts that need to peek at or tidy the e2e
// database. It goes through `db.sh psql`, i.e. `podman exec` into the
// throwaway container -- no DATABASE_URL is involved at all, so nothing here
// can ever reach .env.local's real database.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { E2E_DIR } from "../env/test-env";

const DB_SH = join(E2E_DIR, "env", "db.sh");

// The app's own username rule (src/app/api/auth/session/route.ts).
const USERNAME = /^[a-zA-Z0-9_-]{3,50}$/;

export function assertUsername(username: string): void {
  if (!USERNAME.test(username)) {
    throw new Error(`Not a valid username: ${JSON.stringify(username)}`);
  }
}

/**
 * Runs `sql` in the e2e database and returns psql's unaligned, tuples-only
 * output. `vars` become psql variables, referenced in the SQL as `:'name'`
 * (quoted literal), so values are never spliced into the SQL text. The SQL is
 * sent on stdin because psql does not interpolate variables in `-c`.
 */
export function psql(sql: string, vars: Record<string, string> = {}): string {
  const args = [DB_SH, "psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"];
  for (const [name, value] of Object.entries(vars)) {
    args.push("-v", `${name}=${value}`);
  }
  return execFileSync("bash", args, { input: sql, encoding: "utf8" }).trim();
}

export function userExists(username: string): boolean {
  assertUsername(username);
  return psql("select count(*) from users where username = :'u';", { u: username }) !== "0";
}

/** Deletes the user; every table referencing users cascades. */
export function deleteUser(username: string): void {
  assertUsername(username);
  psql("delete from users where username = :'u';", { u: username });
}
