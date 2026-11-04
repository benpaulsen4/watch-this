import { readdirSync } from "fs";
import { isStaticMetadataFile } from "next/dist/lib/metadata/is-metadata-route";
import path from "path";
import { describe, expect, it } from "vitest";

// Next allows at most one digit after a metadata file's name. A name like
// icon192.png still gets a <link> tag and works under `next start`, but is left
// out of routes-manifest.json, so the link 404s on Vercel.
describe("metadata icon files", () => {
  const files = readdirSync(path.join(process.cwd(), "src/app")).filter((file) =>
    /^(apple-)?icon.*\.(png|jpe?g|svg|ico)$/.test(file),
  );

  it("finds the icons to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s is named so Next routes it", (file) => {
    expect(isStaticMetadataFile(`/${file}`)).toBe(true);
  });
});
