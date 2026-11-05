import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  api,
  ApiError,
  errorMessage,
  isApiError,
  shouldRetry,
} from "./client";
import { defineContract, schemas, type } from "./contract";

const _thingSchemas = {
  params: z.object({ id: z.string() }),
  query: z.object({ tag: z.array(z.string()).optional(), page: z.number().optional() }),
  body: z.object({ name: z.string() }).optional(),
};

const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]",
  label: "Post thing",
  schemas: schemas<typeof _thingSchemas>(),
  response: type<{ ok: boolean }>(),
  errors: { conflict: { status: 409, message: "Already exists" } },
});

const getThings = defineContract({
  method: "GET",
  path: "/api/things",
  label: "Get things",
  response: type<{ ok: boolean }>(),
});

const fetchMock = vi.fn<typeof fetch>();

function respondWith(status: number, body: string) {
  fetchMock.mockResolvedValue(new Response(body, { status }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("api", () => {
  it("fills the path, encodes params, and repeats array query keys", async () => {
    respondWith(200, '{"ok":true}');
    await api(postThing, {
      params: { id: "a/b" },
      query: { tag: ["x", "y"], page: undefined },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/things/a%2Fb?tag=x&tag=y",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends a body as JSON, and no body or header when there is none", async () => {
    respondWith(200, '{"ok":true}');
    await api(postThing, { params: { id: "1" }, body: { name: "n" } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "Content-Type": "application/json" },
      body: '{"name":"n"}',
    });

    fetchMock.mockClear();
    respondWith(200, '{"ok":true}');
    await api(getThings);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/things");
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("returns the parsed response and reads the body", async () => {
    const response = new Response('{"ok":true}', { status: 200 });
    fetchMock.mockResolvedValue(response);
    await expect(api(getThings)).resolves.toEqual({ ok: true });
    expect(response.bodyUsed).toBe(true);
  });

  it("throws ApiError with the code, status, message, and issues", async () => {
    respondWith(
      400,
      '{"error":"Bad","code":"validation","issues":[{"path":"name","message":"Bad"}]}',
    );
    const error = await api(getThings).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "validation",
      status: 400,
      message: "Bad",
      issues: [{ path: "name", message: "Bad" }],
    });
  });

  it("uses invalidResponse for a body with an error but no code", async () => {
    respondWith(500, '{"error":"Old route"}');
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 500,
      message: "Old route",
    });
  });

  it("uses invalidResponse for a non-JSON error page, and reads it", async () => {
    const response = new Response("<html>Bad gateway</html>", { status: 502 });
    fetchMock.mockResolvedValue(response);
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 502,
      message: "Get things failed",
    });
    expect(response.bodyUsed).toBe(true);
  });

  it("uses invalidResponse for a 200 that is not JSON", async () => {
    respondWith(200, "<html></html>");
    await expect(api(getThings)).rejects.toMatchObject({
      code: "invalidResponse",
      status: 200,
    });
  });

  it("uses network when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api(getThings)).rejects.toMatchObject({
      code: "network",
      status: 0,
    });
  });

  it("rethrows a cancellation as is, for React Query", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw abort;
    });
    await expect(
      api(getThings, {}, { signal: controller.signal }),
    ).rejects.toBe(abort);
  });
});

describe("isApiError", () => {
  it("accepts this contract's codes and the shared ones", () => {
    for (const code of ["conflict", "validation", "network", "invalidResponse"]) {
      expect(isApiError(new ApiError(code, 400, "x"), postThing)).toBe(true);
    }
  });

  it("rejects another contract's code and other errors", () => {
    expect(isApiError(new ApiError("other", 400, "x"), postThing)).toBe(false);
    expect(isApiError(new Error("x"), postThing)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("uses an Error's message, otherwise the fallback", () => {
    expect(errorMessage(new ApiError("x", 400, "Server says"), "f")).toBe(
      "Server says",
    );
    expect(errorMessage("nope", "fallback")).toBe("fallback");
  });
});

describe("shouldRetry", () => {
  it("retries once for network, 5xx, and unknown errors", () => {
    for (const error of [
      new ApiError("network", 0, "x"),
      new ApiError("internal", 500, "x"),
      new Error("x"),
    ]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(false);
    }
  });

  it("never retries a 4xx", () => {
    expect(shouldRetry(0, new ApiError("validation", 400, "x"))).toBe(false);
    expect(shouldRetry(0, new ApiError("rateLimited", 429, "x"))).toBe(false);
  });
});
