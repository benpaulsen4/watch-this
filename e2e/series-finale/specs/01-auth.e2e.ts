import { rmSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  credentialPath,
  enableVirtualAuthenticator,
  exportCredential,
  registerViaUi,
  signInAs,
  signOut,
} from "../support/auth";
import { deleteUser, userExists } from "../support/db";
import { check } from "../support/evidence";
import { shot } from "../support/shots";

// The passkey round trip every later spec relies on: register through /auth
// with a virtual authenticator, sign out through the profile, sign back in with
// the saved credential. Uses a throwaway user that is removed afterwards so the
// seeded cohort is not polluted.

const PROBE = "e2e_probe";

function removeProbe(): void {
  deleteUser(PROBE);
  rmSync(credentialPath(PROBE), { force: true });
}

test("register, sign out and sign back in with the saved passkey", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop project only");

  removeProbe(); // a previous run that died before cleaning up
  try {
    const auth = await enableVirtualAuthenticator(page);

    await registerViaUi(page, PROBE);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(PROBE).first()).toBeVisible();
    check("auth-registered-user-row", "registering through /auth creates the user row", true, userExists(PROBE));
    await shot(page, "auth/registered-dashboard");

    await exportCredential(auth, PROBE);

    await signOut(page);
    const signedOut = await page.request.get("/api/auth/session");
    check("auth-signed-out", "after Logout the session endpoint refuses", 401, signedOut.status());

    await signInAs(page, PROBE);
    const session = await page.request.get("/api/auth/session");
    const body = (await session.json()) as { user?: { username?: string } };
    check(
      "auth-signed-in-username",
      "signing back in with the saved credential restores that user's session",
      PROBE,
      body.user?.username,
    );
  } finally {
    removeProbe();
  }
});
