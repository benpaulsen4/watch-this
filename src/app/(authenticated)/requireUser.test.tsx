import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/webauthn";

import ActivityPage from "./activity/page";
import DashboardPage from "./dashboard/page";
import ListDetailsPage from "./lists/[id]/page";
import ArchivedListsPage from "./lists/archived/page";
import ListsPage from "./lists/page";
import ProfilePage from "./profile/page";
import { requireUser } from "./requireUser";
import SearchPage from "./search/page";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/webauthn", () => ({ getCurrentUser: vi.fn() }));

// Everything below reaches the database or TMDB at import time, and none of it
// runs on the unauthenticated path these tests exercise.
vi.mock("@/lib/lists/service", () => ({
  getList: vi.fn(),
  listArchivedLists: vi.fn(),
  listLists: vi.fn(),
}));
vi.mock("@/lib/tmdb/client", () => ({
  tmdbClient: { getMovieGenres: vi.fn(), getTVGenres: vi.fn() },
}));
vi.mock("@/components/content/TrendingStrip", () => ({ default: () => null }));
vi.mock("@/components/activity/ActivityFeed", () => ({
  ActivityFeed: () => null,
}));
vi.mock("@/components/activity/ActivityTimelineClient", () => ({
  ActivityTimelineClient: () => null,
}));
vi.mock("@/components/lists/ListFilters", () => ({ ListFilters: () => null }));
vi.mock("@/components/lists/ListHeader", () => ({ default: () => null }));
vi.mock("@/components/lists/ListItems", () => ({ default: () => null }));
vi.mock("@/components/lists/ListRecommendations", () => ({
  default: () => null,
}));
vi.mock("@/components/lists/ListsClient", () => ({ default: () => null }));
vi.mock("@/components/profile/ProfileClient", () => ({
  ProfileClient: () => null,
}));
vi.mock("@/components/search/SearchClient", () => ({ SearchClient: () => null }));

const signedInUser = { id: "u1", username: "alice" };

beforeEach(() => {
  vi.clearAllMocks();
  (cookies as any).mockResolvedValue({ get: () => ({ value: "token" }) });
  // The real `redirect` throws to unwind the render, and the pages rely on that
  // to narrow `user` to non-null, so the double has to throw too.
  (redirect as any).mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("requireUser", () => {
  it("returns the resolved user when the session is valid", async () => {
    (getCurrentUser as any).mockResolvedValue(signedInUser);

    await expect(requireUser("/dashboard")).resolves.toEqual(signedInUser);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /auth with the caller's path when there is no session", async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    await expect(requireUser("/lists/abc")).rejects.toThrow(
      "NEXT_REDIRECT:/auth?redirect=%2Flists%2Fabc",
    );
  });

  it("passes the session cookie through to getCurrentUser", async () => {
    (getCurrentUser as any).mockResolvedValue(signedInUser);

    await requireUser("/dashboard");

    expect(getCurrentUser).toHaveBeenCalledWith("token");
  });
});

// UI-09: these pages used to return the bare string "Refresh if this page does
// not go away" (or `null`) as their entire render output for a signed-out
// visitor. Every one of them must redirect instead.
describe("authenticated pages with no session", () => {
  beforeEach(() => {
    (getCurrentUser as any).mockResolvedValue(null);
  });

  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ["dashboard", () => DashboardPage(), "%2Fdashboard"],
    ["lists", () => ListsPage(), "%2Flists"],
    ["archived lists", () => ArchivedListsPage(), "%2Flists%2Farchived"],
    [
      "list details",
      () =>
        ListDetailsPage({
          params: Promise.resolve({ id: "list-1" }),
          searchParams: Promise.resolve({}),
        }),
      "%2Flists%2Flist-1",
    ],
    ["search", () => SearchPage(), "%2Fsearch"],
    ["activity", () => ActivityPage(), "%2Factivity"],
    ["profile", () => ProfilePage(), "%2Fprofile"],
  ];

  it.each(cases)("%s redirects to /auth", async (_name, run, encodedPath) => {
    await expect(run()).rejects.toThrow(
      `NEXT_REDIRECT:/auth?redirect=${encodedPath}`,
    );
  });

  // Deleting the client-gated group layout removed the only group-wide gate:
  // `src/middleware.ts` rate-limits /api/auth and /api/admin and does not touch
  // page routes, so every page in this group is now individually responsible for
  // calling requireUser. The `cases` list above is hand-written, so an eighth
  // page would ship unguarded and nothing above would fail.
  //
  // This walks the group and fails if it finds a page the list does not cover.
  // It turns "someone remembered" into something CI checks.
  it("covers every page in the route group", () => {
    const groupRoot = __dirname;

    const pageFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx") pageFiles.push(full);
      }
    };
    walk(groupRoot);

    // Normalise to a route path: strip the group root, drop "/page.tsx", and
    // leave dynamic segments as their bracket form.
    const discovered = pageFiles
      .map((file) =>
        file
          .slice(groupRoot.length)
          .replace(/\\/g, "/")
          .replace(/\/page\.tsx$/, ""),
      )
      .map((route) => (route === "" ? "/" : route))
      .sort();

    const covered = [
      "/activity",
      "/dashboard",
      "/lists",
      "/lists/[id]",
      "/lists/archived",
      "/profile",
      "/search",
    ].sort();

    expect(discovered).toEqual(covered);
  });

  // The same guarantee from the other direction: a page could call requireUser
  // and ignore what it returns (which /profile did until it started passing the
  // user down), but a page that never calls it at all cannot be guarded.
  it("calls requireUser from every page in the route group", () => {
    const groupRoot = __dirname;

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name === "page.tsx" ? [full] : [];
      });

    const missing = walk(groupRoot).filter(
      (file) => !readFileSync(file, "utf8").includes("requireUser("),
    );

    expect(missing).toEqual([]);
  });
});
