// Before anything signs in or registers through the app on E2E_PORT, the
// process listening there must be the e2e server: its environment's
// DATABASE_URL must be E2E_DATABASE_URL. A server started any other way (a
// plain `next start -p 3100`, which loads .env.local) would otherwise take the
// suite's registrations and mutations into whatever database it was given.
//
// Linux only, like the rest of the suite: the listener is found through
// /proc/net/tcp{,6} and /proc/<pid>/fd, and its environment read from
// /proc/<pid>/environ (the environment the process was started with). No
// value from that environment is ever printed -- only whether DATABASE_URL
// matched.
import { readdirSync, readFileSync, readlinkSync } from "node:fs";

import { E2E_DATABASE_URL, E2E_PORT } from "./test-env";

const LISTEN = "0A";

/** Socket inodes listening on `port`, from the text of /proc/net/tcp or /proc/net/tcp6. */
export function listeningInodes(procNetTcp: string, port: number): string[] {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  return procNetTcp
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length > 9 && fields[1]?.split(":")[1] === hexPort && fields[3] === LISTEN)
    .map((fields) => fields[9]!)
    .filter((inode) => inode !== "0");
}

/** The value of `name` in a NUL-separated /proc/<pid>/environ, or null when it is not set. */
export function environValue(environ: string, name: string): string | null {
  const prefix = `${name}=`;
  const entry = environ.split("\0").find((pair) => pair.startsWith(prefix));
  return entry === undefined ? null : entry.slice(prefix.length);
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Pids holding one of `inodes` open -- only processes this user may inspect. */
function pidsHolding(inodes: string[]): number[] {
  const wanted = new Set(inodes.map((inode) => `socket:[${inode}]`));
  const pids: number[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue; // another user's process, or gone
    }
    for (const fd of fds) {
      let target: string;
      try {
        target = readlinkSync(`/proc/${entry}/fd/${fd}`);
      } catch {
        continue;
      }
      if (wanted.has(target)) {
        pids.push(Number(entry));
        break;
      }
    }
  }
  return pids;
}

export type ListenerVerdict =
  | { state: "none" }
  | { state: "e2e"; pids: number[] }
  | { state: "foreign"; reason: string };

/**
 * Who is listening on `port`: nobody, the e2e server (every process holding
 * the socket was started with DATABASE_URL = E2E_DATABASE_URL), or something
 * else -- including a listener whose process this user cannot inspect.
 */
export function inspectListener(port = E2E_PORT): ListenerVerdict {
  const inodes = ["/proc/net/tcp", "/proc/net/tcp6"].flatMap((path) => listeningInodes(readOrEmpty(path), port));
  if (inodes.length === 0) return { state: "none" };
  const pids = pidsHolding(inodes);
  if (pids.length === 0) {
    return { state: "foreign", reason: `a process this user cannot inspect is listening on port ${port}` };
  }
  const mismatched = pids.filter((pid) => environValue(readOrEmpty(`/proc/${pid}/environ`), "DATABASE_URL") !== E2E_DATABASE_URL);
  if (mismatched.length > 0) {
    return {
      state: "foreign",
      reason: `pid ${mismatched.join(", ")} on port ${port} was not started with the e2e DATABASE_URL (value not shown)`,
    };
  }
  return { state: "e2e", pids };
}

function refusal(reason: string): Error {
  return new Error(
    `Refusing to run: ${reason}. Only the e2e server (npm run e2e:start, or the one Playwright starts) may answer on port ${E2E_PORT}; stop the other server first.`,
  );
}

/** Throws unless the e2e server is the one listening on E2E_PORT. For register and the Playwright global setup. */
export function assertE2eServer(): void {
  const verdict = inspectListener();
  if (verdict.state === "none") throw refusal(`nothing is listening on port ${E2E_PORT}; start it first (npm run e2e:start)`);
  if (verdict.state === "foreign") throw refusal(verdict.reason);
}

/** Throws if something other than the e2e server is listening on E2E_PORT; nothing listening is fine. */
export function assertNoForeignServer(): void {
  const verdict = inspectListener();
  if (verdict.state === "foreign") throw refusal(verdict.reason);
}
