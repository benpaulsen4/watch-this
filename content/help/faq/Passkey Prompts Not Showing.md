---
title: "Troubleshooting: Passkey Prompts Not Showing"
description: Fix missing passkey prompts by checking browser support, device settings, and sign-in flow.
order: 2
lastUpdated: 2026-02-04
---

If you click **Sign In with Passkey** (or **Create Account with Passkey**) and no system prompt appears, try the steps below in order.

## 1) Confirm Your Browser Supports Passkeys

Passkeys require a modern browser. If WatchThis shows “Passkeys Not Supported,” update your browser or switch to Chrome, Safari, Edge, or Firefox.

## 2) Make Sure You’re in a Secure Context

Passkeys require HTTPS (the common exception is `http://localhost` in development). If you’re on an insecure connection, the prompt may not appear.

## 3) Check Device Settings (Most Common Fix)

Passkeys require a working platform authenticator. Make sure:

- You have a screen lock enabled (PIN/biometrics).
- Face ID / Touch ID / Windows Hello / Android screen lock is set up.
- Passkeys aren’t disabled by device policy (common on managed/enterprise devices).

## 4) Confirm a Passkey Exists for Sign-In

On a brand new device, you might not have a WatchThis passkey available yet.

- If your passkeys sync, sign-in should work normally.
- If they don’t sync, add a passkey on that device from an existing signed-in session.

Read: [Sign In on a New Device](/help/getting-started/Sign%20In%20on%20a%20New%20Device).

## 5) Try a Normal Browser Tab (Not Embedded)

If you opened WatchThis inside an in-app browser or embedded web view, passkey prompts may be blocked. Open the site directly in your main browser.

## 6) If It Works on /auth but Not on a Claim Link

Some browsers require a user click before showing passkey UI. If you’re adding a new passkey device via a claim link and it seems like “nothing happens,” reload the page and try again, or complete the flow in a browser/device that reliably supports passkey registration.

## Related Articles

- [Why Passkeys?](/help/faq/Why%20Passkeys)
- [Manage Passkeys](/help/profile/Manage%20Passkeys)
