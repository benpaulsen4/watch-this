'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { UpcomingActivity } from './ActivityTimelineClient';
import { getImageUrl } from '@/lib/tmdb/client';
import { DAYS_OF_WEEK } from '../ui/ScheduleManager';

interface UpcomingActivityCardProps {
  upcoming: UpcomingActivity;
  onEpisodeWatched?: () => void;
}

export function UpcomingActivityCard({ upcoming, onEpisodeWatched }: UpcomingActivityCardProps) {
  const [isWatching, setIsWatching] = useState(false);

  const handleMarkWatched = async () => {
    try {
      setIsWatching(true);
      
      const response = await fetch('/api/status/episodes/next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: upcoming.tmdbId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark episode as watched');
      }

      onEpisodeWatched?.();
    } catch (error) {
      console.error('Error marking episode as watched:', error);
    } finally {
      setIsWatching(false);
    }
  };

  const posterUrl = getImageUrl(upcoming.posterPath, 'w342');

  const today = DAYS_OF_WEEK[new Date().getDay()];

  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Poster left */}
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

          {/* Right column: prompt, title, button */}
          <div className="flex-1 flex flex-col gap-2">
            <p className="text-gray-400 text-sm md:text-base">It&apos;s {today}! Have you watched this today?</p>
            <h3 className="text-gray-100 font-semibold text-xl truncate mb-4">
              {upcoming.title}
            </h3>
            <div>
              <Button
                onClick={handleMarkWatched}
                loading={isWatching}
              >
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
  );
}