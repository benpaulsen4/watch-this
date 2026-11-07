// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineContract, schemas, type } from "./contract";
import { q } from "./query";

vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? { id: "user-1" } : null,
  ),
}));

const { authedRoute, publicRoute } = await import("./route");

const thingSchemas = {
  params: z.object({ id: z.string().min(2, "Bad id") }),
  query: z.object({ page: q.int({ message: "Bad page" }).optional() }),
  body: z.object({ name: z.string("Name is required") }),
};

const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]",
  label: "Post thing",
  status: 201,
  schemas: schemas<typeof thingSchemas>(),
  response: type<{ id: string; page?: number; name: string; userId?: string }>(),
  errors: { conflict: { status: 409, message: "Already exists" } },
});

function makeRequest({
  url = "http://localhost/api/things/abc",
  body = '{"name":"n"}',
  session = "valid",
}: { url?: string; body?: string; session?: string | null } = {}) {
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: session ? { cookie: `session=${session}` } : {},
  });
}

const ctx = (id = "abc") => ({ params: Promise.resolve({ id }) });

describe("authedRoute", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  const handler = authedRoute(
    postThing,
    thingSchemas,
    ({ user, params, query, body }) => ({
      id: params.id,
      page: query.page,
      name: body.name,
      userId: user.id,
    }),
  );

  it("passes parsed inputs and the user to the handler, with the contract's status", async () => {
    const response = await handler(
      makeRequest({ url: "http://localhost/api/things/abc?page=2" }),
      ctx(),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "abc",
      page: 2,
      name: "n",
      userId: "user-1",
    });
  });

  it("rejects an anonymous caller before validating anything", async () => {
    const response = await handler(
      makeRequest({ session: null, body: "{bad" }),
      ctx("x"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
      code: "unauthenticated",
    });
  });

  it("returns a 400 with issues for each kind of bad input", async () => {
    const badParams = await handler(makeRequest(), ctx("x"));
    expect(badParams.status).toBe(400);
    await expect(badParams.json()).resolves.toEqual({
      error: "Bad id",
      code: "validation",
      issues: [{ path: "id", message: "Bad id" }],
    });

    const badQuery = await handler(
      makeRequest({ url: "http://localhost/api/things/abc?page=2x" }),
      ctx(),
    );
    expect(badQuery.status).toBe(400);
    expect((await badQuery.json()).error).toBe("Bad page");

    const badBody = await handler(makeRequest({ body: "{}" }), ctx());
    expect(badBody.status).toBe(400);
    expect((await badBody.json()).issues).toEqual([
      { path: "name", message: "Name is required" },
    ]);
  });

  it("returns a 400, not a 500, for malformed JSON", async () => {
    const response = await handler(makeRequest({ body: "{bad" }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request body must be valid JSON",
      code: "validation",
    });
  });

  it("maps a returned string to the contract's error", async () => {
    const failing = authedRoute(
      postThing,
      thingSchemas,
      () => "conflict" as const,
    );
    const response = await failing(makeRequest(), ctx());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Already exists",
      code: "conflict",
    });
  });

  it("passes a NextResponse through untouched", async () => {
    const raw = authedRoute(postThing, thingSchemas, () => {
      const response = NextResponse.json({ id: "a", name: "n" });
      response.cookies.set("session", "new");
      return response;
    });
    const response = await raw(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect(response.cookies.get("session")?.value).toBe("new");
  });

  it("sends a thrown error to handleApiError using the label", async () => {
    const throwing = authedRoute(postThing, thingSchemas, () => {
      throw new Error("boom");
    });
    const response = await throwing(makeRequest(), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Post thing failed",
      code: "internal",
    });
  });

  it("applies options.headers to success, 401, and validation responses", async () => {
    const withHeader = authedRoute(
      postThing,
      thingSchemas,
      () => ({ id: "a", name: "n" }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
    const responses = await Promise.all([
      withHeader(makeRequest(), ctx()),
      withHeader(makeRequest({ session: null }), ctx()),
      withHeader(makeRequest(), ctx("x")),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 401, 400]);
    for (const response of responses) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});

describe("publicRoute", () => {
  it("runs without a session and has no user", async () => {
    const handler = publicRoute(postThing, thingSchemas, (inputs) => ({
      id: inputs.params.id,
      name: inputs.body.name,
      userId: "user" in inputs ? "leaked" : undefined,
    }));
    const response = await handler(makeRequest({ session: null }), ctx());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "abc", name: "n" });
  });

  it("works on a static route called with only a request", async () => {
    const getThings = defineContract({
      method: "GET",
      path: "/api/things",
      label: "Get things",
      response: type<{ ok: boolean }>(),
    });
    const handler = publicRoute(getThings, {}, () => ({ ok: true }));
    const response = await handler(
      new NextRequest("http://localhost/api/things"),
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
