// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TMDBHttpError } from "@/lib/tmdb/client";
import { routeContext } from "@/test/route-context";

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) => {
    if (token === "throw") throw new Error("db down");
    return token === "valid" ? { id: "user-1" } : null;
  }),
}));

const { handleApiError, withAuth } = await import("./api-middleware");

function tmdbError(status: number): TMDBHttpError {
  const error = new Error(`TMDB API error: ${status} Nope`) as TMDBHttpError;
  error.status = status;
  return error;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("handleApiError", () => {
  it("returns 429 rateLimited for a TMDB 429", async () => {
    const response = handleApiError(tmdbError(429), "Search");
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Rate limit exceeded. Please try again later.",
      code: "rateLimited",
    });
  });

  it.each([404, 500, 503])(
    "returns 503 upstreamUnavailable for a TMDB %i",
    async (status) => {
      const response = handleApiError(tmdbError(status), "Search");
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "External service unavailable",
        code: "upstreamUnavailable",
      });
    },
  );

  it("returns 500 internal with the context for anything else", async () => {
    const response = handleApiError(new Error("boom"), "Search");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Search failed",
      code: "internal",
    });
  });
});

describe("withAuth", () => {
  const request = (session?: string) =>
    new NextRequest("http://localhost/api/x", {
      headers: session ? { cookie: `session=${session}` } : {},
    });

  it("forwards the route context to the handler", async () => {
    const handler = withAuth(async (_request, context) =>
      NextResponse.json(await context.params),
    );
    const response = await handler(request("valid"), routeContext({ id: "abc" }));
    await expect(response.json()).resolves.toEqual({ id: "abc" });
  });

  it("gives the handler empty params when called with only a request", async () => {
    const handler = withAuth(async (_request, context) =>
      NextResponse.json(await context.params),
    );
    const response = await handler(request("valid"));
    await expect(response.json()).resolves.toEqual({});
  });

  it("adds a code to each auth failure", async () => {
    const handler = withAuth(() => NextResponse.json({}));

    const missing = await handler(request());
    expect(await missing.json()).toEqual({
      error: "Authentication required",
      code: "unauthenticated",
    });

    const invalid = await handler(request("bad"));
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      error: "Invalid session",
      code: "invalidSession",
    });
    expect(invalid.cookies.get("session")?.value).toBe("");

    const failed = await handler(request("throw"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      error: "Authentication failed",
      code: "internal",
    });
  });
});
