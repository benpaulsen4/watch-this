// Page-level helpers shared by the specs: waiting on the Series Finale list
// the dashboard and profile read, locating the dashboard banner, soft
// visibility waits, and the app's pluralisation and number-word rules for
// expected copy.
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

/** The app's numberWords() for the small counts its sentences open with (format.ts). */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * The app's numberWords() (format.ts): 5 -> "five", 42 -> "forty-two",
 * 230 -> "two hundred and thirty"; throws from a thousand, where the app
 * falls back to digits and no sentence here reaches.
 */
export function words(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 1000) throw new Error(`no words for ${value} in this spec's table`);
  const belowHundred = (n: number) => WORDS[n] ?? (n % 10 === 0 ? TENS[Math.floor(n / 10)]! : `${TENS[Math.floor(n / 10)]!}-${WORDS[n % 10]!}`);
  if (value < 100) return belowHundred(value);
  const hundreds = `${WORDS[Math.floor(value / 100)]!} hundred`;
  return value % 100 === 0 ? hundreds : `${hundreds} and ${belowHundred(value % 100)}`;
}

/** "five" (any case) -> 5; null for a word outside the table. */
export function wordValue(word: string): number | null {
  const index = WORDS.indexOf(word.toLowerCase());
  return index < 0 ? null : index;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The app's monthName() (format.ts): 1 -> "January". */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

/** The app's weekdayName() (format.ts): Monday-first, 0 -> "Monday". */
export function weekdayName(index: number): string {
  return WEEKDAYS[index] ?? "";
}

/** The app's percentOf() (format.ts): a share as a whole percentage. */
export function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

/** The app's formatDateKey(): "28 December" for "2025-12-28" -- a local date key, read back in UTC so it never shifts. */
export function dayMonth(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** The app's alsoTopForLine() (format.ts): "Also number one for ana and marcus." -- null for nobody. */
export function alsoTopForLine(usernames: string[]): string | null {
  if (usernames.length === 0) return null;
  const joined = usernames.length === 1 ? usernames.join("") : `${usernames.slice(0, -1).join(", ")} and ${usernames.slice(-1).join("")}`;
  return `Also number one for ${joined}.`;
}
