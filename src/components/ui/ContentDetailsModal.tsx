'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Modal, ModalOverlay, Heading, Button as AriaButton } from 'react-aria-components';
import { X, Star, Calendar, Clock, Users, Play } from 'lucide-react';
import { cn, formatVoteAverage } from '@/lib/utils';
import { getContentTitle, getContentReleaseDate, getContentType, getImageUrl, tmdbClient } from '@/lib/tmdb/client';
import { getGenreNames } from '@/lib/tmdb/genres';
import { Badge } from './Badge';
import { Button } from './Button';
import { ListSelector } from './ListSelector';
import { toast } from 'sonner';
import type { TMDBMovie, TMDBTVShow, TMDBMovieDetails, TMDBTVShowDetails } from '@/lib/tmdb/client';

export interface ContentDetailsModalProps {
  content: TMDBMovie | TMDBTVShow;
  isOpen: boolean;
  onClose: () => void;
  currentListId?: string;
  currentListName?: string;
  onRemoveFromList?: () => void;
}

export function ContentDetailsModal({ content, isOpen, onClose, currentListId, currentListName, onRemoveFromList }: ContentDetailsModalProps) {
  const [showListSelector, setShowListSelector] = useState(false);
  const [isAddingToList, setIsAddingToList] = useState(false);
  const [detailedContent, setDetailedContent] = useState<TMDBMovieDetails | TMDBTVShowDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
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
      setIsLoadingDetails(true);
      const fetchDetails = async () => {
        try {
          if (contentType === 'movie') {
            const details = await tmdbClient.getMovieDetails(content.id);
            setDetailedContent(details);
          } else {
            const details = await tmdbClient.getTVShowDetails(content.id);
            setDetailedContent(details);
          }
        } catch (error) {
          console.error('Error fetching content details:', error);
        } finally {
          setIsLoadingDetails(false);
        }
      };
      fetchDetails();
    }
  }, [isOpen, content.id, contentType, detailedContent]);
  
  // Reset detailed content when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDetailedContent(null);
    }
  }, [isOpen]);

  const handleAddToList = async (listId: string) => {
    try {
      setIsAddingToList(true);
      
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

      toast.success(`Added "${title}" to list successfully!`);
      setShowListSelector(false);
    } catch (error) {
      console.error('Error adding to list:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add content to list');
    } finally {
      setIsAddingToList(false);
    }
  };

  return (
    <ModalOverlay 
      isOpen={isOpen} 
      onOpenChange={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <Modal className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
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
            "p-6",
            backdropUrl ? "-mt-32 relative z-10" : ""
          )}>
            <div className="flex gap-6">
              {/* Poster */}
              <div className="flex-shrink-0">
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={title}
                    width={200}
                    height={300}
                    className="rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-48 h-72 bg-gray-700 rounded-lg flex items-center justify-center">
                    <Play className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Details */}
              <div className="flex-1 min-w-0">
                <Heading className="text-3xl font-bold text-gray-100 mb-2">
                  {title}
                </Heading>
                
                {/* Badges */}
                <div className="flex items-center gap-2 mb-4">
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
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <span className="text-gray-100 font-medium">
                      {formatVoteAverage(content.vote_average)}
                    </span>
                    <span className="text-gray-400 text-sm">
                      ({content.vote_count.toLocaleString()} votes)
                    </span>
                  </div>
                  
                  {releaseDate && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Calendar className="h-4 w-4" />
                      <span className="text-sm">
                        {new Date(releaseDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  
                  {runtime && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">
                        {runtime} min
                      </span>
                    </div>
                  )}
                  
                  {seasons && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">
                        {seasons} season{seasons !== 1 ? 's' : ''}
                        {episodes && ` • ${episodes} episodes`}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Overview */}
                {content.overview && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-100 mb-2">Overview</h3>
                    <p className="text-gray-300 leading-relaxed">
                      {content.overview}
                    </p>
                  </div>
                )}
                
                {/* Genres */}
                {content.genre_ids && content.genre_ids.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-100 mb-2">Genres</h3>
                    <div className="flex flex-wrap gap-2">
                      {getGenreNames(content.genre_ids, contentType).map((genreName, index) => (
                        <Badge key={content.genre_ids[index]} variant="genre" size="sm">
                          {genreName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* List Selector */}
                {showListSelector && (
                  <div className="mb-6">
                    <ListSelector
                      contentType={contentType}
                      contentId={content.id}
                      currentListId={currentListId}
                      onSelectList={handleAddToList}
                      onClose={() => setShowListSelector(false)}
                    />
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex gap-3">
                  {currentListId && currentListName && onRemoveFromList && (
                    <Button
                      onClick={onRemoveFromList}
                      variant="outline"
                      className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                      disabled={isAddingToList}
                    >
                      Remove from {currentListName}
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowListSelector(!showListSelector)}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={isAddingToList}
                  >
                    {isAddingToList ? 'Adding...' : showListSelector ? 'Cancel' : 'Add to List'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={isAddingToList}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </ModalOverlay>
  );
}