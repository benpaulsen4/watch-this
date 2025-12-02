"use client";

import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { UAParser } from "ua-parser-js";
import type { ClaimInitiateResponse } from "@/lib/profile/devices/types";

export interface RegistrationOptions {
  username: string;
  deviceName?: string;
}

// Register a new passkey
export async function registerPasskey({
  username,
  deviceName,
}: RegistrationOptions) {
  try {
    // Detect browser timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Get registration options from server
    const optionsResponse = await fetch("/api/auth/register/begin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    if (!optionsResponse.ok) {
      const error = await optionsResponse.json();
      throw new Error(error.message || "Failed to get registration options");
    }

    const { options } = await optionsResponse.json();

    // Start registration with the browser
    const registrationResponse = await startRegistration({
      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
    });

    // Verify registration with server
    const verificationResponse = await fetch("/api/auth/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        registrationResponse,
        deviceName,
        timezone,
      }),
    });

    if (!verificationResponse.ok) {
      const error = await verificationResponse.json();
      throw new Error(error.message || "Registration verification failed");
    }

    const result = await verificationResponse.json();

    return result;
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

// Authenticate with existing passkey
export async function authenticatePasskey() {
  try {
    // Get authentication options from server
    const optionsResponse = await fetch("/api/auth/authenticate/begin");

    if (!optionsResponse.ok) {
      const error = await optionsResponse.json();
      throw new Error(error.message || "Failed to get authentication options");
    }

    const { options } = await optionsResponse.json();

    // Start authentication with the browser
    const authenticationResponse = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    });

    // Verify authentication with server
    const verificationResponse = await fetch("/api/auth/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authenticationResponse,
      }),
    });

    if (!verificationResponse.ok) {
      const error = await verificationResponse.json();
      throw new Error(error.message || "Authentication verification failed");
    }

    const result = await verificationResponse.json();

    return result;
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
}

// Initiate a claim to add a new passkey
export async function initiatePasskeyClaim(): Promise<ClaimInitiateResponse> {
  const response = await fetch("/api/profile/devices", { method: "POST" });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to initiate passkey claim");
  }
  return await response.json();
}

// Begin claim registration on another device using the magic link token
export async function beginClaimRegistration(token: string): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeToken: string;
}> {
  const response = await fetch(
    `/api/auth/claim/begin?token=${encodeURIComponent(token)}`
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to begin claim registration");
  }
  return await response.json();
}

// Verify claim registration and attach credential to existing user
export async function verifyClaimRegistration({
  token,
  challengeToken,
  registrationResponse,
  deviceName,
}: {
  token: string;
  challengeToken: string;
  registrationResponse: unknown;
  deviceName?: string;
}): Promise<{ success: boolean }> {
  const { browser, os } = UAParser(navigator.userAgent);
  const computedDeviceName =
    deviceName ||
    `${browser.name ?? "Unknown Browser"} on ${os.name ?? "Unknown OS"} ${
      os.version
    }`;

  const response = await fetch("/api/auth/claim/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      challengeToken,
      registrationResponse,
      deviceName: computedDeviceName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to verify claim registration");
  }
  return await response.json();
}

// Sign out user
export async function signOut() {
  try {
    await fetch("/api/auth/signout", {
      method: "POST",
    });
  } catch (error) {
    console.error("Sign out error:", error);
  } finally {
    // Redirect to auth page
    window.location.href = "/auth";
  }
}

// Get current user session
export async function getCurrentSession(): Promise<{ user: User } | null> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Check if passkeys are supported
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable === "function"
  );
}

// Check if platform authenticator is available
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeySupported()) return false;

  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export type User = {
  id: string;
  username: string;
  profilePictureUrl: string;
  timezone: string;
  createdAt: string;
};
