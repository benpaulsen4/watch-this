import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AnyContract } from "./contract";

const LIB = path.join(process.cwd(), "src/lib");

const files = readdirSync(LIB)
  .map((feature) => path.join(LIB, feature, "contract.ts"))
  .filter((file) => existsSync(file));

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
