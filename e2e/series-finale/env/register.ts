#!/usr/bin/env tsx
// Registers the signing-in accounts through the real /auth UI, one fresh
// Chromium context each, and keeps what later specs need under .auth/:
// the passkey (`<username>.credential.json`) and a signed-in Playwright
// storage state (`<username>.json`).
//
// Usage: npm run e2e:register -- <username>...   (needs the app on E2E_BASE_URL)
// Task 3's PERSONAS list replaces the argv usernames.
//
// Re-run safe: a user whose credential file exists AND whose row exists is
// skipped. Registration creates the row with created_at = now(); the seeder
// backdates it.
import { existsSync } from "node:fs";

import { chromium } from "@playwright/test";

import { credentialPath, enableVirtualAuthenticator, exportCredential, registerViaUi, storageStatePath } from "../support/auth";
import { assertUsername, userExists } from "../support/db";
import { E2E_BASE_URL } from "./test-env";

async function assertServerUp(): Promise<void> {
  try {
    await fetch(`${E2E_BASE_URL}/auth`);
  } catch {
    throw new Error(`The app is not answering on ${E2E_BASE_URL}; start it first (npm run e2e:start)`);
  }
}

async function main(): Promise<void> {
  const usernames = process.argv.slice(2);
  if (usernames.length === 0) throw new Error("usage: register.ts <username>...");
  usernames.forEach(assertUsername);
  await assertServerUp();

  const browser = await chromium.launch();
  try {
    for (const username of usernames) {
      const hasCredential = existsSync(credentialPath(username));
      const hasRow = userExists(username);
      if (hasCredential && hasRow) {
        console.log(`${username}: already registered, skipped`);
        continue;
      }
      if (hasRow) {
        // The passkey is gone, so this account can never sign in again, and
        // the username is taken, so it cannot be registered afresh.
        throw new Error(`${username} exists in the e2e db but has no saved credential; reset the db (db.sh reset)`);
      }

      const context = await browser.newContext({
        baseURL: E2E_BASE_URL,
        timezoneId: "Australia/Brisbane",
        locale: "en-AU",
      });
      try {
        const page = await context.newPage();
        const auth = await enableVirtualAuthenticator(page);
        await registerViaUi(page, username);
        await exportCredential(auth, username);
        await context.storageState({ path: storageStatePath(username) });
        console.log(`${username}: registered`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
