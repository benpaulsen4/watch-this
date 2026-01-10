import {
  ContentTypeEnum,
  MovieWatchStatusEnum,
  TVWatchStatusEnum,
  WatchStatusEnum,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";

import { Badge } from "../ui/Badge";

interface StatusBadgeProps {
  status: WatchStatusEnum;
  contentType?: ContentTypeEnum;
  className?: string;
  size?: "default" | "sm" | "lg";
}

// Status display configuration
const statusConfig = {
  planning: {
    label: "Planning",
    variant: "planning" as const,
    description: "Planning to watch",
  },
  watching: {
    label: "Watching",
    variant: "watching" as const,
    description: "Currently watching",
  },
  paused: {
    label: "Paused",
    variant: "paused" as const,
    description: "Temporarily paused",
  },
  completed: {
    label: "Completed",
    variant: "completed" as const,
    description: "Finished watching",
  },
  dropped: {
    label: "Dropped",
    variant: "dropped" as const,
    description: "Stopped watching",
  },
} as const;

/**
 * StatusBadge component for displaying watch status with appropriate styling
 *
 * @param status - The watch status to display
 * @param contentType - Optional content type for validation (movie/tv)
 * @param className - Additional CSS classes
 * @param size - Badge size variant
 */
export function StatusBadge({
  status,
  contentType,
  className,
  size = "default",
}: StatusBadgeProps) {
  const config = statusConfig[status];

  if (!config) {
    console.warn(`Unknown status: ${status}`);
    return (
      <Badge
        variant="outline"
        size={size}
        className={cn("capitalize", className)}
        title="Unknown status"
      >
        {status}
      </Badge>
    );
  }

  // Validate status for content type
  if (contentType === "movie") {
    const validMovieStatuses: MovieWatchStatusEnum[] = [
      "planning",
      "completed",
    ];
    if (!validMovieStatuses.includes(status as MovieWatchStatusEnum)) {
      console.warn(`Invalid movie status: ${status}`);
    }
  } else if (contentType === "tv") {
    const validTVStatuses: TVWatchStatusEnum[] = [
      "planning",
      "watching",
      "paused",
      "completed",
      "dropped",
    ];
    if (!validTVStatuses.includes(status as TVWatchStatusEnum)) {
      console.warn(`Invalid TV status: ${status}`);
    }
  }

  return (
    <Badge
      variant={config.variant}
      size={size}
      className={cn("select-none", className)}
      title={config.description}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Get available statuses for a given content type
 *
 * @param contentType - The content type (movie/tv)
 * @returns Array of valid status options
 */
export function getAvailableStatuses(
  contentType: ContentTypeEnum,
): WatchStatusEnum[] {
  if (contentType === "movie") {
    return ["planning", "completed"];
  } else if (contentType === "tv") {
    return ["planning", "watching", "paused", "completed", "dropped"];
  }
  return [];
}

/**
 * Get status configuration for display purposes
 *
 * @param status - The watch status
 * @returns Status configuration object or null
 */
export function getStatusConfig(status: WatchStatusEnum) {
  return statusConfig[status] || null;
}

/**
 * Check if a status is valid for a given content type
 *
 * @param status - The watch status to validate
 * @param contentType - The content type (movie/tv)
 * @returns Boolean indicating if the status is valid
 */
export function isValidStatusForContentType(
  status: WatchStatusEnum,
  contentType: ContentTypeEnum,
): boolean {
  const availableStatuses = getAvailableStatuses(contentType);
  return availableStatuses.includes(status);
}
