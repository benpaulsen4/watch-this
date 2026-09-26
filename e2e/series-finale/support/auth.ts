// Passkey accounts through the real /auth UI, backed by Chromium's CDP
// virtual authenticator (Chromium only -- WebKit has no equivalent).
//
// Sign-in on /auth uses discoverable credentials and asks for no username, so
// the authenticator must hold exactly one credential when the sign-in button is
// clicked: signInAs() clears it and adds the saved credential for that user.
// Credentials (private key included) live only under the gitignored .auth/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CDPSession, Page } from "@playwright/test";

import { AUTH_DIR } from "../env/test-env";
import { assertUsername } from "./db";

export interface VirtualAuthenticator {
  client: CDPSession;
  authenticatorId: string;
}

const authenticators = new WeakMap<Page, VirtualAuthenticator>();

export function storageStatePath(username: string): string {
  assertUsername(username);
  return join(AUTH_DIR, `${username}.json`);
}

export function credentialPath(username: string): string {
  assertUsername(username);
  return join(AUTH_DIR, `${username}.credential.json`);
}

/**
 * Attaches a platform-style virtual authenticator to the page (once per page).
 * `transport: "internal"` so /auth's isPlatformAuthenticatorAvailable() is true.
 */
export async function enableVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const existing = authenticators.get(page);
  if (existing) return existing;

  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const auth = { client, authenticatorId };
  authenticators.set(page, auth);
  return auth;
}

async function readCredentials(auth: VirtualAuthenticator) {
  const { credentials } = await auth.client.send("WebAuthn.getCredentials", {
    authenticatorId: auth.authenticatorId,
  });
  return credentials;
}

// The credential object CDP's WebAuthn domain returns and accepts.
type Credential = Awaited<ReturnType<typeof readCredentials>>[number];

/**
 * Waits for the post-auth navigation to /dashboard. If it never comes, fails
 * with the error /auth is showing instead of a bare timeout.
 */
async function waitForDashboard(page: Page, action: string): Promise<void> {
  try {
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
  } catch (error) {
    const shown = await page
      .locator("form .text-red-400")
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    throw new Error(`${action} did not reach /dashboard${shown ? `; /auth shows: ${shown}` : ""}`, { cause: error });
  }
}

/**
 * Registers `username` through /auth's Create Account form; resolves on
 * /dashboard. The authenticator is emptied first, so afterwards it holds only
 * the new passkey, ready for exportCredential().
 */
export async function registerViaUi(page: Page, username: string): Promise<void> {
  assertUsername(username);
  const auth = await enableVirtualAuthenticator(page);
  await auth.client.send("WebAuthn.clearCredentials", { authenticatorId: auth.authenticatorId });
  await page.goto("/auth");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Create Account with Passkey" }).click();
  await waitForDashboard(page, `Registering ${username}`);
}

/**
 * Saves the authenticator's one credential to `.auth/<username>.credential.json`.
 * Call it right after registering (or signing in) with only that user's
 * credential in the authenticator.
 */
export async function exportCredential(auth: VirtualAuthenticator, username: string): Promise<void> {
  const credentials = await readCredentials(auth);
  const [credential] = credentials;
  if (credentials.length !== 1 || !credential) {
    throw new Error(`Expected exactly one credential to export for ${username}, found ${credentials.length}`);
  }
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(credentialPath(username), JSON.stringify(credential, null, 2));
}

/**
 * Signs in as `username` with its saved credential through /auth's
 * discoverable-credential sign-in; resolves on /dashboard. The saved file is
 * refreshed afterwards so its signCount keeps up with the server's counter
 * (a replayed, stale counter would be rejected on the next sign-in).
 */
export async function signInAs(page: Page, username: string): Promise<void> {
  const path = credentialPath(username);
  if (!existsSync(path)) {
    throw new Error(`No saved credential for ${username} (${path}); run e2e:register first`);
  }
  const credential = JSON.parse(readFileSync(path, "utf8")) as Credential;

  const auth = await enableVirtualAuthenticator(page);
  await auth.client.send("WebAuthn.clearCredentials", { authenticatorId: auth.authenticatorId });
  await auth.client.send("WebAuthn.addCredential", {
    authenticatorId: auth.authenticatorId,
    credential,
  });

  await page.goto("/auth");
  await page.getByRole("button", { name: "Sign In with Passkey" }).click();
  await waitForDashboard(page, `Signing in as ${username}`);

  await exportCredential(auth, username);
}

/** Signs out through the profile page's Logout control (the path that calls clearAuth()). */
export async function signOut(page: Page): Promise<void> {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL("**/auth");
}
