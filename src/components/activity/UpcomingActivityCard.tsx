"use client";

import { useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import type { UpcomingActivity } from "@/lib/activity/types";
import { api, errorMessage } from "@/lib/api/client";
import * as episodesApi from "@/lib/episodes/contract";
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  const markWatchedMutation = useMutation({
    mutationFn: () =>
      api(episodesApi.markNextEpisodeWatched, {
        body: { tmdbId: upcoming.tmdbId },
      }),
    onSuccess: () => {
      setError("");
      onEpisodeWatched?.();
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to mark episode as watched"));
    },
  });

  const handleMarkWatched = async () => {
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
                <Button
                  onClick={handleMarkWatched}
                  loading={markWatchedMutation.isPending}
                >
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
