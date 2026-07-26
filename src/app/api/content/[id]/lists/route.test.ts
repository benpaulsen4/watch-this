// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Records the conditions the handler builds so we can assert that content type
// is part of the filter, without standing up a real database.
const recorded: { conditions: unknown[] } = { conditions: [] };

vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: (condition: unknown) => {
      recorded.conditions.push(condition);
      return Promise.resolve([{ listId: "list-1", itemId: "item-1" }]);
    },
  };
  return { db: { select: () => chain } };
});

vi.mock("@/lib/db/schema", () => ({
  listCollaborators: { listId: "lc.listId", userId: "lc.userId" },
  listItems: {
    id: "li.id",
    listId: "li.listId",
    tmdbId: "li.tmdbId",
    contentType: "li.contentType",
  },
  lists: { id: "l.id", ownerId: "l.ownerId" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ op: "and", parts }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  or: (...parts: unknown[]) => ({ op: "or", parts }),
}));

// withAuth is exercised by its own middleware; here we only need the handler.
vi.mock("@/lib/auth/api-middleware", () => ({
  withAuth: (handler: unknown) => handler,
}));

const { GET } = await import("./route");

function request(url: string) {
  return { url, user: { id: "user-1" } } as never;
}

function flatten(condition: unknown): unknown[] {
  if (
    condition &&
    typeof condition === "object" &&
    "parts" in (condition as Record<string, unknown>)
  ) {
    return (condition as { parts: unknown[] }).parts.flatMap(flatten);
  }
  return [condition];
}

describe("GET /api/content/[id]/lists", () => {
  beforeEach(() => {
    recorded.conditions = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a non-numeric content id", async () => {
    const response = await GET(
      request("http://localhost/api/content/abc/lists?contentType=movie"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid content ID",
    });
  });

  // UI-05: without the content type the query matched on tmdbId alone, so it
  // returned the movie's row for a show with the same id - producing an "Added"
  // badge for a list the title was never in, and a Remove that deleted the
  // unrelated row.
  it("requires a content type", async () => {
    const response = await GET(
      request("http://localhost/api/content/550/lists"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid content type",
    });
    expect(recorded.conditions).toHaveLength(0);
  });

  it("rejects a content type that is not movie or tv", async () => {
    const response = await GET(
      request("http://localhost/api/content/550/lists?contentType=book"),
    );

    expect(response.status).toBe(400);
    expect(recorded.conditions).toHaveLength(0);
  });

  it("filters on both tmdb id and content type", async () => {
    const response = await GET(
      request("http://localhost/api/content/550/lists?contentType=tv"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { listId: "list-1", itemId: "item-1" },
    ]);

    const leaves = flatten(recorded.conditions[0]);
    expect(leaves).toContainEqual({
      op: "eq",
      column: "li.tmdbId",
      value: 550,
    });
    expect(leaves).toContainEqual({
      op: "eq",
      column: "li.contentType",
      value: "tv",
    });
  });
});
