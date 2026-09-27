import { type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check, note } from "../support/evidence";
import { oracleAvailableYears, oracleYear } from "../support/oracle";
import { becomesVisible, pluralise } from "../support/pages";
import {
  ARCHIVE_EMPTY,
  ARCHIVE_LOAD_FAILED,
  CREW_CONSENT_TEXT,
  CREW_SWITCH_FAILED,
  crewSwitch,
  crewSwitchLine,
  finaleCard,
  finaleRows,
  openProfileTab,
  readFinaleRows,
  sessionPut,
  toggleCrewSwitch,
} from "../support/profile";
import { shot, shotElement } from "../support/shots";

// ava's profile, Data Management tab (desktop + phone; read-only): the Series
// Finale archive rows against the oracle, the list's failure line, and the
// crew-comparison switch -- on, with its consent text, and a failed save
// that reverts. Failures are forced with page.route, so nothing persists:
// the PUT that fails never reaches the app.

const AVA = "e2e_ava";
// URL matchers for page.route, kept as constants so unroute() removes the same handler.
const isList = (url: URL) => url.pathname === "/api/series-finale";
const isSession = (url: URL) => url.pathname === "/api/auth/session";

test.use({ storageState: storageStatePath(AVA) });

/** Opens ava's Data Management tab; logs whether it rendered, and stops the test if it did not. */
async function openAvaDataTab(page: Page): Promise<void> {
  const opened = await openProfileTab(page, "data");
  check("profile-ava-data-tab", "ava's profile opens on its Data Management tab", true, opened);
  if (!opened) throw new Error("ava's Data Management tab did not render; nothing else can be checked");
}

/** ava's share_stats_with_collaborators as stored. */
function avaConsents(): string {
  return psql("select share_stats_with_collaborators from users where username = :'u';", { u: AVA });
}

test("the archive rows: every year newest first, the newest highlighted, each opening its recap", async ({ page }) => {
  await openAvaDataTab(page);
  const years = oracleAvailableYears(AVA);
  const listed = await becomesVisible(finaleRows(page).first(), 30_000);
  check("profile-rows-shown", "the Series Finale archive lists rows", true, listed);
  // The rows render in one pass from the list; let it settle before reading.
  await page.waitForLoadState("networkidle");
  const rows = await readFinaleRows(page);

  check("profile-rows-years", "the rows are the oracle's available years, newest first (2025, 2024, 2023)", ["2025", "2024", "2023"], years);
  check(
    "profile-rows",
    "each row: 'Series Finale <year>', '{n} episodes · {n} titles' per the oracle, an Open link to its recap; only the newest highlighted",
    years.map((year, index) => {
      const oracle = oracleYear(AVA, year);
      return {
        title: `Series Finale ${year}`,
        counts: `${pluralise(oracle.episodes, "episode")} · ${pluralise(oracle.titlesCompleted, "title")}`,
        openHref: `/series-finale/${year}`,
        highlighted: index === 0,
      };
    }),
    rows,
  );
  check(
    "profile-rows-thin-listed",
    "2023, a thin year in the oracle, is still listed",
    { thin: true, listed: true },
    { thin: oracleYear(AVA, "2023").thin, listed: rows.some((row) => row.title === "Series Finale 2023") },
  );
  await shotElement(finaleCard(page), "profile/ava-rows");
});

test("a failed archive load says so, and does not claim there is no Series Finale", async ({ page }) => {
  let failed = 0;
  // Only the list GET; the page's other requests go through.
  await page.route(isList, (route) => {
    failed += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "e2e: forced failure" }) });
  });
  try {
    await openAvaDataTab(page);
    // The list query retries once (ReactQueryProvider retry: 1) before it errors.
    const shown = await becomesVisible(page.getByText(ARCHIVE_LOAD_FAILED), 20_000);
    check("profile-rows-error-line", "the archive shows its failure line", true, shown);
    check("profile-rows-error-not-empty", "the archive does not say 'No Series Finale yet'", 0, await finaleCard(page).getByText(ARCHIVE_EMPTY).count());
    check("profile-rows-error-no-rows", "no archive rows are listed", 0, await finaleRows(page).count());
    check("profile-rows-error-requests", "the forced 500 was served (the list was requested and retried once)", true, failed >= 2);
    await shotElement(finaleCard(page), "profile/rows-error");
  } finally {
    await page.unroute(isList);
  }
});

