"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import type { UpcomingActivity } from "@/lib/activity/types";
import { getImageUrl } from "@/lib/tmdb/client";
import { DAYS_OF_WEEK } from "../content/ScheduleManager";
import { ContentDetailsModal } from "../content/ContentDetailsModal";
import { useMutation } from "@tanstack/react-query";
import type { MarkNextEpisodeResult } from "@/lib/episodes/types";

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

  const markWatchedMutation = useMutation({
    mutationFn: async (): Promise<MarkNextEpisodeResult> => {
      const response = await fetch("/api/status/episodes/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: upcoming.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to mark episode as watched");
      return data;
    },
    onSuccess: () => onEpisodeWatched?.(),
    onSettled: () => setIsWatching(false),
  });

  const handleMarkWatched = async () => {
    setIsWatching(true);
    await markWatchedMutation.mutateAsync();
  };

  const posterUrl = getImageUrl(upcoming.poster_path, "w342");

  const today = DAYS_OF_WEEK[new Date().getDay()];

  return (
    <>
      <Card size="sm">
        <CardContent>
          <div className="flex items-center gap-6">
            {/* Poster left */}
            {posterUrl ? (
              <Image
                src={posterUrl}
                alt={upcoming.name}
                width={300}
                height={450}
                className="w-24 h-36 sm:w-28 sm:h-40 md:w-32 md:h-48 object-cover rounded-md"
                onClick={() => setIsModalOpen(true)}
              />
            ) : (
              <div
                className="flex items-center justify-center w-24 h-36 sm:w-28 sm:h-40 md:w-32 md:h-48 rounded-md bg-gray-700"
                onClick={() => setIsModalOpen(true)}
              >
                <Play className="h-10 w-10 text-gray-400" />
              </div>
            )}

            {/* Right column: prompt, title, button */}
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-gray-400 text-sm md:text-base">
                It&apos;s {today}! Have you watched this today?
              </p>
              <h3 className="text-gray-100 font-semibold text-xl mb-4">
                {upcoming.name}
              </h3>
              <div>
                <Button onClick={handleMarkWatched} loading={isWatching}>
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    <span>Episode Watched</span>
                  </>
                </Button>
              </div>
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
