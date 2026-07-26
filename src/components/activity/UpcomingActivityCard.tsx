"use client";

import { useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import type { UpcomingActivity } from "@/lib/activity/types";
import type { MarkNextEpisodeResult } from "@/lib/episodes/types";
import { getImageUrl } from "@/lib/tmdb/client";

import { ContentDetailsModal } from "../content/ContentDetailsModal";
import { DAYS_OF_WEEK } from "../content/ScheduleManager";

interface UpcomingActivityCardProps {
  upcoming: UpcomingActivity;
  onEpisodeWatched?: () => void;
}

export function UpcomingActivityCard({
  upcoming,
  onEpisodeWatched,
}: UpcomingActivityCardProps) {
  const [isWatching, setIsWatching] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  const markWatchedMutation = useMutation({
    mutationFn: async (): Promise<MarkNextEpisodeResult> => {
      const response = await fetch("/api/status/episodes/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: upcoming.tmdbId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to mark episode as watched");
      return data;
    },
    onSuccess: () => {
      setError("");
      onEpisodeWatched?.();
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Failed to mark episode as watched",
      );
    },
    onSettled: () => setIsWatching(false),
  });

  const handleMarkWatched = async () => {
    setIsWatching(true);
    setError("");
    try {
      await markWatchedMutation.mutateAsync();
    } catch {
      // Error state is handled in onError; swallow to avoid unhandled rejection
    }
  };

  const posterUrl = getImageUrl(upcoming.posterPath, "w342");

  const today = DAYS_OF_WEEK[new Date().getDay()];

  return (
    <>
      <Card size="sm">
        <CardContent>
          <div className="flex items-center gap-6">
            {/* Poster left. The opener is a real button rather than a click
                handler on the image, which was unreachable by keyboard. */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              aria-label={`View details for ${upcoming.title}`}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            >
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={upcoming.title}
                  width={300}
                  height={450}
                  className="w-24 h-36 sm:w-28 sm:h-40 md:w-32 md:h-48 object-cover rounded-md"
                />
              ) : (
                <div className="flex items-center justify-center w-24 h-36 sm:w-28 sm:h-40 md:w-32 md:h-48 rounded-md bg-gray-700">
                  <Play className="h-10 w-10 text-gray-400" />
                </div>
              )}
            </button>

            {/* Right column: prompt, title, button */}
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-gray-400 text-sm md:text-base">
                It&apos;s {today}! Have you watched this today?
              </p>
              <h3 className="text-gray-100 font-semibold text-xl mb-4">
                {upcoming.title}
              </h3>
              <div>
                <Button onClick={handleMarkWatched} loading={isWatching}>
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    <span>Episode Watched</span>
                  </>
                </Button>
              </div>
              {error && (
                <p role="alert" className="text-red-400 text-sm">
                  {error}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <ContentDetailsModal
        content={upcoming}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
