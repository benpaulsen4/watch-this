import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { User as ClientUser } from "@/lib/auth/client";
import { getCurrentUser } from "@/lib/auth/webauthn";
import type { User as DbUser } from "@/lib/db";

/**
 * Resolves the signed-in user for a page in the authenticated route group, or
 * redirects to /auth when there is no valid session.
 *
 * This is the auth boundary for the group. It lives in the pages rather than in
 * a group layout because only the page knows the path to hand back to /auth as
 * `?redirect`, and because a layout that redirects would race the pages that
 * also have to narrow `user` to non-null before they can use it.
 */
export async function requireUser(pathname: string) {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) {
    redirect(`/auth?redirect=${encodeURIComponent(pathname)}`);
  }

  return user;
}

/**
 * Narrows a database user row to the shape client components consume, so a page
 * that has already resolved the session can hand it straight to a client
 * component instead of making it re-fetch `GET /api/auth/session`.
 *
 * Mirrors the projection in `src/app/api/auth/session/route.ts` field for field
 * -- the two must agree, or a component would see different data depending on
 * whether it was seeded by the server or refreshed by the client.
 *
 * `profilePictureUrl` is nullable in the database but typed as a string on the
 * client. Every consumer tests it for truthiness, so "" and null are already
 * interchangeable there; the API route only gets away with returning null
 * because its JSON response is untyped.
 */
export function toClientUser(user: DbUser): ClientUser {
  return {
    id: user.id,
    username: user.username,
    profilePictureUrl: user.profilePictureUrl ?? "",
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}
