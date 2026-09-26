// Guard against a secret leaking into generated output. Playwright's reporters
// serialise whatever the config holds (a webServer `env` once put the real
// TMDB key into artifacts/results.json), so every run ends with a byte scan
// of artifacts/ for the secrets the run was given. Only file names are ever
// reported, never the secret.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface NamedSecret {
  name: string;
  value: string | undefined;
}

/** Files under `dir` (recursive) whose bytes contain any secret, as "path: NAME". */
export function findSecretLeaks(dir: string, secrets: NamedSecret[]): string[] {
  // An empty or very short value would match everywhere and prove nothing.
  const needles = secrets.filter((s): s is { name: string; value: string } => (s.value?.length ?? 0) >= 8);
  if (!existsSync(dir)) return [];

  const leaks: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) {
        const bytes = readFileSync(child);
        for (const secret of needles) {
          if (bytes.includes(secret.value)) leaks.push(`${relative(dir, child)}: ${secret.name}`);
        }
      }
    }
  };
  walk(dir);
  return leaks.sort();
}
