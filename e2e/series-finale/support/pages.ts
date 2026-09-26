// Page-level helpers shared by the specs: waiting on the Series Finale list
// the dashboard and profile read, locating the dashboard banner, soft
// visibility waits, and the app's pluralisation rule for expected copy.
import type { Locator, Page, Response } from "@playwright/test";

/** The banner's title line, for any year: "Your 2025 Series Finale is ready". */
export const BANNER_READY = /Series Finale is ready/;

/** Resolves with the page's next GET /api/series-finale (register it before navigating). */
export function listResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/series-finale" && response.request().method() === "GET",
  );
}

/**
 * Opens the dashboard and waits until the list the banner reads has answered
 * and the page has gone quiet. The banner renders synchronously from that
 * list, so after this an absent banner is really absent.
 */
export async function openDashboard(page: Page): Promise<void> {
  const listed = listResponse(page);
  await page.goto("/dashboard");
  await listed;
  await page.waitForLoadState("networkidle");
}

/** The dashboard banner card: the element in <main> holding the "is ready" line. */
export function banner(page: Page): Locator {
  return page.locator("main > *").filter({ hasText: BANNER_READY });
}

/**
 * Waits for `locator` to become visible and says whether it did, without
 * throwing -- so the fact can go through check() and reach the evidence log
 * whether it holds or not.
 */
export async function becomesVisible(locator: Locator, timeout?: number): Promise<boolean> {
  return locator.waitFor({ state: "visible", timeout }).then(
    () => true,
    () => false,
  );
}

/** The app's pluralise() (components/series-finale/format.ts): "1 episode", "1,234 episodes" (en-GB grouping). */
export function pluralise(value: number, noun: string): string {
  return `${value.toLocaleString("en-GB")} ${value === 1 ? noun : `${noun}s`}`;
}
