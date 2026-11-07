// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeyError } from "@/lib/auth/passkey-error";

const webauthn = {
  createChallengeToken: vi.fn(async () => "challenge-token"),
  createSessionToken: vi.fn(async () => "session-token"),
  generatePasskeyAuthenticationOptions: vi.fn(),
  generatePasskeyRegistrationOptions: vi.fn(),
  verifyChallengeToken: vi.fn(),
  verifyPasskeyAuthentication: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
};

vi.mock("@/lib/auth/webauthn", () => webauthn);

const registerBegin = await import("./route");
const registerVerify = await import("../verify/route");
const authenticateBegin = await import("../../authenticate/begin/route");
const authenticateVerify = await import("../../authenticate/verify/route");

const BASE = "http://localhost/api/auth";
const post = (path: string, body: unknown, cookie?: string) =>
  new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: JSON.stringify(body),
  });

const user = {
  id: "user-1",
  username: "sam",
  profilePictureUrl: null,
  timezone: "UTC",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/auth/register/begin", () => {
  it("returns options and sets the challenge cookie for the trimmed name", async () => {
    webauthn.generatePasskeyRegistrationOptions.mockResolvedValue({
      challenge: "abc",
    });
    const response = await registerBegin.POST(
      post("/register/begin", { username: "  sam  " }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "abc" },
    });
    expect(webauthn.generatePasskeyRegistrationOptions).toHaveBeenCalledWith(
      "sam",
    );
    expect(webauthn.createChallengeToken).toHaveBeenCalledWith("abc", {
      flow: "register",
      username: "sam",
    });
    expect(response.cookies.get("registration-challenge")?.value).toBe(
      "challenge-token",
    );
  });

  it.each([
    [{}, "Username is required"],
    [{ username: "  " }, "Username is required"],
    [
      { username: "a b" },
      "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens",
    ],
  ])("rejects %j with the username issue", async (body, error) => {
    const response = await registerBegin.POST(post("/register/begin", body));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe(error);
    expect(json.issues[0].path).toBe("username");
  });

  it("maps a taken username to 409 usernameTaken", async () => {
    webauthn.generatePasskeyRegistrationOptions.mockRejectedValue(
      new PasskeyError("usernameTaken", "Username already exists"),
    );
    const response = await registerBegin.POST(
      post("/register/begin", { username: "sam" }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Username already exists",
      code: "usernameTaken",
    });
  });
});

describe("POST /api/auth/register/verify", () => {
  const body = { username: "sam", registrationResponse: { id: "cred" } };

  it("creates the session and clears the challenge", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockResolvedValue({
      user,
      credential: { id: "cred-row", deviceName: "Laptop", createdAt: user.createdAt },
    });
    const response = await registerVerify.POST(
      post(
        "/register/verify",
        { ...body, timezone: "Australia/Brisbane", extra: "kept out" },
        "registration-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe("user-1");
    expect(response.cookies.get("session")?.value).toBe("session-token");
    expect(response.cookies.get("registration-challenge")?.value).toBe("");
    expect(webauthn.verifyPasskeyRegistration).toHaveBeenCalledWith(
      "sam",
      { id: "cred" },
      "abc",
      undefined,
      "Australia/Brisbane",
    );
  });

  it("requires the challenge cookie", async () => {
    const response = await registerVerify.POST(post("/register/verify", body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalidChallenge");
  });

  it.each([
    [{ username: "sam" }, "Missing required fields"],
    [{ username: "sam", registrationResponse: { noId: true } }, "Missing required fields"],
    [{ username: "sam", registrationResponse: { id: "" } }, "Missing required fields"],
    [{ ...body, deviceName: "x".repeat(101) }, "Device name must be 100 characters or less"],
    [{ ...body, timezone: "Mars/Olympus" }, "Invalid timezone"],
  ])("rejects %j", async (input, error) => {
    const response = await registerVerify.POST(
      post("/register/verify", input, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it.each([
    ["Username already exists", 409, "usernameTaken"],
    ["Registration verification failed", 400, "verificationFailed"],
  ] as const)("maps %s to %i", async (message, status, code) => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockRejectedValue(
      new PasskeyError(code, message),
    );
    const response = await registerVerify.POST(
      post("/register/verify", body, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("answers 500 Registration failed for anything else", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockRejectedValue(new Error("db down"));
    const response = await registerVerify.POST(
      post("/register/verify", body, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Registration failed");
  });

  // Only the code matters: an unrelated error that happens to share the text
  // is unexpected, so it is a 500 rather than a 409.
  it("ignores a plain error that only shares the message", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "abc" });
    webauthn.verifyPasskeyRegistration.mockRejectedValue(
      new Error("Username already exists"),
    );
    const response = await registerVerify.POST(
      post("/register/verify", body, "registration-challenge=challenge-token"),
    );
    expect(response.status).toBe(500);
  });
});

describe("authenticate", () => {
  it("begin returns options and sets the challenge cookie", async () => {
    webauthn.generatePasskeyAuthenticationOptions.mockResolvedValue({
      challenge: "xyz",
    });
    const response = await authenticateBegin.GET(
      new NextRequest(`${BASE}/authenticate/begin`),
    );
    await expect(response.json()).resolves.toEqual({
      options: { challenge: "xyz" },
    });
    expect(response.cookies.get("authentication-challenge")?.value).toBe(
      "challenge-token",
    );
  });

  it("verify signs in and sets the session cookie", async () => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "xyz" });
    webauthn.verifyPasskeyAuthentication.mockResolvedValue({
      user,
      credential: { id: "cred-row", deviceName: null, lastUsed: user.createdAt },
    });
    const response = await authenticateVerify.POST(
      post(
        "/authenticate/verify",
        { authenticationResponse: { id: "cred" } },
        "authentication-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.cookies.get("session")?.value).toBe("session-token");
  });

  it.each([
    ["Credential not found", 404, "credentialNotFound"],
    ["Authentication verification failed", 400, "verificationFailed"],
  ] as const)("verify maps %s to %i", async (message, status, code) => {
    webauthn.verifyChallengeToken.mockResolvedValue({ challenge: "xyz" });
    webauthn.verifyPasskeyAuthentication.mockRejectedValue(
      new PasskeyError(code, message),
    );
    const response = await authenticateVerify.POST(
      post(
        "/authenticate/verify",
        { authenticationResponse: { id: "cred" } },
        "authentication-challenge=challenge-token",
      ),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("verify rejects a missing response before touching the challenge", async () => {
    const response = await authenticateVerify.POST(
      post("/authenticate/verify", {}),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Missing required fields");
    expect(webauthn.verifyChallengeToken).not.toHaveBeenCalled();
  });
});
