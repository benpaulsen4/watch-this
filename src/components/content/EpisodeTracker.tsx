"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  RotateCcw,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TMDBSeason } from "@/lib/tmdb/client";
import { WatchStatusEnum } from "@/lib/db";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { Button } from "../ui/Button";

export interface EpisodeWatchStatus {
  id: string;
  userId: string;
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt: string | null;
}

export interface EpisodeTrackerProps {
  tvShowId: number;
  className?: string;
  onShowStatusChanged?: (status: WatchStatusEnum) => void;
}

interface SeasonData {
  season: TMDBSeason;
  watchStatuses: EpisodeWatchStatus[];
  isExpanded: boolean;
}

/**
 * EpisodeTracker component for tracking TV show episode watch progress
 *
 * @param tvShowId - TMDB ID of the TV show
 * @param className - Additional CSS classes
 */
export function EpisodeTracker({
  tvShowId,
  className,
  onShowStatusChanged,
}: EpisodeTrackerProps) {
  const [seasons, setSeasons] = useState<SeasonData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingEpisodes, setUpdatingEpisodes] = useState<Set<string>>(
    new Set(),
  );

  // Fetch TV show details to get season information
  const fetchTVShowData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get TV show details to know how many seasons there are
      const tvDetailsResponse = await fetch(
        `/api/tmdb/details?type=tv&id=${tvShowId}`,
      );
      if (!tvDetailsResponse.ok) {
        throw new Error("Failed to fetch TV show details");
      }
      const tvDetails = await tvDetailsResponse.json();

      // Get watch statuses for all episodes
      const statusResponse = await fetch(
        `/api/status/episodes?tmdbId=${tvShowId}`,
      );
      if (!statusResponse.ok) {
        throw new Error("Failed to fetch episode watch statuses");
      }
      const { episodes: watchStatuses } = await statusResponse.json();

      // Fetch season details for each season (excluding season 0 - specials)
      const seasonPromises = [];
      for (
        let seasonNum = 1;
        seasonNum <= tvDetails.number_of_seasons;
        seasonNum++
      ) {
        seasonPromises.push(
          fetch(`/api/tmdb/episodes/${tvShowId}?season=${seasonNum}`)
            .then((res) => res.json())
            .then((data) => ({ seasonNumber: seasonNum, ...data })),
        );
      }

      const seasonResults = await Promise.all(seasonPromises);

      const seasonsData: SeasonData[] = seasonResults
        .filter((result) => result.season)
        .map((result) => ({
          season: result.season,
          watchStatuses: watchStatuses.filter(
            (status: EpisodeWatchStatus) =>
              status.seasonNumber === result.seasonNumber,
          ),
          isExpanded: false,
        }));

      setSeasons(seasonsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [tvShowId]);

  useEffect(() => {
    fetchTVShowData();
  }, [fetchTVShowData]);

  // Toggle episode watch status
  const toggleEpisodeWatched = async (
    seasonNumber: number,
    episodeNumber: number,
    currentlyWatched: boolean,
  ) => {
    const episodeKey = `${seasonNumber}-${episodeNumber}`;
    setUpdatingEpisodes((prev) => new Set(prev).add(episodeKey));

    try {
      const response = await fetch("/api/status/episodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tmdbId: tvShowId,
          seasonNumber,
          episodeNumber,
          watched: !currentlyWatched,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update episode status");
      }

      const { newStatus } = await response.json();
      if (newStatus) {
        onShowStatusChanged?.(newStatus);
      }

      // Update local state
      setSeasons((prevSeasons) =>
        prevSeasons.map((seasonData) => {
          if (seasonData.season.season_number === seasonNumber) {
            const updatedStatuses = currentlyWatched
              ? seasonData.watchStatuses.filter(
                  (status) =>
                    !(
                      status.seasonNumber === seasonNumber &&
                      status.episodeNumber === episodeNumber
                    ),
                )
              : [
                  ...seasonData.watchStatuses.filter(
                    (status) =>
                      !(
                        status.seasonNumber === seasonNumber &&
                        status.episodeNumber === episodeNumber
                      ),
                  ),
                  {
                    id: `temp-${Date.now()}`,
                    userId: "current-user",
                    tmdbId: tvShowId,
                    seasonNumber,
                    episodeNumber,
                    watched: true,
                    watchedAt: new Date().toISOString(),
                  },
                ];

            return {
              ...seasonData,
              watchStatuses: updatedStatuses,
            };
          }
          return seasonData;
        }),
      );
    } catch (err) {
      console.error("Error updating episode status:", err);
    } finally {
      setUpdatingEpisodes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(episodeKey);
        return newSet;
      });
    }
  };

  // Toggle season expansion
  const toggleSeasonExpanded = (seasonNumber: number) => {
    setSeasons((prevSeasons) =>
      prevSeasons.map((seasonData) =>
        seasonData.season.season_number === seasonNumber
          ? { ...seasonData, isExpanded: !seasonData.isExpanded }
          : seasonData,
      ),
    );
  };

  // Mark all (aired) episodes in a season as watched/unwatched
  const toggleSeasonWatched = async (
    seasonNumber: number,
    markAsWatched: boolean,
  ) => {
    const seasonData = seasons.find(
      (s) => s.season.season_number === seasonNumber,
    );
    if (!seasonData) return;

    try {
      const episodes = seasonData.season.episodes
        .filter((ep) => new Date(ep.air_date) < new Date())
        .map((ep) => ({
          seasonNumber,
          episodeNumber: ep.episode_number,
          watched: markAsWatched,
        }));

      const response = await fetch("/api/status/episodes", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tmdbId: tvShowId,
          episodes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update season status");
      }

      // Refresh data
      await fetchTVShowData();
    } catch (err) {
      console.error("Error updating season status:", err);
    }
  };

  // Get episode watch status
  const getEpisodeWatchStatus = (
    seasonNumber: number,
    episodeNumber: number,
  ): boolean => {
    const seasonData = seasons.find(
      (s) => s.season.season_number === seasonNumber,
    );
    if (!seasonData) return false;

    return seasonData.watchStatuses.some(
      (status) =>
        status.seasonNumber === seasonNumber &&
        status.episodeNumber === episodeNumber &&
        status.watched,
    );
  };

  // Get episode watch date
  const getEpisodeWatchDate = (
    seasonNumber: number,
    episodeNumber: number,
  ): Date | null => {
    const seasonData = seasons.find(
      (s) => s.season.season_number === seasonNumber,
    );
    if (!seasonData) return null;

    const episodeDate = seasonData.watchStatuses.find(
      (status) =>
        status.seasonNumber === seasonNumber &&
        status.episodeNumber === episodeNumber &&
        status.watched,
    )?.watchedAt;
    return episodeDate ? new Date(episodeDate) : null;
  };

  // Calculate season progress
  const getSeasonProgress = (seasonData: SeasonData) => {
    const totalEpisodes = seasonData.season.episodes.length;
    const watchedEpisodes = seasonData.watchStatuses.filter(
      (status) => status.watched,
    ).length;
    return { watched: watchedEpisodes, total: totalEpisodes };
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <LoadingSpinner size="lg" text="Loading episodes..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-6 text-center", className)}>
        <p className="text-red-400 mb-4">{error}</p>
        <Button onClick={fetchTVShowData} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold text-gray-100">Episode Progress</h3>

      {seasons.map((seasonData) => {
        const progress = getSeasonProgress(seasonData);
        const isFullyWatched = progress.watched === progress.total;
        const progressPercentage =
          progress.total > 0 ? (progress.watched / progress.total) * 100 : 0;

        return (
          <div
            key={seasonData.season.season_number}
            className="bg-gray-800 rounded-lg border border-gray-700"
          >
            {/* Season Header */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() =>
                    toggleSeasonExpanded(seasonData.season.season_number)
                  }
                  className="flex items-center gap-3 text-left flex-1 hover:text-gray-300 transition-colors"
                >
                  {seasonData.isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <h4 className="font-medium text-gray-100">
                      {seasonData.season.name}
                    </h4>
                    <p className="text-sm text-gray-400">
                      {progress.watched} of {progress.total} episodes watched
                    </p>
                  </div>
                </button>

                <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-3">
                  {/* Progress Bar */}
                  <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>

                  {/* Season Actions */}
                  <div className="flex gap-1">
                    {!isFullyWatched && (
                      <Button
                        onClick={() =>
                          toggleSeasonWatched(
                            seasonData.season.season_number,
                            true,
                          )
                        }
                        size="sm"
                        variant="outline"
                        className="text-xs"
                      >
                        Mark All
                      </Button>
                    )}
                    {progress.watched > 0 && (
                      <Button
                        onClick={() =>
                          toggleSeasonWatched(
                            seasonData.season.season_number,
                            false,
                          )
                        }
                        size="sm"
                        variant="outline"
                        className="text-xs"
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Episodes List */}
            {seasonData.isExpanded && (
              <div className="border-t border-gray-700">
                <div className="p-4 space-y-2">
                  {seasonData.season.episodes.map((episode) => {
                    const isWatched = getEpisodeWatchStatus(
                      seasonData.season.season_number,
                      episode.episode_number,
                    );
                    const watchDate = getEpisodeWatchDate(
                      seasonData.season.season_number,
                      episode.episode_number,
                    );
                    const episodeKey = `${seasonData.season.season_number}-${episode.episode_number}`;
                    const isInFuture = new Date(episode.air_date) > new Date();

                    const isUpdating = updatingEpisodes.has(episodeKey);

                    return (
                      <div
                        key={episode.episode_number}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg transition-colors",
                          "bg-gray-700/20 hover:bg-gray-700/50",
                          isWatched && "bg-gray-700/40",
                          isInFuture && "bg-transparent hover:bg-transparent",
                        )}
                      >
                        {/* Watch Toggle */}
                        <button
                          onClick={() =>
                            toggleEpisodeWatched(
                              seasonData.season.season_number,
                              episode.episode_number,
                              isWatched,
                            )
                          }
                          disabled={isUpdating || isInFuture}
                          className={cn(
                            "flex-shrink-0 w-6 h-6 rounded-full border-2 transition-colors",
                            "flex items-center justify-center",
                            isWatched
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-gray-500 hover:border-gray-400",
                            isUpdating && "opacity-50 cursor-not-allowed",
                            isInFuture && "cursor-not-allowed",
                          )}
                        >
                          {isUpdating ? (
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : isWatched ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            isInFuture && (
                              <Clock className="h-3 w-3 text-white" />
                            )
                          )}
                        </button>

                        {/* Episode Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="flex-2 md:flex-3 font-medium text-gray-100">
                              {episode.episode_number}. {episode.name}
                            </span>
                            <div className="flex flex-1 md:flex-2 flex-wrap items-center justify-end gap-2">
                              {episode.air_date && (
                                <div className="flex items-center gap-1 text-gray-400 text-xs">
                                  <Calendar className="h-3 w-3" />
                                  <span>
                                    {new Date(
                                      episode.air_date,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              {episode.runtime && (
                                <div className="flex items-center gap-1 text-gray-400 text-xs">
                                  <Clock className="h-3 w-3" />
                                  <span>{episode.runtime}m</span>
                                </div>
                              )}
                              {watchDate && (
                                <div className="flex items-center gap-1 text-gray-400 text-xs">
                                  <Eye className="h-3 w-3" />
                                  <span>{watchDate.toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {episode.overview && (
                            <p className="text-sm text-gray-400 line-clamp-3">
                              {episode.overview}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
