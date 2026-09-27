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

/**
 * One element, cropped out of a full-page capture by its document box.
 *
 * Not `locator.screenshot()`: under mobile emulation a page wider than the
 * viewport (finding F1) is zoomed out (visualViewport.scale < 1), and
 * Playwright's element box is then scaled while the capture is not, so the
 * crop drifts further off the element the lower it sits -- a phone "big-day"
 * shot showed the Genres panel. getBoundingClientRect() plus the scroll offset
 * is the element's box in document CSS pixels whatever the zoom, which is what
 * a full-page clip is measured in. Used on every project, so a later overflow
 * cannot bring the drift back.
 */
export async function shotElement(locator: Locator, name: string): Promise<void> {
  const element = locator.first();
  // Scrolled to first so its lazy images start loading; then up to 10 s for them.
  await element.scrollIntoViewIfNeeded();
  await element.evaluate((node) => {
    const pending = Array.from(node.querySelectorAll("img"))
      .filter((image) => !image.complete)
      .map((image) => new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }));
    return Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, 10_000))]);
  });
  // Back to the top before the capture: a full-page capture draws the sticky
  // header where the page is scrolled to, which would lay it over a tall
  // element's top.
  const clip = await element.evaluate((node) => {
    window.scrollTo(0, 0);
    const box = node.getBoundingClientRect();
    return { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height };
  });
  await element.page().screenshot({ path: shotPath(name), animations: "disabled", fullPage: true, clip });
}
