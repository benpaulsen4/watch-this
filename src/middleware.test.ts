import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryLimiter } from "./middleware";

describe("in-memory rate limiter (AUTH-05)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit then blocks", () => {
    const limiter = createInMemoryLimiter();
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("ip-a", 3, 60_000).allowed).toBe(true);
    }
    const blocked = limiter.check("ip-a", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks distinct keys independently", () => {
    const limiter = createInMemoryLimiter();
    expect(limiter.check("ip-a", 1, 60_000).allowed).toBe(true);
    expect(limiter.check("ip-a", 1, 60_000).allowed).toBe(false);
    // A different key is unaffected.
    expect(limiter.check("ip-b", 1, 60_000).allowed).toBe(true);
  });

  it("resets the window after it elapses", () => {
    const limiter = createInMemoryLimiter();
    expect(limiter.check("ip-a", 1, 60_000).allowed).toBe(true);
    expect(limiter.check("ip-a", 1, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("ip-a", 1, 60_000).allowed).toBe(true);
  });
});

describe("middleware rate-limit keying (AUTH-05 bypass regression)", () => {
  // The middleware holds a module-level limiter, so give each test a fresh one.
  beforeEach(() => {
    vi.resetModules();
  });

  function authRequest(headers: Record<string, string>) {
    return new NextRequest(
      "https://example.com/api/auth/authenticate/verify",
      { headers },
    );
  }

  it("cannot be bypassed by rotating the client-controlled X-Forwarded-For", async () => {
    const { middleware } = await import("./middleware");
    const limit = 20; // the "/api/auth/" rule

    // One real client (fixed x-real-ip, which Vercel sets at its edge and the
    // client cannot forge) rotating a forged X-Forwarded-For on every request.
    // The old code keyed on the left-most XFF entry, so each of these got a
    // fresh bucket and the limiter never tripped. The key must ignore XFF.
    let lastStatus = 0;
    for (let i = 0; i <= limit; i++) {
      lastStatus = middleware(
        authRequest({
          "x-forwarded-for": `1.2.3.${i}, 10.0.0.1`,
          "x-real-ip": "203.0.113.7",
        }),
      ).status;
    }

    expect(lastStatus).toBe(429);
  });

  it("keys buckets off the trusted platform IP, not the forwarded chain", async () => {
    const { middleware } = await import("./middleware");
    const limit = 20;

    // Exhaust the bucket for one trusted IP...
    for (let i = 0; i <= limit; i++) {
      middleware(authRequest({ "x-real-ip": "203.0.113.7" }));
    }
    expect(
      middleware(authRequest({ "x-real-ip": "203.0.113.7" })).status,
    ).toBe(429);

    // ...a genuinely different client is unaffected.
    expect(
      middleware(authRequest({ "x-real-ip": "203.0.113.8" })).status,
    ).not.toBe(429);
  });
});
