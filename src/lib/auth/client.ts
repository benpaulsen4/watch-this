"use client";

import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

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
  createdAt: string;
};
