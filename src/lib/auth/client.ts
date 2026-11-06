"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { UAParser } from "ua-parser-js";

import { api } from "@/lib/api/client";
import type { Jsonify } from "@/lib/api/contract";
import * as authApi from "@/lib/auth/contract";
import type { SessionUser } from "@/lib/auth/types";
import * as devicesApi from "@/lib/profile/devices/contract";

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
    const { options } = await api(authApi.registerBegin, { body: { username } });

    // Start registration with the browser
    const registrationResponse = await startRegistration({
      optionsJSON: options,
    });

    // Verify registration with server
    return await api(authApi.registerVerify, {
      body: { username, registrationResponse, deviceName, timezone },
    });
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

// Authenticate with existing passkey
export async function authenticatePasskey() {
  try {
    // Get authentication options from server
    const { options } = await api(authApi.authenticateBegin);

    // Start authentication with the browser
    const authenticationResponse = await startAuthentication({
      optionsJSON: options,
    });

    // Verify authentication with server
    return await api(authApi.authenticateVerify, {
      body: { authenticationResponse },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
}

// Initiate a claim to add a new passkey
export function initiatePasskeyClaim() {
  return api(devicesApi.initiateClaim);
}

// Begin claim registration on another device using the magic link token
export function beginClaimRegistration(token: string) {
  return api(authApi.claimBegin, { query: { token } });
}

// Verify claim registration and attach credential to existing user
export function verifyClaimRegistration({
  token,
  challengeToken,
  registrationResponse,
  deviceName,
}: {
  token: string;
  challengeToken: string;
  registrationResponse: { id: string };
  deviceName?: string;
}) {
  const { browser, os } = UAParser(navigator.userAgent);
  const computedDeviceName =
    deviceName ||
    `${browser.name ?? "Unknown Browser"} on ${os.name ?? "Unknown OS"} ${
      os.version
    }`;

  return api(authApi.claimVerify, {
    body: {
      token,
      challengeToken,
      registrationResponse,
      deviceName: computedDeviceName,
    },
  });
}

// Get current user session, or null when signed out or unreachable
export async function getCurrentSession() {
  try {
    return await api(authApi.getSession);
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

// The session user as the client receives it. `profilePictureUrl` is null
// for a user without one.
export type User = Jsonify<SessionUser>;
