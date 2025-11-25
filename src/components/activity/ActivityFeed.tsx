"use client";

import { useState, useEffect } from "react";
import { ActivityEntry } from "./ActivityEntry";
import { UpcomingActivityCard } from "./UpcomingActivityCard";
import { Button } from "@/components/ui/Button";
import { Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import type { ActivityTimelineResponse } from "@/lib/activity/types";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { useQuery } from "@tanstack/react-query";
import ListSettingsModal from "@/components/lists/ListSettingsModal";

interface ActivityFeedProps {
  currentUsername: string;
}

export function ActivityFeed({ currentUsername }: ActivityFeedProps) {
  const router = useRouter();
  const [mdUp, setMdUp] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => setMdUp(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const {
    data: activitiesData,
    isLoading,
    error,
    refetch,
  } = useQuery<ActivityTimelineResponse>({
    queryKey: ["activity", "feed", mdUp],
    queryFn: async () => {
      const response = await fetch(`/api/activity?limit=${mdUp ? 10 : 5}`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-100">Activity</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/activity")}
          >
            View All
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-24">
          <LoadingSpinner
            size="lg"
            variant="primary"
            text="Loading activities..."
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-100">Activity</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/activity")}
          >
            View All
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-red-600 dark:text-red-400 mb-4">
            {(error as Error).message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Activity</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/activity")}
        >
          View All
        </Button>
      </div>

      {/* Upcoming Activities Section */}
      {(activitiesData?.upcoming || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(activitiesData?.upcoming || []).map((upcoming, index) => (
            <UpcomingActivityCard
              key={`${upcoming.id}-${index}`}
              upcoming={upcoming}
              onEpisodeWatched={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Regular Activities Section */}
      {(activitiesData?.activities || []).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2">
          {(activitiesData?.activities || []).map((activity) => (
            <ActivityEntry
              key={activity.id}
              activity={activity}
              currentUsername={currentUsername}
            />
          ))}
        </div>
      ) : (activitiesData?.upcoming || []).length === 0 ? (
        <div className="text-center py-8">
          <ActivityIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No recent activity. Start watching content or managing your lists to
            see activity here.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild size="sm">
              <Link href="/search">Discover Content</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateModal(true)}
            >
              Create List
            </Button>
          </div>
          <ListSettingsModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            mode="create"
            isOwner
          />
        </div>
      ) : null}
    </div>
  );
}
