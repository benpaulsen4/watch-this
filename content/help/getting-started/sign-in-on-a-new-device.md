---
title: Sign In on a New Device
description: Sign in with a synced passkey, or add a new passkey to another device.
order: 3
lastUpdated: 2026-02-07
---

There are two ways to sign in on a new device:

- If your passkeys sync (most common), just sign in normally.
- If your new device doesn’t have a passkey yet, add one from an existing signed-in session.

## Option 1: Sign In with a Synced Passkey

1. Open WatchThis on the new device.
2. Go to `/auth`.
3. Click **Sign In with Passkey**.
4. Approve the prompt on your device (Face ID/Touch ID/Windows Hello/Android lock screen).

If your prompt doesn’t appear, see [Passkey Prompts Not Showing](/help/faq/passkey-prompts-not-showing).

## Option 2: Add a Passkey to a New Device (Recommended When You Don’t See Your Passkey)

Use this when the new device doesn’t have your WatchThis passkey available.

### Step 1: Generate a claim link on a signed-in device

1. On a device where you’re already signed in, go to **Profile** (`/profile`).
2. Open the **Security** tab.
3. Under **Passkey Devices**, click **Add Passkey**.

You’ll see a claim screen with a link and QR code.

![Add Passkey Claim Dialog](/help/getting-started/add-passkey.png)

### Step 2: Complete registration on the new device

1. On the new device, open the claim link (or scan the QR code).
2. Follow the passkey prompt to create a new passkey for your account.

After registration, the new device appears in your device list on the original device.

## Notes and Limits

- Claim links expire after a short time for security.
- Your account must always have at least one passkey.
- You can keep multiple passkeys (for example: laptop + phone).

## Related Articles

- [Manage Passkeys](/help/profile/manage-passkeys)
- [Create an Account with Passkeys (No Passwords)](/help/getting-started/create-an-account-with-passkeys%20%28No%20Passwords%29)
