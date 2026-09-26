// Proves a real DB round trip works under the exact config the app uses in
// production (E4): this must be run with buildE2eEnv() as its process env
// (NODE_ENV=production, DATABASE_URL=E2E_DATABASE_URL) so it exercises the
// same `ssl: "require"`-unless-the-URL-says-otherwise logic in
// src/lib/db/index.ts that a real request would. Run via `npm run
// e2e:dbcheck`, which spawns this as its own tsx child through run.ts --
// never import this file into a process that already has some other
// DATABASE_URL loaded.
import { sql } from "drizzle-orm";

import { db } from "../../../src/lib/db";

async function main(): Promise<void> {
  await db.execute(sql`select 1`);
  console.log("ok");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
