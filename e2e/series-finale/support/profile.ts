// The profile page (/profile) as the Series Finale specs use it: its tabs,
// the "Series Finale" card on the Data Management tab (the archive rows and
// the crew-comparison switch), the username changer, and Logout. src/ has
// no test ids, so everything is found by role, label or text.
import type { Locator, Page, Response } from "@playwright/test";

import { becomesVisible } from "./pages";
import { textOf } from "./recap";

export type ProfileTab = "profile" | "security" | "data" | "streaming";

/** Each tab's card title, the sign that the tab has rendered. */
const TAB_TITLE: Record<ProfileTab, string> = {
  profile: "Profile Information",
  security: "Security Settings",
  data: "Data Management",
  streaming: "Streaming Preferences",
};

/** Each tab's button in the profile's sidebar. */
const TAB_BUTTON: Record<ProfileTab, string> = {
  profile: "Profile",
  security: "Security",
  data: "Data Management",
  streaming: "Streaming",
};

/** The crew switch's label and its consent text (CrewComparisonToggle.tsx DESCRIPTION), as expected copy. */
export const CREW_SWITCH_LABEL = "Include me in crew comparisons";
export const CREW_CONSENT_TEXT =
  "People you share a list with see, in their Series Finale, how many episodes you watched, how much of what you finished overlaps with theirs, a title you finished that they dropped, one you both still plan to watch, and whether your top show matched theirs. Turn this off to leave their recaps.";
export const CREW_SWITCH_FAILED = "Could not save that. Reverted.";

/** ProfileFinaleRows' failure and empty lines. */
export const ARCHIVE_LOAD_FAILED = "Couldn't load your Series Finale archive. Try again later.";
export const ARCHIVE_EMPTY = /^No Series Finale yet\./;

/** The tab's card title (an h3). */
export function tabTitle(page: Page, tab: ProfileTab): Locator {
  return page.getByRole("heading", { level: 3, name: TAB_TITLE[tab], exact: true });
}

/**
 * Opens /profile on `tab` (by its URL fragment, which the page reads on
 * load) and says whether the tab rendered.
 */
export async function openProfileTab(page: Page, tab: ProfileTab): Promise<boolean> {
  await page.goto(tab === "profile" ? "/profile" : `/profile#${tab}`);
  return becomesVisible(tabTitle(page, tab), 15_000);
}

/** Switches tab with the sidebar button (no page load) and says whether it rendered. */
export async function clickProfileTab(page: Page, tab: ProfileTab): Promise<boolean> {
  await page.getByRole("button", { name: TAB_BUTTON[tab], exact: true }).click();
  return becomesVisible(tabTitle(page, tab), 15_000);
}

/** The Data Management tab's "Series Finale" card: the card around its h3 (Card > CardHeader > h3). */
export function finaleCard(page: Page): Locator {
  return page.getByRole("heading", { level: 3, name: "Series Finale", exact: true }).locator("xpath=ancestor::div[2]");
}

/** The archive's rows: one <li> per period. */
export function finaleRows(page: Page): Locator {
  return finaleCard(page).locator("ul > li");
}

export interface FinaleRow {
  title: string | null;
  counts: string | null;
  openHref: string | null;
  /** The highlighted treatment: the icon tile is drawn with a gradient (the newest row only). */
  highlighted: boolean;
}

/** Every archive row as shown: title, counts line, the Open link's href, highlighted or not. */
export async function readFinaleRows(page: Page): Promise<FinaleRow[]> {
  return finaleRows(page).evaluateAll((items) =>
    items.map((item) => {
      const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const body = item.querySelector(".min-w-0");
      const tile = item.querySelector("svg")?.parentElement ?? null;
      return {
        title: text(body?.children[0]),
        counts: text(body?.children[1]),
        openHref: item.querySelector("a")?.getAttribute("href") ?? null,
        highlighted: tile !== null && getComputedStyle(tile).backgroundImage.includes("gradient"),
      };
    }),
  );
}

/** The crew-comparison switch (react-aria renders a checkbox with role="switch"). */
export function crewSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: CREW_SWITCH_LABEL });
}

/** The line under the switch: its consent text, or its error in place of it. */
export async function crewSwitchLine(page: Page): Promise<string | null> {
  return textOf(finaleCard(page).locator("label").filter({ has: crewSwitch(page) }).locator("xpath=following-sibling::p[1]"));
}

/** Toggles the switch as a person would: a click on its label. */
export async function toggleCrewSwitch(page: Page): Promise<void> {
  await page.getByText(CREW_SWITCH_LABEL, { exact: true }).click();
}

/** Resolves with the page's next PUT /api/auth/session (register it before acting). */
export function sessionPut(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/session" && response.request().method() === "PUT",
  );
}

/** The profile header's Logout button. */
export function logoutButton(page: Page): Locator {
  return page.getByRole("button", { name: "Logout" });
}
