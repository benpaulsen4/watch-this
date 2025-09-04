import { db } from "@/lib/db";
import {
  userContentStatus,
  lists,
  listCollaborators,
  listItems,
} from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";

// Helper function to sync status updates to collaborators, returning a list of synced collaborator IDs
export async function syncStatusToCollaborators(
  userId: string,
  tmdbId: number,
  contentType: string,
  status: string
): Promise<string[]> {
  try {
    // Find all lists that contain this content and have sync enabled
    const syncEnabledLists = await db
      .select({
        listId: lists.id,
        ownerId: lists.ownerId,
      })
      .from(lists)
      .innerJoin(listItems, eq(listItems.listId, lists.id))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.syncWatchStatus, true),
          eq(listItems.tmdbId, tmdbId),
          eq(listItems.contentType, contentType),
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId))
        )
      );

    const syncedCollaboratorIds = new Set<string>();

    // For each sync-enabled list, update status for all collaborators
    for (const list of syncEnabledLists) {
      // Get all collaborators (including owner) for this list
      const collaborators = await db
        .select({ userId: listCollaborators.userId })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, list.listId));

      // Add the owner to the collaborators list
      const allUsers = [
        ...collaborators.map((c) => c.userId),
        list.ownerId,
      ].filter((id) => id !== userId); // Exclude the user who made the update

      // Update status for each collaborator
      for (const collaboratorId of allUsers) {
        // Check if collaborator already has a status for this content
        const existingStatus = await db
          .select()
          .from(userContentStatus)
          .where(
            and(
              eq(userContentStatus.userId, collaboratorId),
              eq(userContentStatus.tmdbId, tmdbId),
              eq(userContentStatus.contentType, contentType)
            )
          )
          .limit(1);

        if (existingStatus.length > 0) {
          // Update existing status
          await db
            .update(userContentStatus)
            .set({
              status,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userContentStatus.userId, collaboratorId),
                eq(userContentStatus.tmdbId, tmdbId),
                eq(userContentStatus.contentType, contentType)
              )
            );
        } else {
          // Create new status
          await db.insert(userContentStatus).values({
            userId: collaboratorId,
            tmdbId,
            contentType,
            status,
          });
        }
        syncedCollaboratorIds.add(collaboratorId);
      }
    }

    return Array.from(syncedCollaboratorIds);
  } catch (error) {
    console.error("Error syncing status to collaborators:", error);
    // Don't throw error to avoid breaking the main status update
    return [];
  }
}
