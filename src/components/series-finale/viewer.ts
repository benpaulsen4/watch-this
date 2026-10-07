import type { User } from "@/lib/auth/client";

/**
 * The signed-in user as the recap and the story show them. The page resolves
 * it and passes it down: the payload carries no username of its own.
 */
export type Viewer = Pick<User, "username" | "profilePictureUrl">;
