"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusSegmentedSelector } from "@/components/content/StatusSegmentedSelector";
import { WatchStatusEnum, ListTypeEnum } from "@/lib/db/schema";

interface ListFiltersProps {
  listType: ListTypeEnum;
}

export function ListFilters({ listType }: ListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (params: Record<string, string | string[] | null>) => {
      const newSearchParams = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(params)) {
        if (value === null) {
          newSearchParams.delete(key);
        } else if (Array.isArray(value)) {
          newSearchParams.delete(key);
          value.forEach((v) => newSearchParams.append(key, v));
        } else {
          newSearchParams.set(key, value);
        }
      }

      return newSearchParams.toString();
    },
    [searchParams]
  );

  const currentSortOrder =
    searchParams.get("sortOrder") === "descending" ? "descending" : "ascending";
  const currentWatchStatuses = searchParams.getAll("watchStatus") as (
    | WatchStatusEnum
    | "none"
  )[];

  const handleStatusChange = (statuses: (WatchStatusEnum | "none")[]) => {
    // If empty, we can remove the param to imply "all".
    if (statuses.length === 0) {
      router.push(`${pathname}?${createQueryString({ watchStatus: null })}`);
    } else {
      router.push(
        `${pathname}?${createQueryString({ watchStatus: statuses })}`
      );
    }
  };

  const toggleSortOrder = () => {
    const newOrder =
      currentSortOrder === "ascending" ? "descending" : "ascending";
    router.push(`${pathname}?${createQueryString({ sortOrder: newOrder })}`);
  };

  const contentType = listType === "movies" ? "movie" : undefined;

  return (
    <div className="flex flex-row items-center justify-between gap-4 mb-6">
      <StatusSegmentedSelector
        value={currentWatchStatuses}
        onValueChange={handleStatusChange}
        multiple={true}
        includeNone={true}
        size="sm"
        contentType={contentType}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSortOrder}
        className="flex items-center gap-2 text-gray-400 hover:text-white"
      >
        <span>
          {currentSortOrder === "ascending" ? "Oldest first" : "Newest first"}
        </span>
        {currentSortOrder === "ascending" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
