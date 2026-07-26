import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/webauthn";

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
