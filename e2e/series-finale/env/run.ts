#!/usr/bin/env tsx
// Single entry point for every e2e subcommand. Every subcommand builds the
// explicit e2e env and asserts the database URL before doing anything, so a
// stray invocation can never fall back to .env.local's real DATABASE_URL.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findSecretLeaks } from "./scan-secrets";
import { ARTIFACTS_DIR, assertE2eDatabaseUrl, buildE2eEnv, E2E_BASE_URL, E2E_DIR, E2E_PORT } from "./test-env";

const SUBCOMMANDS = [
  "migrate",
  "build",
  "start",
  "dbcheck",
  "register",
  "seed",
  "oracle",
  "test",
  "scan-secrets",
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

/**
 * Empties artifacts/evidence.jsonl, which `check()` only ever appends to, so a
 * run's evidence never mixes with an earlier run's.
 */
function resetEvidence(): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(join(ARTIFACTS_DIR, "evidence.jsonl"), "");
}

/**
 * `next start` as a child in its own process group, so stopping it stops the
 * server npx spawned rather than just npx.
 */
function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn("npx", ["next", "start", "-p", String(E2E_PORT)], { stdio: "inherit", env, detached: true });
}

function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null || server.pid === undefined) return Promise.resolve();
  const pid = server.pid;
  return new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // already gone
      }
    }, 10_000);
    server.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      clearTimeout(forceKill);
      resolve();
    }
  });
}

/** The HTTP status on `/auth`, or null when nothing answers on the port. */
async function probeApp(): Promise<number | null> {
  try {
    return (await fetch(`${E2E_BASE_URL}/auth`)).status;
  } catch {
    return null;
  }
}

/** Resolves once the app answers; rejects if the server exits or 120 s pass first. */
async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error("the app server exited before answering");
    }
    if ((await probeApp()) === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`the app did not answer on ${E2E_BASE_URL} within 120 s`);
}

/**
 * The whole run: a fresh database, the build, the server, the cast, the
 * oracle, the specs. Leaves the database up for inspection and stops the
 * server it started, whatever happens.
 */
async function runAll(env: NodeJS.ProcessEnv): Promise<void> {
  // Anything already on the port would answer for ours -- a server built or
  // started with some other env -- so refuse rather than test whatever it is.
  if ((await probeApp()) !== null) {
    throw new Error(`something is already serving ${E2E_BASE_URL}; stop it before e2e:all`);
  }
  resetEvidence();
  await run("bash", [join(E2E_DIR, "env", "db.sh"), "reset"], env);
  await run("npx", ["drizzle-kit", "migrate"], env);
  await run("npx", ["next", "build"], env);

  const server = startServer(env);
  const stop = () => {
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  };
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(143);
  });
  try {
    await waitForServer(server);
    await run("npx", ["tsx", "e2e/series-finale/env/register.ts"], env);
    await run("npx", ["tsx", "e2e/series-finale/seed/seed.ts"], env);
    await run("npx", ["tsx", "e2e/series-finale/seed/oracle.ts"], env);
    // Playwright's webServer reuses the server already on the port.
    let failure: unknown = null;
    try {
      await run("npx", ["playwright", "test"], env);
    } catch (error) {
      failure = error;
    } finally {
      scanSecrets(env);
    }
    console.log("e2e all: gallery skipped -- not implemented yet (Task 9)");
    if (failure) throw failure;
  } finally {
    await stopServer(server);
    console.log("e2e all: the app server is stopped; the e2e database is still up for inspection (npm run e2e:db:down removes it)");
  }
}

/**
 * Fails (naming files only) if any artifact holds a secret this run was given.
 * Runs after every `test`, and on its own as `npm run e2e:scan-secrets`.
 */
function scanSecrets(env: NodeJS.ProcessEnv): void {
  const leaks = findSecretLeaks(ARTIFACTS_DIR, [
    { name: "TMDB_API_KEY", value: env.TMDB_API_KEY },
    { name: "WEBAUTHN_SECRET", value: env.WEBAUTHN_SECRET },
  ]);
  if (leaks.length > 0) {
    throw new Error(`Secrets found in e2e artifacts -- delete these files:\n  ${leaks.join("\n  ")}`);
  }
  console.log("e2e scan-secrets: no secrets in artifacts/");
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
      // Extra argv goes to Playwright (e.g. `-- --project=desktop <spec>`);
      // the secret scan runs whether or not the tests passed.
      resetEvidence();
      try {
        await run("npx", ["playwright", "test", ...process.argv.slice(3)], env);
      } finally {
        scanSecrets(env);
      }
      return;
    case "scan-secrets":
      return scanSecrets(env);
    case "dbcheck":
      // A real DB round trip through the app's own src/lib/db, under the
      // exact env (NODE_ENV=production) a real request would use -- proves
      // E2E_DATABASE_URL actually connects (see E4), not just that
      // assertE2eDatabaseUrl's string check passes.
      return run("npx", ["tsx", "e2e/series-finale/env/dbcheck.ts"], env);
    case "register":
      // Every signing-in persona, unless usernames are given on argv.
      return run("npx", ["tsx", "e2e/series-finale/env/register.ts", ...process.argv.slice(3)], env);
    case "seed":
      // `-- --resolve-only` resolves catalogue.lock.json and stops.
      return run("npx", ["tsx", "e2e/series-finale/seed/seed.ts", ...process.argv.slice(3)], env);
    case "oracle":
      return run("npx", ["tsx", "e2e/series-finale/seed/oracle.ts"], env);
    case "all":
      return runAll(env);
    case "gallery":
      throw new Error(`e2e ${subcommand}: not implemented yet`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
