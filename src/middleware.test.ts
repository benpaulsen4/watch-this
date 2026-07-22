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
