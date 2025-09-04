"use client";

import { useState, useEffect, useCallback } from "react";
import { ActivityEntry } from "./ActivityEntry";
import { Button } from "@/components/ui/Button";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { LoadingSpinner } from "../ui";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserStub {
  id: string;
  username: string;
  profilePictureUrl?: string | null;
}

export interface Activity {
  id: string;
  activityType: string;
  user: UserStub
  tmdbId?: number;
  contentType?: string;
  listId?: string;
  metadata?: Record<string, unknown>;
  isCollaborative: boolean;
  collaborators?: UserStub[];
  createdAt: string;
}

export interface ActivityResponse {
  activities: Activity[];
  hasMore: boolean;
  nextCursor?: string;
}

export function ActivityTimelineClient() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchActivities = useCallback(async (cursor?: string, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(`/api/activity?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch activities");
      }

      const data: ActivityResponse = await response.json();
      
      if (reset) {
        setActivities(data.activities);
      } else {
        setActivities(prev => [...prev, ...data.activities]);
      }
      
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && nextCursor) {
      fetchActivities(nextCursor);
    }
  }, [fetchActivities, loadingMore, hasMore, nextCursor]);

  // Set up infinite scroll
  const { targetRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
  });

  useEffect(() => {
    fetchActivities(undefined, true);
  }, [fetchActivities]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" text="Loading activities..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <Button onClick={() => fetchActivities(undefined, true)} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
           <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-gray-100">Activity Timeline</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Activity Feed */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            No activities found. Start watching content or managing your lists to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <ActivityEntry 
              key={activity.id} 
              activity={activity} 
              currentUsername=""
            />
          ))}
          
          {/* Infinite scroll trigger */}
          <div ref={targetRef} className="h-4" />
          
          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner variant="primary" text="Loading more..." />
            </div>
          )}
          
          {/* End of feed indicator */}
          {!hasMore && activities.length > 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                You&apos;ve reached the end of your activity timeline.
              </p>
            </div>
          )}
        </div>
      )}
      </main>
    </div>
  );
}