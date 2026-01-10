import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/webauthn";
import { db } from "@/lib/db";
import { NewUser, users } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    const user = await getCurrentUser(sessionToken);

    if (!user) {
      // Clear invalid session cookie
      const response = NextResponse.json(
        { error: "Invalid session" },
        { status: 401 },
      );
      response.cookies.delete("session");
      return response;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Session check error:", error);

    return NextResponse.json(
      { error: "Failed to check session" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    const user = await getCurrentUser(sessionToken);

    if (!user) {
      const response = NextResponse.json(
        { error: "Invalid session" },
        { status: 401 },
      );
      response.cookies.delete("session");
      return response;
    }

    const body = await request.json();
    const { username, profilePictureUrl, timezone } = body;

    // Validate input
    if (username !== undefined) {
      if (typeof username !== "string" || username.trim().length === 0) {
        return NextResponse.json(
          { error: "Username must be a non-empty string" },
          { status: 400 },
        );
      }
      // Validate username format
      const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
      if (!usernameRegex.test(username.trim())) {
        return NextResponse.json(
          {
            error:
              "Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens",
          },
          { status: 400 },
        );
      }
    }

    if (profilePictureUrl !== undefined) {
      if (profilePictureUrl !== null && typeof profilePictureUrl !== "string") {
        return NextResponse.json(
          { error: "Profile picture URL must be a string or null" },
          { status: 400 },
        );
      }
      if (profilePictureUrl && profilePictureUrl.length > 500) {
        return NextResponse.json(
          { error: "Profile picture URL must be 500 characters or less" },
          { status: 400 },
        );
      }
      // Basic URL validation
      if (profilePictureUrl && profilePictureUrl.trim()) {
        try {
          new URL(profilePictureUrl);
        } catch {
          return NextResponse.json(
            { error: "Profile picture URL must be a valid URL" },
            { status: 400 },
          );
        }
      }
    }

    // Validate timezone if provided
    if (timezone !== undefined) {
      if (typeof timezone !== "string" || timezone.trim().length === 0) {
        return NextResponse.json(
          { error: "Timezone must be a non-empty string" },
          { status: 400 },
        );
      }
      if (timezone.length > 100) {
        return NextResponse.json(
          { error: "Timezone must be 100 characters or less" },
          { status: 400 },
        );
      }
      try {
        // Validate via Intl API
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(
          new Date(),
        );
      } catch {
        return NextResponse.json(
          { error: "Invalid timezone" },
          { status: 400 },
        );
      }
    }

    // Check if username is already taken (if username is being updated)
    if (username !== undefined && username !== user.username) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser.length > 0) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 409 },
        );
      }
    }

    // Update user profile
    const updateData: Partial<NewUser> = {
      updatedAt: new Date(),
    };

    if (username !== undefined) {
      updateData.username = username;
    }

    if (profilePictureUrl !== undefined) {
      updateData.profilePictureUrl = profilePictureUrl || null;
    }

    if (timezone !== undefined) {
      updateData.timezone = timezone;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        profilePictureUrl: updatedUser.profilePictureUrl,
        timezone: updatedUser.timezone,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
