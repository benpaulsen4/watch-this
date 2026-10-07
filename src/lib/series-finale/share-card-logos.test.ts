// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TMDB_LOGO_SVG, WATCHTHIS_LOGO_SVG } from "./share-card-logos";

// The share card embeds these marks so no request reads `public/` at runtime.
// Only this test reads the files, to keep the two copies identical.
const publicFile = (name: string) =>
  readFileSync(join(process.cwd(), "public", name));

describe.each([
  ["logo-master.svg", WATCHTHIS_LOGO_SVG],
  ["tmdb.svg", TMDB_LOGO_SVG],
])("the embedded copy of public/%s", (name, embedded) => {
  it("is byte-for-byte identical to the file", () => {
    const file = publicFile(name);

    // The string comparison gives a readable diff; the byte comparison is the
    // actual guarantee, encoding and trailing newline included.
    expect(embedded).toBe(file.toString("utf8"));
    expect(Buffer.from(embedded, "utf8").equals(file)).toBe(true);
  });
});
