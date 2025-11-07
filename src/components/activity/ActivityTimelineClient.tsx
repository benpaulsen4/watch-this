"use client";

import { useCallback, useMemo } from "react";
import { ActivityEntry } from "./ActivityEntry";
import { Button } from "@/components/ui/Button";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { TMDBTVShow } from "@/lib/tmdb/client";
import { useUser } from "../providers/AuthProvider";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { useInfiniteQuery } from "@tanstack/react-query";

interface UserStub {
  id: string;
  username: string;
  profilePictureUrl?: string | null;
}

export interface Activity {
  id: string;
  activityType: string;
  user: UserStub;
  tmdbId?: number;
  contentType?: string;
  listId?: string;
  metadata?: Record<string, unknown>;
  isCollaborative: boolean;
  collaborators?: UserStub[];
  createdAt: string;
}

export interface UpcomingActivity extends TMDBTVShow {
  scheduleId: string;
}

export interface ActivityResponse {
  activities: Activity[];
  upcoming?: UpcomingActivity[];
  hasMore: boolean;
  nextCursor?: string;
}

export function ActivityTimelineClient() {
  const user = useUser();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["activity", "timeline"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam as string);
      const response = await fetch(`/api/activity?${params}`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  const activities = useMemo(() => {
    const pages = (data?.pages || []) as Array<{ activities?: Activity[] }>;
    return pages.flatMap((p) => p.activities || []);
  }, [data?.pages]);

  const loadMore = useCallback(() => {
    if (hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage]);

  // Set up infinite scroll
  const { targetRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: !!hasNextPage,
    loading: isFetchingNextPage,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner
          size="xl"
          variant="primary"
          text="Loading activities..."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">{(error as Error).message}</p>
        <Button
          onClick={() => fetchNextPage()}
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            No activities found. Start watching content or managing your lists
            to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <ActivityEntry
              key={activity.id}
              activity={activity}
              currentUsername={user?.username || ""}
            />
          ))}

          {/* Infinite scroll trigger */}
          <div ref={targetRef} className="h-4" />

          {/* Loading more indicator */}
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner variant="primary" text="Loading more..." />
            </div>
          )}

          {/* End of feed indicator */}
          {!hasNextPage && activities.length > 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                You&apos;ve reached the end of your activity timeline.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
