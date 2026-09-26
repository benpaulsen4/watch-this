// Screenshots land at artifacts/screenshots/<project>/<name>.png, where `name`
// is a slash path such as `recap/ava-2025/hero`. Animations are disabled so
// repeated runs capture the same frame.
import { join } from "node:path";

import { type Locator, type Page, type PageScreenshotOptions, test } from "@playwright/test";

import { ARTIFACTS_DIR } from "../env/test-env";

export function shotPath(name: string): string {
  if (!/^[\w-]+(\/[\w-]+)*$/.test(name)) {
    throw new Error(`Screenshot name must be a slash path of [A-Za-z0-9_-] segments: ${name}`);
  }
  return join(ARTIFACTS_DIR, "screenshots", test.info().project.name, `${name}.png`);
}

export type ShotOptions = Omit<PageScreenshotOptions, "path" | "animations">;

export async function shot(page: Page, name: string, opts: ShotOptions = {}): Promise<void> {
  await page.screenshot({ ...opts, path: shotPath(name), animations: "disabled" });
}

export async function shotElement(locator: Locator, name: string): Promise<void> {
  await locator.screenshot({ path: shotPath(name), animations: "disabled" });
}
