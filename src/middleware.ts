import { NextRequest, NextResponse } from "next/server";

/**
 * IP-based rate limiting for authentication and admin endpoints.
 *
 * NOTE ON DURABILITY: this uses a best-effort in-memory store scoped to a
 * single runtime instance. On serverless/edge platforms (e.g. Vercel) each
 * instance has its own memory and instances scale horizontally, so this does
 * NOT provide global enforcement -- an attacker spread across instances, or a
 * cold start, resets the counters. For durable, cluster-wide limiting, swap
 * `inMemoryLimiter` for a shared-store implementation (e.g. Upstash Redis or
 * `@upstash/ratelimit`) that satisfies the same `RateLimiter` interface below.
 * The middleware body does not care which implementation is used.
 */

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry, when not allowed. */
  retryAfter: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter kept in a module-level Map. Entries are lazily expired
 * on access; a periodic sweep bounds memory for keys that stop being seen.
 */
export function createInMemoryLimiter(): RateLimiter {
  const buckets = new Map<string, WindowState>();
  let lastSweep = Date.now();

  function sweep(now: number) {
    // Amortized cleanup: at most once per minute, drop expired windows.
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(key, limit, windowMs) {
      const now = Date.now();
      sweep(now);

      const state = buckets.get(key);
      if (!state || state.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfter: 0 };
      }

      if (state.count >= limit) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
        };
      }

      state.count += 1;
      return { allowed: true, retryAfter: 0 };
    },
  };
}

// Swap this single binding to change the backing store (see note above).
const limiter: RateLimiter = createInMemoryLimiter();

// Per-endpoint-group limits. Auth endpoints guard passkey/registration flows;
// admin endpoints guard privileged device-claim issuance.
const RULES: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/auth/", limit: 20, windowMs: 60_000 },
  { prefix: "/api/admin/", limit: 10, windowMs: 60_000 },
];

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // First entry is the originating client.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rule = RULES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const ip = getClientIp(request);
  const key = `${rule.prefix}:${ip}`;
  const result = limiter.check(key, rule.limit, rule.windowMs);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/admin/:path*"],
};
