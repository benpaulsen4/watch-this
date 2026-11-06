import { eq } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { updateSessionSchemas } from "@/lib/auth/schemas";
import type { SessionUser } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { NewUser, User, users } from "@/lib/db/schema";

function sessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    timezone: user.timezone,
    createdAt: user.createdAt,
    shareStatsWithCollaborators: user.shareStatsWithCollaborators,
  };
}

// GET /api/auth/session - the signed-in user. A missing or invalid session is
// a 401 from `withAuth`, which also clears an invalid session cookie.
export const GET = authedRoute(authApi.getSession, {}, ({ user }) => ({
  user: sessionUser(user),
}));

// PUT /api/auth/session - update the signed-in user's profile
export const PUT = authedRoute(
  authApi.updateSession,
  updateSessionSchemas,
  async ({ user, body }) => {
    const { username, profilePictureUrl, timezone, shareStatsWithCollaborators } =
      body;

    // Check if username is already taken (if username is being updated)
    if (username !== undefined && username !== user.username) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser.length > 0) return "usernameTaken";
    }

    const updateData: Partial<NewUser> = {
      updatedAt: new Date(),
    };
    if (username !== undefined) updateData.username = username;
    if (profilePictureUrl !== undefined) {
      updateData.profilePictureUrl = profilePictureUrl || null;
    }
    if (timezone !== undefined) updateData.timezone = timezone;
    if (shareStatsWithCollaborators !== undefined) {
      updateData.shareStatsWithCollaborators = shareStatsWithCollaborators;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    // The session was valid when this request started, but the account can be
    // deleted between authenticating and this UPDATE, leaving it matching no
    // rows. The wrapper answers 500 for a throw -- this only replaces an
    // opaque property-access TypeError with a message that says what happened.
    if (!updatedUser) {
      throw new Error(`Profile update matched no user row for id ${user.id}`);
    }

    return { success: true as const, user: sessionUser(updatedUser) };
  },
);
