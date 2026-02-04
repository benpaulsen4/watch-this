---
title: "Create an Account with Passkeys (No Passwords)"
description: Create your WatchThis account using a passkey instead of a password.
order: 2
lastUpdated: 2026-02-04
---

WatchThis uses passkeys, so you don’t need to create or remember a password. A passkey is stored by your device (and can sync across your devices using iCloud Keychain, Google Password Manager, Windows Hello, etc.).

## Before You Start

- Use a modern browser that supports passkeys (Chrome, Safari, Edge, Firefox).
- Make sure your device has a screen lock enabled (PIN/biometrics), since passkeys require it.

## Create Your Account

1. Go to the sign-in page (`/auth`).
2. Click **Create Account**.
3. Enter a **Username**.
4. Click **Create Account with Passkey**.
5. When your device prompts you, approve the passkey creation (Face ID/Touch ID/Windows Hello/Android lock screen).

[[Image: The WatchThis /auth page showing the Create Account toggle and “Create Account with Passkey” button.]]

## What Happens Next

- You’ll be signed in automatically.
- Your passkey is saved on the device you used.
- If your password manager or OS sync is enabled, the same passkey may become available on your other devices as well.

## Troubleshooting

### “Passkeys Not Supported”

If WatchThis says passkeys aren’t supported, switch to a newer browser or update your current one.

### No prompt appears after clicking the button

Try these in order:

1. Reload the page and try again.
2. Confirm your device has a screen lock set up.
3. Disable strict privacy modes (some private/incognito windows can interfere).
4. If you’re trying to create the passkey inside an embedded browser, open the link in your main browser app.

More details: [Passkey Prompts Not Showing](/help/faq/Passkey%20Prompts%20Not%20Showing).

## Related Articles

- [Why Passkeys?](/help/faq/Why%20Passkeys)
- [Sign In on a New Device](/help/getting-started/Sign%20In%20on%20a%20New%20Device)
- [Manage Passkeys](/help/profile/Manage%20Passkeys)
