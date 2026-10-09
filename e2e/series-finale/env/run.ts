#!/usr/bin/env tsx
// Single entry point for every e2e subcommand. Every subcommand builds the
// explicit e2e env and asserts the database URL before doing anything, so a
// stray invocation can never fall back to .env.local's real DATABASE_URL.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeGallery } from "../report/gallery";
import { findSecretLeaks } from "./scan-secrets";
import { assertE2eServer, assertNoForeignServer } from "./server-guard";
import { ARTIFACTS_DIR, assertE2eDatabaseUrl, assertSuiteInDate, buildE2eEnv, E2E_BASE_URL, E2E_DIR, E2E_PORT } from "./test-env";

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
 * Removes the previous run's screenshots, share cards, gallery and report, so
 * everything the new gallery shows was produced by this run. (`e2e:test` keeps
 * them: a filtered run only replaces the files it writes.) artifacts/mutation-i1/,
 * the one-off I1 mutation check's evidence (ruling E9), is kept.
 */
function resetRunOutput(): void {
  for (const name of ["screenshots", "cards", "index.html", "report.md"]) {
    rmSync(join(ARTIFACTS_DIR, name), { recursive: true, force: true });
  }
}

/** Writes artifacts/index.html and artifacts/report.md from whatever artifacts/ holds. */
function gallery(): void {
  const { html, markdown } = writeGallery(ARTIFACTS_DIR);
  console.log(`e2e gallery: ${html}\ne2e gallery: ${markdown}`);
}

/**
 * `next start` as a child in its own process group, so stopping it stops the
 * server pnpm spawned rather than just pnpm. From here until it exits, a SIGINT
 * or SIGTERM to this process stops the server first -- with `stopServer`'s
 * escalation -- and only then exits; a repeated signal while it stops is
 * absorbed rather than killing this process before the server is gone. On any
 * other exit it is SIGKILLed synchronously, so no path leaves it behind.
 */
function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  const server = spawn("pnpm", ["exec", "next", "start", "-p", String(E2E_PORT)], { stdio: "inherit", env, detached: true });
  let stopping = false;
  const onSignal = (code: number) => () => {
    if (stopping) return;
    stopping = true;
    void stopServer(server).finally(() => process.exit(code));
  };
  const onInterrupt = onSignal(130);
  const onTerminate = onSignal(143);
  const onExit = () => {
    if (server.pid !== undefined && server.exitCode === null && server.signalCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  process.on("exit", onExit);
  server.once("exit", () => {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    process.off("exit", onExit);
  });
  return server;
}

/** Runs the server until it exits (or this process is signalled, see `startServer`). */
function serve(env: NodeJS.ProcessEnv): Promise<void> {
  const server = startServer(env);
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`next start exited with ${signal ?? `code ${code}`}`));
    });
  });
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
  resetRunOutput();
  await run("bash", [join(E2E_DIR, "env", "db.sh"), "reset"], env);
  await run("pnpm", ["exec", "drizzle-kit", "migrate"], env);
  await run("pnpm", ["exec", "next", "build"], env);

  const server = startServer(env);
  try {
    await waitForServer(server);
    assertE2eServer();
    await run("pnpm", ["exec", "tsx", "e2e/series-finale/env/register.ts"], env);
    await run("pnpm", ["exec", "tsx", "e2e/series-finale/seed/seed.ts"], env);
    await run("pnpm", ["exec", "tsx", "e2e/series-finale/seed/oracle.ts"], env);
    // Playwright's webServer reuses the server already on the port.
    let failure: unknown = null;
    try {
      await runPlaywright(env, []);
    } catch (error) {
      failure = error;
      // Said now, so a secret-scan failure below cannot hide it.
      console.error(`e2e all: ${error instanceof Error ? error.message : String(error)}`);
    }
    // The gallery reports the failures above, so it is built either way, and
    // before the secret scan so the scan covers index.html and report.md too.
    try {
      gallery();
    } catch (error) {
      console.error(`e2e all: gallery failed -- ${error instanceof Error ? error.message : String(error)}`);
      failure ??= error;
    }
    scanSecrets(env);
    if (failure) throw failure;
  } finally {
    await stopServer(server);
    console.log("e2e all: the app server is stopped; the e2e database is still up for inspection (pnpm e2e:db:down removes it)");
  }
}

