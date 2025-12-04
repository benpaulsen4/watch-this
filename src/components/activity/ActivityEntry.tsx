"use client";

import { formatDistanceToNow } from "date-fns";
import { ProfileImage } from "@/components/ui/ProfileImage";
import { ActivityType } from "@/lib/db/schema";
import type { ActivityItem } from "@/lib/activity/types";

interface ActivityEntryProps {
  activity: ActivityItem;
  currentUsername: string;
}

export function ActivityEntry({
  activity,
  currentUsername,
}: ActivityEntryProps) {
  const getActivityDescription = (activity: ActivityItem) => {
    const metadata = activity.metadata as Record<string, string>;

    switch (activity.activityType) {
      case ActivityType.STATUS_CHANGED:
        return `marked "${metadata.title || "Unknown"}" as ${metadata.status}`;
      case ActivityType.EPISODE_PROGRESS:
        return `${metadata.watched ? "watched" : "marked not watched"} S${
          metadata.seasonNumber
        }E${metadata.episodeNumber} of "${metadata.title || "Unknown"}"`;
      case ActivityType.LIST_ITEM_ADDED:
        return `added "${metadata.title || "Unknown"}" to ${
          metadata.listName || "a list"
        }`;
      case ActivityType.LIST_ITEM_REMOVED:
        return `removed "${metadata.title || "Unknown"}" from ${
          metadata.listName || "a list"
        }`;
      case ActivityType.LIST_CREATED:
        return `created list "${metadata.listName || "Unknown"}"`;
      case ActivityType.LIST_UPDATED:
        return `updated list "${metadata.listName || "Unknown"}"`;
      case ActivityType.LIST_DELETED:
        return `deleted list "${metadata.listName || "Unknown"}"`;
      case ActivityType.COLLABORATOR_ADDED:
        return `added ${metadata.collaboratorUsername || "someone"} as ${
          metadata.permissionLevel || "collaborator"
        } to "${metadata.listName || "a list"}"`;
      case ActivityType.COLLABORATOR_REMOVED:
        return `removed ${metadata.collaboratorUsername || "someone"} from "${
          metadata.listName || "a list"
        }"`;
      case ActivityType.PROFILE_IMPORT:
        const lists = metadata.lists ? parseInt(metadata.lists) : 0;
        const contentStatus = metadata.contentStatus
          ? parseInt(metadata.contentStatus)
          : 0;
        const episodeStatus = metadata.episodeStatus
          ? parseInt(metadata.episodeStatus)
          : 0;
        const errors = metadata.errors ? parseInt(metadata.errors) : 0;

        const parts = [];
        if (lists > 0) parts.push(`${lists} list${lists === 1 ? "" : "s"}`);
        if (contentStatus > 0)
          parts.push(
            `${contentStatus} content status${contentStatus === 1 ? "" : "es"}`,
          );
        if (episodeStatus > 0)
          parts.push(
            `${episodeStatus} episode status${episodeStatus === 1 ? "" : "es"}`,
          );

        let result = `imported ${parts.join(", ")}`;
        if (errors > 0)
          result += ` (${errors} error${errors === 1 ? "" : "s"})`;

        return result || "imported profile data";
      case ActivityType.CLAIM_GENERATED:
        return `generated a device claim`;
      case ActivityType.CLAIM_CONSUMED:
        return `added a new passkey`;
      case ActivityType.PASSKEY_DELETED:
        return `deleted a passkey`;
      default:
        return "performed an action";
    }
  };

  const getProfileImages = (activity: ActivityItem) => {
    if (activity.isCollaborative && (activity.collaborators?.length ?? 0) > 0) {
      return (
        <div className="flex -space-x-4">
          <ProfileImage
            src={activity.user.profilePictureUrl}
            username={activity.user.username}
            size="sm"
          />
          {activity.collaborators!.slice(0, 3).map((collaborator) => (
            <ProfileImage
              key={collaborator.id}
              src={collaborator.profilePictureUrl}
              username={collaborator.username}
              size="sm"
            />
          ))}
        </div>
      );
    } else {
      return (
        <div>
          <ProfileImage
            src={activity.user.profilePictureUrl}
            username={activity.user.username}
            size="sm"
          />
        </div>
      );
    }
  };

  const getUsernameString = (
    activity: ActivityItem,
    currentUsername: string,
  ) => {
    const replaceWithYou = (username: string) =>
      username === currentUsername ? "you" : username;

    if (activity.isCollaborative && (activity.collaborators?.length ?? 0) > 0) {
      const collaborators = activity.collaborators!;
      let mainUser = replaceWithYou(activity.user.username);
      mainUser = mainUser.charAt(0).toUpperCase() + mainUser.slice(1);

      if (collaborators.length === 1) {
        return `${mainUser} and ${replaceWithYou(collaborators[0].username)}`;
      }

      if (collaborators.length <= 3) {
        const lastCollaborator = replaceWithYou(
          collaborators[collaborators.length - 1].username,
        );
        const otherCollaborators = collaborators
          .slice(0, -1)
          .map((c) => replaceWithYou(c.username))
          .join(", ");
        return `${mainUser}, ${otherCollaborators}, and ${lastCollaborator}`;
      }

      const shownCollaborators = collaborators
        .slice(0, 2)
        .map((c) => replaceWithYou(c.username))
        .join(", ");
      const remainingCount = collaborators.length - 2;
      return `${mainUser}, ${shownCollaborators}, and ${remainingCount} others`;
    } else {
      let mainUser = replaceWithYou(activity.user.username);
      mainUser = mainUser.charAt(0).toUpperCase() + mainUser.slice(1);
      return mainUser;
    }
  };

  // TODO make this consistent with other usages
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), {
    addSuffix: true,
  });

  return (
    <div className="flex items-center gap-2 mb-4">
      {getProfileImages(activity)}
      <p>
        <span className="font-bold">
          {getUsernameString(activity, currentUsername)}
        </span>
        &nbsp;
        <span>{getActivityDescription(activity)}</span>
        &nbsp;
        <span className="text-gray-500">{timeAgo}</span>
      </p>
    </div>
  );
}