test("the crew-comparison switch is on, with its consent text", async ({ page }) => {
  await openAvaDataTab(page);
  const toggle = crewSwitch(page);
  check("profile-crew-switch-shown", "the 'Include me in crew comparisons' switch is shown", true, await becomesVisible(toggle));
  check("profile-crew-switch-on", "the switch is on for ava (she consents, as seeded)", { on: true, stored: "t" }, {
    on: await toggle.isChecked(),
    stored: avaConsents(),
  });
  check("profile-crew-consent-text", "the consent text under the switch names everything a collaborator's recap shows", CREW_CONSENT_TEXT, await crewSwitchLine(page));
  await shotElement(finaleCard(page), "profile/crew-switch-on");
});

test("a failed save puts the switch back on and says so", async ({ page }) => {
  let putsIntercepted = 0;
  await page.route(isSession, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    putsIntercepted += 1;
    // A moment's delay so the optimistic flip can be seen before the failure.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "e2e: forced failure" }) });
  });
  try {
    await openAvaDataTab(page);
    const toggle = crewSwitch(page);
    const shown = await becomesVisible(toggle);
    check("profile-crew-failed-before", "the switch is shown, and starts on", { shown: true, on: true }, { shown, on: shown && (await toggle.isChecked()) });
    if (!shown) throw new Error("the crew switch never appeared; nothing to toggle");

    const put = sessionPut(page);
    await toggleCrewSwitch(page);
    const optimisticOff = await toggle.isChecked().then((on) => !on);
    const response = await put;
    check("profile-crew-failed-optimistic", "the click flips the switch off at once, before the PUT answers", true, optimisticOff);
    check("profile-crew-failed-put", "the PUT answered with the forced 500", 500, response.status());

    const errorShown = await becomesVisible(finaleCard(page).getByText(CREW_SWITCH_FAILED, { exact: true }));
    check("profile-crew-failed-reverted", "after the failed PUT the switch is back on", true, await toggle.isChecked());
    check("profile-crew-failed-error", "the switch's error line says the save failed and was reverted", { shown: true, line: CREW_SWITCH_FAILED }, {
      shown: errorShown,
      line: await crewSwitchLine(page),
    });
    check("profile-crew-failed-enabled", "the switch is usable again once the PUT has failed", true, await toggle.isEnabled());
    // Switch.tsx renders `error || helperText` in one line, so the error takes
    // the consent text's place until the next toggle.
    const consentStillShown = (await finaleCard(page).getByText(CREW_CONSENT_TEXT, { exact: true }).count()) > 0;
    note(
      "profile-crew-failed-consent-text",
      "after a failed save, is the consent text still shown beside the error? (Switch shows its error in place of its helper text)",
      "consent text still shown",
      consentStillShown ? "consent text still shown" : "consent text replaced by the error line",
      consentStillShown,
    );
    await shotElement(finaleCard(page), "profile/crew-switch-failed");
  } finally {
    await page.unroute(isSession);
  }
  check("profile-crew-failed-intercepted", "exactly one PUT was sent, and it never reached the app", 1, putsIntercepted);
  check("profile-crew-failed-stored", "ava's stored consent is untouched", "t", avaConsents());
});

test("the whole Data Management tab", async ({ page }) => {
  await openAvaDataTab(page);
  await becomesVisible(finaleRows(page).first(), 30_000);
  await page.waitForLoadState("networkidle");
  await shot(page, "profile/ava-data-tab", { fullPage: true });
});
