'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Modal, ModalOverlay, Heading, Button as AriaButton, Tabs, TabList, Tab, TabPanel } from 'react-aria-components';
import { X, Star, Calendar, Clock, Play, Tv } from 'lucide-react';
import { cn, formatVoteAverage } from '@/lib/utils';
import { getContentTitle, getContentReleaseDate, getContentType, getImageUrl } from '@/lib/tmdb/client';
import { Badge } from './Badge';
import { ListSelector } from './ListSelector';
import { StatusSegmentedSelector } from './StatusSegmentedSelector';
import { EpisodeTracker } from './EpisodeTracker';
import type { TMDBMovie, TMDBTVShow, TMDBMovieDetails, TMDBTVShowDetails } from '@/lib/tmdb/client';
import type { WatchStatusEnum, ContentTypeEnum } from '@/lib/db/schema';

export interface ContentDetailsModalProps {
  content: TMDBMovie | TMDBTVShow;
  isOpen: boolean;
  onClose: () => void;
  onRemove?: () => void,
  onShowStatusChanged?: (status: WatchStatusEnum) => void;
  currentListId?: string;
}

export function ContentDetailsModal({ content, isOpen, onClose, onRemove,  onShowStatusChanged, currentListId }: ContentDetailsModalProps) {
  const [detailedContent, setDetailedContent] = useState<TMDBMovieDetails | TMDBTVShowDetails | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatusEnum | null>(content.watchStatus ?? null);
  const [selectedTab, setSelectedTab] = useState<string>('overview');
  
  const title = getContentTitle(content);
  const releaseDate = getContentReleaseDate(content);
  const contentType = getContentType(content);
  const posterUrl = getImageUrl(content.poster_path, 'w500');
  const backdropUrl = getImageUrl(content.backdrop_path, 'w780');
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  
  // Type-specific data from detailed content
  const runtime = detailedContent && 'runtime' in detailedContent ? detailedContent.runtime : null;
  const seasons = detailedContent && 'number_of_seasons' in detailedContent ? detailedContent.number_of_seasons : null;
  const episodes = detailedContent && 'number_of_episodes' in detailedContent ? detailedContent.number_of_episodes : null;
  
  // Fetch detailed content information when modal opens
  useEffect(() => {
    if (isOpen && !detailedContent) {
      const fetchDetails = async () => {
        try {
          const details = await fetch(`/api/tmdb/details?type=${contentType}&id=${content.id}`);
          const data = await details.json();
          setDetailedContent(data);
        } catch (error) {
          console.error('Error fetching content details:', error);
        }
      };
      fetchDetails();
    }
  }, [isOpen, content.id, contentType, detailedContent]);

  const handleStatusChange = async (newStatus: WatchStatusEnum) => {
    try {
      const response = await fetch('/api/status/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: content.id,
          contentType: contentType,
          status: newStatus
        }),
      });
      
      if (response.ok) {
        setWatchStatus(newStatus);
        onShowStatusChanged?.(newStatus);
      }
    } catch (error) {
      console.error('Error updating watch status:', error);
    }
  };
  
  useEffect(() => {
    if (!isOpen) {
      setSelectedTab('overview');
    }
  }, [isOpen]);

  const handleAddToList = async (listId: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: content.id,
          contentType: contentType,
          title: title,
          posterPath: content.poster_path,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add content to list');
      }

    } catch (error) {
      console.error('Error adding to list:', error);
    }
  };

  const handleRemoveFromList = async (listId: string, itemId: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove content from list');
      } else {
        onRemove?.();
      }
    } catch (error) {
      console.error('Error removing from list:', error);
    }
  };

  return (
    <ModalOverlay 
      isOpen={isOpen} 
      onOpenChange={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <Modal className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="relative">
          {/* Backdrop Image */}
          {backdropUrl && (
            <div className="relative h-64 w-full">
              <Image
                src={backdropUrl}
                alt={title}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
            </div>
          )}
          
          {/* Close Button */}
          <AriaButton
            onPress={onClose}
            className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </AriaButton>
          
          {/* Content */}
          <div className={cn(
            "p-4 sm:p-6",
            backdropUrl ? "-mt-32 relative z-10" : ""
          )}>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Poster */}
              <div className="flex-shrink-0 self-center lg:self-start">
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={title}
                    width={200}
                    height={300}
                    className="rounded-lg shadow-lg w-32 h-48 sm:w-48 sm:h-72 object-cover"
                  />
                ) : (
                  <div className="w-32 h-48 sm:w-48 sm:h-72 bg-gray-700 rounded-lg flex items-center justify-center">
                    <Play className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Details */}
              <div className="flex-1 min-w-0">
                <Heading className="text-2xl sm:text-3xl font-bold text-gray-100 mb-2">
                  {title}
                </Heading>
                
                {/* Badges */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Badge variant="year" size="sm">
                    {year || 'TBA'}
                  </Badge>
                  <Badge variant="genre" size="sm">
                    {contentType === 'movie' ? 'Movie' : 'TV Show'}
                  </Badge>
                  {contentType === 'movie' && (content as TMDBMovie).adult && (
                    <Badge variant="watching" size="sm">
                      18+
                    </Badge>
                  )}
                </div>
                
                {/* Rating and Stats */}
                <div className="flex items-center gap-2 sm:gap-4 mb-4 flex-wrap text-sm sm:text-base">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <span className="text-gray-100 font-medium">
                      {formatVoteAverage(content.vote_average)}
                    </span>
                    <span className="text-gray-400 text-xs sm:text-sm">
                      ({content.vote_count?.toLocaleString()} votes)
                    </span>
                  </div>
                  
                  {releaseDate && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">
                        {new Date(releaseDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  
                  {runtime && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">
                        {runtime} min
                      </span>
                    </div>
                  )}
                  
                  {seasons && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Tv className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">
                        {seasons} season{seasons !== 1 ? 's' : ''}
                        {episodes && ` • ${episodes} episodes`}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Watch Status */}
                <div className="mb-3">
                    <StatusSegmentedSelector
                      value={watchStatus}
                      contentType={contentType as ContentTypeEnum}
                      onValueChange={handleStatusChange}
                    />
                </div>
                
                {/* Tabs */}
                <Tabs 
                  selectedKey={selectedTab} 
                  onSelectionChange={(key) => setSelectedTab(key as string)}
                  className="mb-6"
                >
                  <TabList className="flex border-b border-gray-700 mb-4">
                    <Tab 
                      id="overview"
                      className={({isSelected}) => cn(
                        "px-4 py-2 text-sm text-gray-300 font-medium transition-colors border-b-2 border-transparent",
                        isSelected ? "text-red-400 border-red-500" : 'hover:text-gray-100 hover:border-gray-500'
                      )}
                    >
                      Overview
                    </Tab>
                    {contentType === 'tv' && (
                      <Tab 
                        id="episodes"
                        className={({isSelected}) => cn(
                        "px-4 py-2 text-sm text-gray-300 font-medium transition-colors border-b-2 border-transparent",
                        isSelected ? "text-red-400 border-red-500" : 'hover:text-gray-100 hover:border-gray-500'
                      )}
                      >
                        Episodes
                      </Tab>
                    )}
                    <Tab 
                      id="lists"
                      className={({isSelected}) => cn(
                        "px-4 py-2 text-sm text-gray-300 font-medium transition-colors border-b-2 border-transparent",
                        isSelected ? "text-red-400 border-red-500" : 'hover:text-gray-100 hover:border-gray-500'
                      )}
                    >
                      Lists
                    </Tab>
                  </TabList>
                  
                  <TabPanel id="overview" className="focus:outline-none">
                    {/* Overview */}
                    {content.overview && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-100 mb-2">Overview</h3>
                        <p className="text-gray-300 leading-relaxed text-sm sm:text-base">
                          {content.overview}
                        </p>
                      </div>
                    )}
                    
                    {/* Genres */}
                    {detailedContent?.genres && detailedContent.genres.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-100 mb-2">Genres</h3>
                        <div className="flex flex-wrap gap-2">
                          {detailedContent.genres.map((genre) => (
                            <Badge key={genre.id} variant="genre" size="sm">
                              {genre.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabPanel>
                  
                  {contentType === 'tv' && ( 
                    <TabPanel id="episodes" className="focus:outline-none">
                      <EpisodeTracker
                        tvShowId={content.id}
                        onShowStatusChanged={(status) => {
                          setWatchStatus(status);
                          onShowStatusChanged?.(status);
                        }}
                      />
                    </TabPanel>
                  )}

                  <TabPanel id="lists" className="focus:outline-none">
                      <ListSelector
                          contentType={contentType}
                          contentId={content.id}
                          currentListId={currentListId}
                          onAddToList={handleAddToList}
                          onRemoveFromList={handleRemoveFromList}
                        />
                    </TabPanel>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </ModalOverlay>
  );
}