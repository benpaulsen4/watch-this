"use client";

import { forwardRef, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { cn, formatVoteAverage } from "@/lib/utils";
import {
  getContentTitle,
  getContentReleaseDate,
  getContentType,
  getImageUrl,
} from "@/lib/tmdb/client";
import { StatusBadge } from "./StatusBadge";
import { ContentDetailsModal } from "./ContentDetailsModal";
import { Star, Play } from "lucide-react";
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb/client";
import type { ContentTypeEnum, WatchStatusEnum } from "@/lib/db/schema";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { useMutation } from "@tanstack/react-query";

export interface ContentCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "content"> {
  content: TMDBMovie | TMDBTVShow;
  onContentClick?: (content: TMDBMovie | TMDBTVShow) => void;
  // List-specific props
  onRemoveFromList?: () => void;
  addedDate?: string;
  showAddedDate?: boolean;
  currentListId?: string;
  // Watch status props
  showWatchStatus?: boolean;
}

const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
  (
    {
      content,
      onContentClick,
      addedDate,
      showAddedDate = false,
      currentListId,
      showWatchStatus = true,
      className,
      onRemoveFromList,
      ...props
    },
    ref
  ) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [watchStatus, setWatchStatus] = useState(content.watchStatus);
    const [isQuickCompleting, setIsQuickCompleting] = useState(false);
    const [showTickAnimation, setShowTickAnimation] = useState(false);
    const [quickCompleteMessage, setQuickCompleteMessage] =
      useState<string>("");

    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const clickCountRef = useRef(0);

    const completeMovieMutation = useMutation({
      mutationFn: async () => {
        const response = await fetch("/api/status/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmdbId: content.id,
            contentType: "movie",
            status: "completed",
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Failed to update movie status");
        return data;
      },
      onSuccess: () => {
        setWatchStatus("completed" as WatchStatusEnum);
        setQuickCompleteMessage("Movie marked as watched!");
      },
    });

    const completeNextEpisodeMutation = useMutation({
      mutationFn: async () => {
        const response = await fetch("/api/status/episodes/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmdbId: content.id }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Failed to mark next episode as watched"
          );
        return data;
      },
      onSuccess: (result) => {
        if (result.newStatus)
          setWatchStatus(result.newStatus as WatchStatusEnum);
        const episodeDetails = result.episodeDetails;
        setQuickCompleteMessage(
          `S${episodeDetails.seasonNumber}E${episodeDetails.episodeNumber}: ${episodeDetails.name} marked as watched!`
        );
      },
    });

    const handleQuickComplete = async () => {
      if (isQuickCompleting) return;
      setIsQuickCompleting(true);
      setShowTickAnimation(true);
      try {
        const contentType = getContentType(content);
        if (contentType === "movie") {
          await completeMovieMutation.mutateAsync();
        } else {
          await completeNextEpisodeMutation.mutateAsync();
        }
        setTimeout(() => {
          setShowTickAnimation(false);
          setQuickCompleteMessage("");
        }, 2000);
      } catch (error) {
        console.error("Quick complete error:", error);
        setQuickCompleteMessage(
          error instanceof Error ? error.message : "Failed to update status"
        );
        setTimeout(() => {
          setShowTickAnimation(false);
          setQuickCompleteMessage("");
        }, 3000);
      } finally {
        setIsQuickCompleting(false);
      }
    };

    const handleCardClick = () => {
      clickCountRef.current += 1;

      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      clickTimeoutRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          // Single click - open modal or call onContentClick
          if (onContentClick) {
            onContentClick(content);
          } else {
            setIsModalOpen(true);
          }
        } else if (clickCountRef.current >= 2) {
          // Double click - quick complete
          handleQuickComplete();
        }

        clickCountRef.current = 0;
      }, 300); // 300ms delay to detect double clicks
    };

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
      };
    }, []);

    const onClose = () => {
      setIsModalOpen(false);
      if (isRemoving) {
        onRemoveFromList?.();
      }
    };

    const title = getContentTitle(content);
    const releaseDate = getContentReleaseDate(content);
    const contentType = getContentType(content);
    const posterUrl = getImageUrl(content.poster_path, "w342");
    const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

    return (
      <>
        <Card
          ref={ref}
          variant="entertainment"
          hover="lift"
          size="sm"
          className={cn("group cursor-pointer overflow-hidden", className)}
          onClick={handleCardClick}
          {...props}
        >
          <div className="relative">
            {posterUrl ? (
              <Image
                src={posterUrl}
                alt={title}
                width={200}
                height={300}
                className="w-full h-64 object-cover rounded-lg"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gray-700">
                <Play className="h-12 w-12 text-gray-400" />
              </div>
            )}

            {/* Quick complete animation overlay */}
            {showTickAnimation && (
              <div className="absolute inset-0 bg-green-500/80 rounded-lg flex items-center justify-center backdrop-blur-sm transition-all duration-300 ease-in-out">
                <div className="text-center">
                  <div className="relative">
                    <svg
                      className="h-16 w-16 mx-auto mb-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M4 12L9 17L20 6"
                        stroke="white"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="animate-[draw_0.8s_ease-in-out_forwards]"
                        style={{
                          strokeDasharray: "24",
                          strokeDashoffset: "24",
                        }}
                      />
                    </svg>
                  </div>
                  {quickCompleteMessage && (
                    <p className="text-white text-sm font-medium px-4 text-center leading-tight">
                      {quickCompleteMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Rating badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-lg px-2 py-1">
              <Star className="h-3 w-3 text-yellow-400 fill-current" />
              <span className="text-xs text-white font-medium">
                {formatVoteAverage(content.vote_average)}
              </span>
            </div>

            {/* Watch status badge */}
            {showWatchStatus && watchStatus && (
              <div className="absolute bottom-2 right-2">
                <StatusBadge
                  status={watchStatus}
                  contentType={contentType as ContentTypeEnum}
                  size="sm"
                />
              </div>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-semibold text-gray-100 truncate group-hover:text-red-400 transition-colors">
              {title}
            </h3>

            <div className="flex items-center gap-2 mt-2">
              <Badge variant="year" size="sm">
                {year || "TBA"}
              </Badge>
              <Badge variant="genre" size="sm">
                {contentType === "movie" ? "Movie" : "TV Show"}
              </Badge>
            </div>

            {showAddedDate && addedDate && (
              <span className="text-xs text-gray-500">
                Added {new Date(addedDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </Card>

        <ContentDetailsModal
          content={content}
          isOpen={isModalOpen}
          onClose={onClose}
          currentListId={currentListId}
          onRemove={() => setIsRemoving(true)}
          onShowStatusChanged={(status) => setWatchStatus(status)}
        />
      </>
    );
  }
);

ContentCard.displayName = "ContentCard";

export { ContentCard };
