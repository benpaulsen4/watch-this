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
  onContentClick?: (content: TMDBMovie | TMDBTVShow) => void;
  // List-specific props
  onRemoveFromList?: () => void;
  addedDate?: string;
  showAddedDate?: boolean;
  currentListId?: string;
}

const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
  ({ 
    content, 
    onContentClick,
    addedDate,
    showAddedDate = false,
    currentListId,
    className, 
    onRemoveFromList,
    ...props 
  }, ref) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    
    const handleCardClick = () => {
      if (onContentClick) {
        onContentClick(content);
      } else {
        setIsModalOpen(true);
      }
    };

    const onClose = () => {
      setIsModalOpen(false);
      if (isRemoving) {
        onRemoveFromList?.();
      }
    }

    const title = getContentTitle(content);
    const releaseDate = getContentReleaseDate(content);
    const contentType = getContentType(content);
    const posterUrl = getImageUrl(content.poster_path, 'w342');
    const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

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
          onClose={onClose}
          currentListId={currentListId}
          onRemove={() => setIsRemoving(true)}
        />
      </>
    );
  }
);

ContentCard.displayName = 'ContentCard';

export { ContentCard };