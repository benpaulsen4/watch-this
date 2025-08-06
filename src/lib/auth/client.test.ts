import {
  registerPasskey,
  authenticatePasskey,
  signOut,
  getCurrentSession,
  isPasskeySupported,
  isPlatformAuthenticatorAvailable,
} from "./client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    mockStartRegistration: vi.fn(),
    mockStartAuthentication: vi.fn(),
  };
});

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: mocks.mockStartRegistration,
  startAuthentication: mocks.mockStartAuthentication,
}));

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
Object.defineProperty(window, "location", {
  value: {
    href: "",
  },
  writable: true,
});

// Mock PublicKeyCredential
Object.defineProperty(window, "PublicKeyCredential", {
  value: {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(),
  },
  writable: true,
});

describe("Auth Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerPasskey", () => {
    it("successfully registers a new passkey", async () => {
      const mockOptions = { challenge: "test-challenge" };
      const mockRegistrationResponse = { id: "credential-id" };
      const mockResult = {
        success: true,
        user: { id: "1", username: "testuser" },
      };

      // Mock fetch responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              options: mockOptions,
              challenge: "test-challenge",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResult),
        });

      // Mock startRegistration
      mocks.mockStartRegistration.mockResolvedValue(mockRegistrationResponse);

      const result = await registerPasskey({
        username: "testuser",
        deviceName: "Test Device",
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, "/api/auth/register/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser" }),
      });
      expect(startRegistration).toHaveBeenCalledWith({
        optionsJSON: mockOptions,
      });
      expect(result).toEqual(mockResult);
    });

    it("handles registration options fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Username already exists" }),
      });

      await expect(
        registerPasskey({ username: "existinguser" })
      ).rejects.toThrow("Username already exists");
    });

    it("handles registration verification error", async () => {
      const mockOptions = { challenge: "test-challenge" };
      const mockRegistrationResponse = { id: "credential-id" };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              options: mockOptions,
              challenge: "test-challenge",
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: "Verification failed" }),
        });

      mocks.mockStartRegistration.mockResolvedValue(mockRegistrationResponse);

      await expect(registerPasskey({ username: "testuser" })).rejects.toThrow(
        "Verification failed"
      );
    });

    it("handles browser registration error", async () => {
      const mockOptions = { challenge: "test-challenge" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            options: mockOptions,
            challenge: "test-challenge",
          }),
      });

      mocks.mockStartRegistration.mockRejectedValue(
        new Error("User cancelled")
      );

      await expect(registerPasskey({ username: "testuser" })).rejects.toThrow(
        "User cancelled"
      );
    });
  });

  describe("authenticatePasskey", () => {
    it("successfully authenticates with passkey", async () => {
      const mockOptions = { challenge: "auth-challenge" };
      const mockAuthResponse = { id: "credential-id" };
      const mockResult = {
        success: true,
        user: { id: "1", username: "testuser" },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              options: mockOptions,
              challenge: "auth-challenge",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResult),
        });

      mocks.mockStartAuthentication.mockResolvedValue(mockAuthResponse);

      const result = await authenticatePasskey({ username: "testuser" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(startAuthentication).toHaveBeenCalledWith({
        optionsJSON: mockOptions,
      });
      expect(result).toEqual(mockResult);
    });

    it("authenticates without username", async () => {
      const mockOptions = { challenge: "auth-challenge" };
      const mockAuthResponse = { id: "credential-id" };
      const mockResult = {
        success: true,
        user: { id: "1", username: "testuser" },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              options: mockOptions,
              challenge: "auth-challenge",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResult),
        });

      mocks.mockStartAuthentication.mockResolvedValue(mockAuthResponse);

      const result = await authenticatePasskey();

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/api/auth/authenticate/begin",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      expect(result).toEqual(mockResult);
    });

    it("handles authentication options fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "User not found" }),
      });

      await expect(
        authenticatePasskey({ username: "nonexistent" })
      ).rejects.toThrow("User not found");
    });

    it("handles authentication verification error", async () => {
      const mockOptions = { challenge: "auth-challenge" };
      const mockAuthResponse = { id: "credential-id" };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              options: mockOptions,
              challenge: "auth-challenge",
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: "Invalid credential" }),
        });

      mocks.mockStartAuthentication.mockResolvedValue(mockAuthResponse);

      await expect(
        authenticatePasskey({ username: "testuser" })
      ).rejects.toThrow("Invalid credential");
    });
  });

  describe("signOut", () => {
    it("successfully signs out user", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await signOut();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
      });
      expect(window.location.href).toBe("/auth");
    });

    it("redirects to auth page even on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await signOut();

      expect(window.location.href).toBe("/auth");
      expect(console.error).toHaveBeenCalledWith(
        "Sign out error:",
        expect.any(Error)
      );
    });
  });

  describe("getCurrentSession", () => {
    it("returns session data when authenticated", async () => {
      const mockSession = { user: { id: "1", username: "testuser" } };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSession),
      });

      const result = await getCurrentSession();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/session");
      expect(result).toEqual(mockSession);
    });

    it("returns null when not authenticated", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await getCurrentSession();

      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getCurrentSession();

      expect(result).toBeNull();
    });
  });

  describe("isPasskeySupported", () => {
    it("returns true when passkeys are supported", () => {
      // PublicKeyCredential is already mocked in setup
      const result = isPasskeySupported();
      expect(result).toBe(true);
    });
  });

  describe("isPlatformAuthenticatorAvailable", () => {
    const mockIsUserVerifyingPlatformAuthenticatorAvailable = vi.fn();
    beforeEach(() => {
      global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
        mockIsUserVerifyingPlatformAuthenticatorAvailable;
    });
    it("returns true when platform authenticator is available", async () => {
      mockIsUserVerifyingPlatformAuthenticatorAvailable.mockResolvedValue(true);

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(true);
    });

    it("returns false when platform authenticator is not available", async () => {
      mockIsUserVerifyingPlatformAuthenticatorAvailable.mockResolvedValue(
        false
      );

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(false);
    });

    it("returns false when API throws error", async () => {
      mockIsUserVerifyingPlatformAuthenticatorAvailable.mockRejectedValue(
        new Error("API error")
      );

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(false);
    });
  });
});
