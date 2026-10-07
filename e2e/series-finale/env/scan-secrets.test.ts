import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findSecretLeaks } from "./scan-secrets";

describe("findSecretLeaks", () => {
  const dirs: string[] = [];
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-secrets-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  const KEY = "0123456789abcdef0123456789abcdef";

  it("names every file, at any depth, that holds a secret, and nothing else", () => {
    const dir = scratch();
    mkdirSync(join(dir, "playwright-report", "data"), { recursive: true });
    writeFileSync(join(dir, "results.json"), `{"env":{"TMDB_API_KEY":"${KEY}"}}`);
    writeFileSync(join(dir, "playwright-report", "data", "blob.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(KEY)]));
    writeFileSync(join(dir, "clean.json"), `{"ok":true}`);

    expect(findSecretLeaks(dir, [{ name: "TMDB_API_KEY", value: KEY }])).toEqual([
      "playwright-report/data/blob.bin: TMDB_API_KEY",
      "results.json: TMDB_API_KEY",
    ]);
  });

  it("never echoes the secret itself", () => {
    const dir = scratch();
    writeFileSync(join(dir, "results.json"), KEY);
    expect(findSecretLeaks(dir, [{ name: "TMDB_API_KEY", value: KEY }]).join("\n")).not.toContain(KEY);
  });

  it("ignores empty or too-short secrets, and a missing directory", () => {
    const dir = scratch();
    writeFileSync(join(dir, "a.txt"), "anything");
    expect(findSecretLeaks(dir, [{ name: "EMPTY", value: "" }, { name: "SHORT", value: "any" }, { name: "UNSET", value: undefined }])).toEqual([]);
    expect(findSecretLeaks(join(dir, "missing"), [{ name: "TMDB_API_KEY", value: KEY }])).toEqual([]);
  });
});
