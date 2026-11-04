import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  const result = manifest();

  it("opens standalone so Chrome does not add its title bar on Android", () => {
    expect(result.display).toBe("standalone");
  });

  it("starts on the dashboard rather than the marketing landing page", () => {
    expect(result.start_url).toBe("/dashboard");
  });

  it("offers a maskable icon so Android does not shrink the logo into a white circle", () => {
    expect(result.icons).toContainEqual(
      expect.objectContaining({ purpose: "maskable", sizes: "512x512" }),
    );
  });

  it("offers the 192px and 512px icons Chrome requires to install", () => {
    const anyIconSizes = result.icons
      ?.filter((icon) => icon.purpose === undefined)
      .map((icon) => icon.sizes);

    expect(anyIconSizes).toEqual(["192x192", "512x512"]);
  });

  it("only references icons that exist in public/", () => {
    const srcs = [
      ...(result.icons ?? []),
      ...(result.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
    ].map((icon) => icon.src);

    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(existsSync(path.join(process.cwd(), "public", src))).toBe(true);
    }
  });

  it("gives every shortcut an icon, because Chrome can drop those without one", () => {
    expect(result.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/activity",
      "/lists",
      "/search",
    ]);
    for (const shortcut of result.shortcuts ?? []) {
      expect(shortcut.icons?.length).toBeGreaterThan(0);
    }
  });
});
