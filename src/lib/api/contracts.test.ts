import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AnyContract } from "./contract";

const LIB = path.join(process.cwd(), "src/lib");

const files = readdirSync(LIB, { recursive: true, encoding: "utf8" })
  .filter((entry) => path.basename(entry) === "contract.ts")
  .map((entry) => path.join(LIB, entry));

const modules: [string, Record<string, unknown>][] = await Promise.all(
  files.map(
    async (file) =>
      [file, await import(/* @vite-ignore */ file)] as [
        string,
        Record<string, unknown>,
      ],
  ),
);

function isContract(value: unknown): value is AnyContract {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    "path" in value
  );
}

const contracts = modules.flatMap(([file, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => isContract(value))
    .map(([name, value]) => [`${file}: ${name}`, value as AnyContract] as const),
);

function readRoute(contractPath: string): string | undefined {
  const base = path.join(process.cwd(), "src/app", contractPath);
  const file = ["route.ts", "route.tsx"]
    .map((name) => path.join(base, name))
    .find((candidate) => existsSync(candidate));
  return file && readFileSync(file, "utf8");
}

describe("contracts", () => {
  it("finds contracts to check", () => {
    expect(contracts.length).toBeGreaterThan(0);
  });

  // Read as text so this test does not load database code.
  it.each(contracts)("%s has a route exporting its method", (_, contract) => {
    const source = readRoute(contract.path);
    expect(source, `no route file for ${contract.path}`).toBeDefined();
    expect(source).toMatch(
      new RegExp(`export (const|(async )?function) ${contract.method}\\b`),
    );
  });
});

const API = path.join(process.cwd(), "src/app/api");

const routeFiles = readdirSync(API, { recursive: true, encoding: "utf8" })
  .filter((entry) => /^route\.tsx?$/.test(path.basename(entry)))
  .map((entry) => entry.split(path.sep).join("/"));

/**
 * Routes `authedRoute` and `publicRoute` do not fit: the share card answers
 * with a PNG, and import reads a multipart upload. Both still use `withAuth`.
 */
const NOT_ON_A_WRAPPER = [
  "series-finale/[period]/card/route.tsx",
  "profile/import/route.ts",
];

const HANDLER = /export (?:const|(?:async )?function) (GET|POST|PUT|PATCH|DELETE)\b(.*)/g;

describe("routes", () => {
  it("finds routes to check", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(NOT_ON_A_WRAPPER)("%s still exists", (file) => {
    expect(routeFiles).toContain(file);
  });

  // Read as text so this test does not load database code.
  it.each(routeFiles.filter((file) => !NOT_ON_A_WRAPPER.includes(file)))(
    "%s uses authedRoute or publicRoute for every method",
    (file) => {
      const source = readFileSync(path.join(API, file), "utf8");
      const handlers = [...source.matchAll(HANDLER)];
      expect(handlers.length, "no route handlers found").toBeGreaterThan(0);
      for (const [, method, rest] of handlers) {
        expect(rest, method).toMatch(/^ = (authedRoute|publicRoute)\(/);
      }
    },
  );
});
