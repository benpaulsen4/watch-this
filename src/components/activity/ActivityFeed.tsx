"use client";

import { useState, useEffect, useCallback } from "react";
import { ActivityEntry } from "./ActivityEntry";
import { UpcomingActivityCard } from "./UpcomingActivityCard";
import { Button } from "@/components/ui/Button";
import { Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import {
  Activity,
  ActivityResponse,
  UpcomingActivity,
} from "./ActivityTimelineClient";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "../ui/LoadingSpinner";

interface ActivityFeedProps {
  currentUsername: string;
}

export function ActivityFeed({ currentUsername }: ActivityFeedProps) {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [upcomingActivities, setUpcomingActivities] = useState<
    UpcomingActivity[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMdUp, setIsMdUp] = useState(false);

  // Detect Tailwind's md breakpoint (min-width: 768px)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMdUp(e.matches);
    setIsMdUp(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const limit = isMdUp ? 10 : 5;
      const response = await fetch(`/api/activity?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch activities");
      }

      const data: ActivityResponse = await response.json();
      setActivities(data.activities);
      setUpcomingActivities(data.upcoming || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [isMdUp]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-100">Recent Activity</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/activity")}
          >
            View All
          </Button>
        </div>
        <LoadingSpinner
          size="lg"
          variant="primary"
          text="Loading activities..."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-100">Recent Activity</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/activity")}
          >
            View All
          </Button>
        </div>
        <div className="text-center py-8">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
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
      {upcomingActivities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {upcomingActivities.map((upcoming, index) => (
            <UpcomingActivityCard
              key={`${upcoming.id}-${index}`}
              upcoming={upcoming}
              onEpisodeWatched={fetchActivities}
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
      ) : upcomingActivities.length === 0 ? (
        <div className="text-center py-8">
          <ActivityIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No recent activity. Start watching content or managing your lists to
            see activity here.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild size="sm">
              <Link href="/discover">Discover Content</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/lists/new">Create List</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
