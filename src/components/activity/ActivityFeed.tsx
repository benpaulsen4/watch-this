"use client";

import { useState, useEffect } from "react";
import { ActivityEntry } from "./ActivityEntry";
import { Button } from "@/components/ui/Button";
import { Activity as ActivityIcon} from "lucide-react";
import Link from "next/link";
import { Activity, ActivityResponse } from "./ActivityTimelineClient";
import { LoadingSpinner } from "../ui";
import { useRouter } from 'next/navigation';

interface ActivityFeedProps {
  currentUsername: string;
}

export function ActivityFeed({ currentUsername }: ActivityFeedProps) {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/activity?limit=5");
        if (!response.ok) {
          throw new Error("Failed to fetch activities");
        }

        const data: ActivityResponse = await response.json();
        setActivities(data.activities);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  if (loading) {
    return (
      <div>
<div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">Recent Activity</h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => router.push('/activity')}
            >
              View All
            </Button>
            </div>
        <LoadingSpinner size="lg" variant="primary" text="Loading activities..." />
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
              onClick={() => router.push('/activity')}
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
    <div>
    <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">Recent Activity</h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => router.push('/activity')}
            >
              View All
            </Button>
            </div>
          
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <ActivityIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No recent activity. Start watching content or managing your lists to see activity here.
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
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <ActivityEntry 
                key={activity.id} 
                activity={activity} 
                currentUsername={currentUsername}
              />
            ))}
          </div>
        )}
        </div>
  );
}