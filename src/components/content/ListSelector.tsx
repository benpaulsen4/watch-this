"use client";

import { useMemo } from "react";
import {
  Globe,
  Minus,
  Plus,
  RotateCcw,
  Lock,
  Users,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { List } from "@/lib/db/schema";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ListSelectorProps {
  contentType: "movie" | "tv";
  contentId: number;
  title: string;
  posterPath?: string | null;
  currentListId?: string;
  onRemove?: () => void;
  className?: string;
}

export interface ListResult extends List {
  collaborators: number;
}

export function ListSelector({
  contentType,
  contentId,
  title,
  posterPath,
  currentListId,
  onRemove,
  className,
}: ListSelectorProps) {
  const queryClient = useQueryClient();
  const {
    data: listsData,
    isLoading,
    error,
  } = useQuery<{ lists: ListResult[] }>({
    queryKey: ["lists"],
    queryFn: async () => {
      const response = await fetch("/api/lists");
      if (!response.ok) throw new Error("Failed to fetch lists");
      return response.json();
    },
  });

  const { data: listsWithContentData } = useQuery<
    {
      listId: string;
      itemId: string;
    }[]
  >({
    queryKey: ["content", contentId, "lists"],
    queryFn: async () => {
      const response = await fetch(`/api/content/${contentId}/lists`);
      if (!response.ok) throw new Error("Failed to fetch lists for content");
      return response.json();
    },
  });

  const lists = listsData?.lists || [];
  const listsWithContent = useMemo(() => {
    const data = listsWithContentData || [];
    return data.reduce(
      (acc, list) => {
        acc[list.listId] = list.itemId;
        return acc;
      },
      {} as Record<string, string>,
    );
  }, [listsWithContentData]);

  // Filter lists based on content type
  const filteredLists = lists.filter((list) => {
    if (list.listType === "mixed") return true;
    if (contentType === "movie" && list.listType === "movies") return true;
    if (contentType === "tv" && list.listType === "tv") return true;
    return false;
  });

  const addToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: contentId,
          contentType,
          title,
          posterPath,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add content to list");
      }
      return { listId };
    },
    onSuccess: async ({ listId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["lists", listId, "items"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["content", contentId, "lists"],
      });
    },
  });

  const removeFromListMutation = useMutation({
    mutationFn: async ({
      listId,
      itemId,
    }: {
      listId: string;
      itemId: string;
    }) => {
      const response = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove content from list");
      }
      return { listId, itemId };
    },
    onSuccess: async ({ listId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["lists", listId, "items"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["content", contentId, "lists"],
      });
      if (listId === currentListId) onRemove?.();
    },
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <LoadingSpinner size="lg" text="Loading lists..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-6 text-center", className)}>
        <p className="text-red-400 mb-4">{(error as Error).message}</p>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["lists"] })}
          variant="outline"
          size="sm"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (filteredLists.length === 0) {
    return (
      <div className={cn("bg-gray-800 rounded-lg p-4", className)}>
        <div className="text-gray-300 text-sm mb-2">
          No compatible lists found. Create a{" "}
          {contentType === "movie" ? "movie" : "TV show"} or mixed list first.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold text-gray-100">Manage Lists</h3>

      {filteredLists.map((list) => {
        const isCurrentList = currentListId === list.id;
        const hasContent = Object.hasOwn(listsWithContent, list.id);
        const itemId = listsWithContent[list.id];

        return (
          <div
            key={list.id}
            className="bg-gray-800 rounded-lg border border-gray-700"
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-100">{list.name}</h4>
                  <div className="text-sm text-gray-400 flex items-center flex-wrap gap-1">
                    {list.listType === "mixed"
                      ? "Mixed"
                      : list.listType === "movies"
                        ? "Movies"
                        : "TV Shows"}
                    <span>&nbsp;•&nbsp;</span>
                    {list.isPublic ? (
                      <>
                        <Globe className="h-3 w-3" />
                        <span>Public</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" />
                        <span>Private</span>
                      </>
                    )}
                    {list.syncWatchStatus && (
                      <>
                        <span>&nbsp;•&nbsp;</span>
                        <div className="flex items-center gap-1">
                          <RefreshCw className="h-3 w-3" />
                          <span>Sync</span>
                        </div>
                      </>
                    )}
                    {list.collaborators > 0 && (
                      <>
                        <span>&nbsp;•&nbsp;</span>
                        <Users className="h-3 w-3" />
                        <span>{list.collaborators}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                  {isCurrentList && <Badge variant="info">Current</Badge>}
                  {hasContent && <Badge variant="success">Added</Badge>}
                  <div className="flex gap-1">
                    {hasContent ? (
                      <Button
                        onClick={() =>
                          removeFromListMutation.mutate({
                            listId: list.id,
                            itemId,
                          })
                        }
                        size="sm"
                        variant="outline"
                        className="text-sm"
                      >
                        <Minus /> &nbsp; Remove
                      </Button>
                    ) : (
                      <Button
                        onClick={() => addToListMutation.mutate(list.id)}
                        size="sm"
                        variant="outline"
                        className="text-sm"
                      >
                        <Plus /> &nbsp; Add
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
