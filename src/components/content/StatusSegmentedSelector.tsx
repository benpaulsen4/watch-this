"use client";

import { ContentTypeEnum,WatchStatusEnum } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

import { getAvailableStatuses, getStatusConfig } from "./StatusBadge";

export interface StatusSegmentedSelectorProps {
  value: WatchStatusEnum | (WatchStatusEnum | "none")[] | null;
  contentType?: ContentTypeEnum;
  onValueChange: (status: any) => void;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm" | "lg";
  multiple?: boolean;
  includeNone?: boolean;
}

/**
 * StatusSegmentedSelector component for selecting watch status with segmented radio button interface
 *
 * @param value - Current selected status
 * @param contentType - Content type (movie/tv) to determine available statuses. If not provided, shows all statuses.
 * @param onValueChange - Callback when status changes
 * @param disabled - Whether the selector is disabled
 * @param className - Additional CSS classes
 * @param size - Size variant
 * @param multiple - Whether to allow multiple selection
 * @param includeNone - Whether to include "None" option
 */
export function StatusSegmentedSelector({
  value,
  contentType,
  onValueChange,
  disabled = false,
  className,
  size = "default",
  multiple = false,
  includeNone = false,
}: StatusSegmentedSelectorProps) {
  let availableStatuses: (WatchStatusEnum | "none")[] = contentType
    ? getAvailableStatuses(contentType)
    : ["planning", "watching", "paused", "completed", "dropped"];

  if (includeNone) {
    availableStatuses = ["none", ...availableStatuses];
  }

  // Color mapping for status indicators
  const statusColors = {
    planning: "bg-yellow-400",
    watching: "bg-green-400",
    paused: "bg-orange-400",
    completed: "bg-blue-400",
    dropped: "bg-red-400",
    none: "bg-gray-400",
  } as const;

  const sizeClasses = {
    sm: {
      container: "p-1",
      button: "px-2 py-1 text-xs min-h-[24px]",
      text: "text-xs",
    },
    default: {
      container: "p-1",
      button: "px-3 py-1.5 text-sm min-h-[32px]",
      text: "text-sm",
    },
    lg: {
      container: "p-1.5",
      button: "px-4 py-2 text-base min-h-[40px]",
      text: "text-base",
    },
  };

  const handleStatusChange = (status: WatchStatusEnum | "none") => {
    if (disabled) return;

    if (multiple) {
      const currentValues = (Array.isArray(value) ? value : []) as (
        | WatchStatusEnum
        | "none"
      )[];
      const isSelected = currentValues.includes(status);
      let newValues;
      if (isSelected) {
        newValues = currentValues.filter((v) => v !== status);
      } else {
        newValues = [...currentValues, status];
      }
      onValueChange(newValues);
    } else {
      if (status !== "none") {
        onValueChange(status as WatchStatusEnum);
      }
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    status: WatchStatusEnum | "none"
  ) => {
    if (disabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleStatusChange(status);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex flex-wrap bg-gray-800 border border-gray-600 rounded-lg",
        "focus-within:ring-2 focus-within:ring-red-500 focus-within:border-transparent",
        "justify-center sm:justify-start",
        disabled && "opacity-50 cursor-not-allowed",
        sizeClasses[size].container,
        className
      )}
      role={multiple ? "group" : "radiogroup"}
      aria-label={`Select watch status${
        contentType ? ` for ${contentType}` : ""
      }`}
    >
      {availableStatuses.map((status) => {
        const config =
          status === "none"
            ? { label: "None", description: "No status", variant: "default" }
            : getStatusConfig(status as WatchStatusEnum);

        const isSelected = multiple
          ? Array.isArray(value) && value.includes(status)
          : value === status;

        return (
          <button
            key={status}
            type="button"
            onClick={() => handleStatusChange(status)}
            onKeyDown={(e) => handleKeyDown(e, status)}
            disabled={disabled}
            className={cn(
              "relative flex items-center justify-center gap-1.5",
              "rounded-md transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800",
              "disabled:cursor-not-allowed",
              sizeClasses[size].button,
              isSelected
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            )}
            role={multiple ? "checkbox" : "radio"}
            aria-checked={isSelected}
            aria-label={`${config?.label || status} status${
              config?.description ? `: ${config.description}` : ""
            }`}
          >
            {config && (
              <>
                <span
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    isSelected
                      ? "bg-white"
                      : statusColors[status as keyof typeof statusColors]
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn("font-medium truncate", sizeClasses[size].text)}
                >
                  {config.label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default StatusSegmentedSelector;