/** Every project but desktop-mutating, in playwright.config.ts's order. */
const READ_ONLY_PROJECTS = ["desktop", "phone", "small-phone", "webkit-phone"];

/**
 * The specs, in two Playwright invocations (E8): the read-only projects, then
 * desktop-mutating on its own -- run whatever the first one's result, so an
 * app finding in a read-only project cannot stop the mutating specs (as a
 * project `dependencies` entry would). Each invocation writes its own
 * results-<name>.json, playwright-report-<name>/ and test-output-<name>/
 * (E2E_REPORT_RUN, read by playwright.config.ts). Throws after both if either
 * failed. `args` (spec paths, --grep, ...) go to both, with
 * --pass-with-no-tests so a filter matching only one side is not a failure;
 * args that pick projects themselves run as one plain invocation instead.
 */
async function runPlaywright(env: NodeJS.ProcessEnv, args: string[]): Promise<void> {
  if (args.some((arg) => arg === "--project" || arg.startsWith("--project="))) {
    await run("pnpm", ["exec", "playwright", "test", ...args], env);
    return;
  }

  const invocations = [
    { name: "readonly", projects: READ_ONLY_PROJECTS },
    { name: "mutating", projects: ["desktop-mutating"] },
  ];
  const failures: string[] = [];
  for (const { name, projects } of invocations) {
    try {
      const projectArgs = projects.map((project) => `--project=${project}`);
      await run("pnpm", ["exec", "playwright", "test", ...projectArgs, "--pass-with-no-tests", ...args], { ...env, E2E_REPORT_RUN: name });
      console.log(`e2e playwright (${name}): passed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${message}`);
      console.error(`e2e playwright (${name}): failed -- ${message}`);
    }
  }
  if (failures.length > 0) throw new Error(`playwright failed -- ${failures.join("; ")}`);
}

/**
 * Fails (naming files only) if any artifact holds a secret this run was given.
 * Runs after every `test`, and on its own as `pnpm e2e:scan-secrets`.
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

  // pnpm forwards a literal `--` to the script, so an npm-style
  // `pnpm e2e:test -- --project=desktop` would hand Playwright `--` and turn
  // every flag after it into a test filter. Drop it; nothing here takes one.
  const extra = process.argv[3] === "--" ? process.argv.slice(4) : process.argv.slice(3);

  const env = buildE2eEnv();
  assertE2eDatabaseUrl(env.DATABASE_URL!);
  // Rebuilding the report or scanning artifacts is fine at any date; anything
  // that seeds, serves or tests is not once the cast's year is over (I6).
  if (subcommand !== "gallery" && subcommand !== "scan-secrets") assertSuiteInDate();

  switch (subcommand) {
    case "migrate":
      return run("pnpm", ["exec", "drizzle-kit", "migrate"], env);
    case "build":
      return run("pnpm", ["exec", "next", "build"], env);
    case "start":
      return serve(env);
    case "test":
      // Extra argv goes to Playwright (e.g. `--project=desktop <spec>`);
      // the secret scan runs whether or not the tests passed.
      // A server already on the port is reused by Playwright, so it must be
      // the e2e one (global-setup.ts checks again, for direct invocations).
      assertNoForeignServer();
      resetEvidence();
      try {
        await runPlaywright(env, extra);
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
      return run("pnpm", ["exec", "tsx", "e2e/series-finale/env/dbcheck.ts"], env);
    case "register":
      // Every signing-in persona, unless usernames are given on argv.
      return run("pnpm", ["exec", "tsx", "e2e/series-finale/env/register.ts", ...extra], env);
    case "seed":
      // `--resolve-only` resolves catalogue.lock.json and stops.
      return run("pnpm", ["exec", "tsx", "e2e/series-finale/seed/seed.ts", ...extra], env);
    case "oracle":
      return run("pnpm", ["exec", "tsx", "e2e/series-finale/seed/oracle.ts"], env);
    case "all":
      return runAll(env);
    case "gallery":
      gallery();
      return scanSecrets(env);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
