#!/usr/bin/env tsx
// Single entry point for every e2e subcommand. Every subcommand builds the
// explicit e2e env and asserts the database URL before doing anything, so a
// stray invocation can never fall back to .env.local's real DATABASE_URL.
import { spawn } from "node:child_process";

import { assertE2eDatabaseUrl, buildE2eEnv, E2E_PORT } from "./test-env";

const SUBCOMMANDS = [
  "migrate",
  "build",
  "start",
  "dbcheck",
  "register",
  "seed",
  "oracle",
  "test",
  "gallery",
  "all",
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string | undefined): value is Subcommand {
  return !!value && (SUBCOMMANDS as readonly string[]).includes(value);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  if (!isSubcommand(subcommand)) {
    throw new Error(`usage: run.ts ${SUBCOMMANDS.join("|")}`);
  }

  const env = buildE2eEnv();
  assertE2eDatabaseUrl(env.DATABASE_URL!);

  switch (subcommand) {
    case "migrate":
      return run("npx", ["drizzle-kit", "migrate"], env);
    case "build":
      return run("npx", ["next", "build"], env);
    case "start":
      return run("npx", ["next", "start", "-p", String(E2E_PORT)], env);
    case "test":
      return run("npx", ["playwright", "test"], env);
    case "dbcheck":
      // A real DB round trip through the app's own src/lib/db, under the
      // exact env (NODE_ENV=production) a real request would use -- proves
      // E2E_DATABASE_URL actually connects (see E4), not just that
      // assertE2eDatabaseUrl's string check passes.
      return run("npx", ["tsx", "e2e/series-finale/env/dbcheck.ts"], env);
    case "register":
      // Usernames on argv until Task 3's PERSONAS list lands.
      return run("npx", ["tsx", "e2e/series-finale/env/register.ts", ...process.argv.slice(3)], env);
    case "seed":
    case "oracle":
    case "gallery":
    case "all":
      throw new Error(`e2e ${subcommand}: not implemented yet`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
