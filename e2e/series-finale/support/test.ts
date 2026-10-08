// The suite's `test`: Playwright's, plus one automatic fixture that keeps the
// read-only projects read-only. Every spec imports `test` from here.
//
// A recap posts a dismissal (POST /api/series-finale/<year>/dismiss) once its
// footer comes into view, and read-only specs scroll recaps to the bottom all
// the time -- to load lazy posters, to crop the footer, for full-page shots.
// In a read-only project those POSTs are answered here, in the browser, as
// the app would answer them, and never reach the app or the database. The
// real dismissal is exercised in the desktop-mutating project
// (31-banner.mutating), where this does nothing.
import { test as base } from "@playwright/test";

const DISMISS = /\/api\/series-finale\/\d{4}\/dismiss$/;

export const test = base.extend<{ readOnlyDismissals: void }>({
  readOnlyDismissals: [
    async ({ context }, use, testInfo) => {
      if (!testInfo.project.name.endsWith("-mutating")) {
        await context.route(DISMISS, (route) =>
          route.request().method() === "POST"
            ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) })
            : route.continue(),
        );
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
