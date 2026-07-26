"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import ListSettingsModal from "@/components/lists/ListSettingsModal";
import { Button } from "@/components/ui/Button";
import type { ActivityTimelineResponse } from "@/lib/activity/types";

import { LoadingSpinner } from "../ui/LoadingSpinner";
import { ActivityEntry } from "./ActivityEntry";
import { UpcomingActivityCard } from "./UpcomingActivityCard";

interface ActivityFeedProps {
  currentUsername: string;
}

// The feed shows one column on mobile and two from md up, so it draws half as
// many rows' worth of entries on a narrow screen.
const MOBILE_ACTIVITY_COUNT = 5;
const DESKTOP_ACTIVITY_COUNT = 10;

export function ActivityFeed({ currentUsername }: ActivityFeedProps) {
  const router = useRouter();
  // Resolved from matchMedia on the first client render rather than defaulted to
  // false and corrected in the effect. It is only used to slice, so getting it
  // right up front avoids rendering five entries and then ten.
  const [mdUp, setMdUp] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(min-width: 768px)").matches,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => setMdUp(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // One fixed request, sliced for the viewport. The limit used to be derived
  // from `mdUp` and `mdUp` was part of the query key, so a desktop load fetched
  // limit=5 under one key and then limit=10 under another: two requests for the
  // same feed, and a visible jump between the two results.
  const {
    data: activitiesData,
    isLoading,
    error,
    refetch,
  } = useQuery<ActivityTimelineResponse>({
    queryKey: ["activity", "feed"],
    queryFn: async () => {
      const response = await fetch(
        `/api/activity?limit=${DESKTOP_ACTIVITY_COUNT}`,
      );
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
  });

  const activities = useMemo(
    () =>
      (activitiesData?.activities ?? []).slice(
        0,
        mdUp ? DESKTOP_ACTIVITY_COUNT : MOBILE_ACTIVITY_COUNT,
      ),
    [activitiesData?.activities, mdUp],
  );
  const upcoming = activitiesData?.upcoming ?? [];

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
      {upcoming.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {upcoming.map((item, index) => (
            <UpcomingActivityCard
              key={`${item.tmdbId}-${index}`}
              upcoming={item}
              onEpisodeWatched={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Regular Activities Section */}
      {activities.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2">
          {activities.map((activity) => (
            <ActivityEntry
              key={activity.id}
              activity={activity}
              currentUsername={currentUsername}
            />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
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
