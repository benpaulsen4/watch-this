import { forwardRef, useState } from 'react';
import Image from 'next/image';
import { cn, formatVoteAverage } from '@/lib/utils';
import { getContentTitle, getContentReleaseDate, getContentType, getImageUrl } from '@/lib/tmdb/client';
import { Card } from './Card';
import { Badge } from './Badge';
import { ContentDetailsModal } from './ContentDetailsModal';
import { Star, Play } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow } from '@/lib/tmdb/client';

export interface ContentCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'content'> {
  content: TMDBMovie | TMDBTVShow;
  variant?: 'default' | 'compact' | 'detailed';
  showStatus?: boolean;
  status?: string;
  onStatusChange?: (status: string) => void;
  onAddToList?: () => void;
  onContentClick?: (content: TMDBMovie | TMDBTVShow) => void;
  // List-specific props
  showRemoveButton?: boolean;
  onRemove?: () => void;
  addedDate?: string;
  showAddedDate?: boolean;
  currentListId?: string;
}

const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
  ({ 
    content, 
    variant = 'default', 
    showStatus = false, 
    status, 
    onAddToList,
    onContentClick,
    showRemoveButton = false,
    onRemove,
    addedDate,
    showAddedDate = false,
    currentListId,
    className, 
    ...props 
  }, ref) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const handleCardClick = () => {
      if (onContentClick) {
        onContentClick(content);
      } else {
        setIsModalOpen(true);
      }
    };
    
    const handleAddToList = () => {
      if (onAddToList) {
        onAddToList();
      }
    };
    const title = getContentTitle(content);
    const releaseDate = getContentReleaseDate(content);
    const contentType = getContentType(content);
    const posterUrl = getImageUrl(content.poster_path, 'w342');
    const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

    if (variant === 'compact') {
      return (
        <>
          <Card
            ref={ref}
            variant="entertainment"
            hover="lift"
            size="sm"
            className={cn('group cursor-pointer overflow-hidden', className)}
            onClick={handleCardClick}
            {...props}
          >
          <div className="flex gap-3">
            <div className="relative flex-shrink-0">
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={title}
                  width={56}
                  height={80}
                  className="h-20 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-20 w-14 items-center justify-center rounded-lg bg-gray-700">
                  <Play className="h-6 w-6 text-gray-400" />
                </div>
              )}
              {showStatus && status && (
                <Badge
                  variant={status.toLowerCase() as 'watching' | 'completed' | 'dropped' | 'planning'}
                  size="sm"
                  className="absolute -top-1 -right-1"
                >
                  {status}
                </Badge>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-100 truncate group-hover:text-red-400 transition-colors">
                {title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="year" size="sm">
                  {year || 'TBA'}
                </Badge>
                <Badge variant="genre" size="sm">
                  {contentType === 'movie' ? 'Movie' : 'TV Show'}
                </Badge>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Star className="h-3 w-3 text-yellow-400 fill-current" />
                <span className="text-xs text-gray-400">
                  {formatVoteAverage(content.vote_average)}
                </span>
              </div>
              
              {/* List-specific features for compact variant */}
              {(showRemoveButton || showAddedDate) && (
                <div className="flex justify-between items-center mt-2">
                  {showAddedDate && addedDate && (
                    <span className="text-xs text-gray-500">
                      Added {new Date(addedDate).toLocaleDateString()}
                    </span>
                  )}
                  {showRemoveButton && onRemove && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                      }}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          </Card>
          
          <ContentDetailsModal
            content={content}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            currentListId={currentListId}
          />
        </>
      );
    }

    return (
      <>
        <Card
          ref={ref}
          variant="entertainment"
          hover="lift"
          size="sm"
          className={cn('group cursor-pointer overflow-hidden', className)}
          onClick={handleCardClick}
          {...props}
        >
        <div className="relative">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={title}
              width={300}
              height={450}
              className="w-full h-64 object-cover rounded-lg"
            />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gray-700">
              <Play className="h-12 w-12 text-gray-400" />
            </div>
          )}
          
          {/* Overlay with actions */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
            <div className="flex gap-2">
              {onAddToList && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToList();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                >
                  Add to List
                </button>
              )}
              {showRemoveButton && onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Status badge */}
          {showStatus && status && (
            <Badge
              variant={status.toLowerCase() as 'watching' | 'completed' | 'dropped' | 'planning'}
              className="absolute top-2 right-2"
            >
              {status}
            </Badge>
          )}

          {/* Rating badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-lg px-2 py-1">
            <Star className="h-3 w-3 text-yellow-400 fill-current" />
            <span className="text-xs text-white font-medium">
              {formatVoteAverage(content.vote_average)}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold text-gray-100 truncate group-hover:text-red-400 transition-colors">
            {title}
          </h3>
          
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="year" size="sm">
              {year || 'TBA'}
            </Badge>
            <Badge variant="genre" size="sm">
              {contentType === 'movie' ? 'Movie' : 'TV Show'}
            </Badge>
          </div>

          {variant === 'detailed' && content.overview && (
            <p className="text-sm text-gray-400 mt-2 line-clamp-2">
              {content.overview}
            </p>
          )}

          <div className="flex justify-between items-center mt-3">
            {showAddedDate && addedDate && (
              <span className="text-xs text-gray-500">
                Added {new Date(addedDate).toLocaleDateString()}
              </span>
            )}
            {content.vote_count && content.vote_count > 0 && (
              <span className="text-xs text-gray-500">
                {content.vote_count.toLocaleString()} votes
              </span>
            )}
          </div>
        </div>
        </Card>
        
        <ContentDetailsModal
          content={content}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          currentListId={currentListId}
        />
      </>
    );
  }
);

ContentCard.displayName = 'ContentCard';

export { ContentCard };