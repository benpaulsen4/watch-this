'use client';

import { cn } from '@/lib/utils';
import { getAvailableStatuses, getStatusConfig } from './StatusBadge';
import { WatchStatusEnum, ContentTypeEnum } from '@/lib/db/schema';

export interface StatusSegmentedSelectorProps {
  value: WatchStatusEnum | null;
  contentType: ContentTypeEnum;
  onValueChange: (status: WatchStatusEnum) => void;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
}

/**
 * StatusSegmentedSelector component for selecting watch status with segmented radio button interface
 * 
 * @param value - Current selected status
 * @param contentType - Content type (movie/tv) to determine available statuses
 * @param onValueChange - Callback when status changes
 * @param disabled - Whether the selector is disabled
 * @param className - Additional CSS classes
 * @param size - Size variant
 */
export function StatusSegmentedSelector({
  value,
  contentType,
  onValueChange,
  disabled = false,
  className,
  size = 'default'
}: StatusSegmentedSelectorProps) {
  const availableStatuses = getAvailableStatuses(contentType);
  
  // Color mapping for status indicators
  const statusColors = {
    planning: 'bg-yellow-400',
    watching: 'bg-green-400',
    paused: 'bg-orange-400',
    completed: 'bg-blue-400',
    dropped: 'bg-red-400'
  } as const;
  
  const sizeClasses = {
    sm: {
      container: 'p-1',
      button: 'px-2 py-1 text-xs min-h-[24px]',
      text: 'text-xs'
    },
    default: {
      container: 'p-1',
      button: 'px-3 py-1.5 text-sm min-h-[32px]',
      text: 'text-sm'
    },
    lg: {
      container: 'p-1.5',
      button: 'px-4 py-2 text-base min-h-[40px]',
      text: 'text-base'
    }
  };

  const handleStatusChange = (status: WatchStatusEnum) => {
    if (!disabled) {
      onValueChange(status);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, status: WatchStatusEnum) => {
    if (disabled) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleStatusChange(status);
    }
  };

  return (
    <div 
      className={cn(
        'inline-flex flex-wrap bg-gray-800 border border-gray-600 rounded-lg',
        'focus-within:ring-2 focus-within:ring-red-500 focus-within:border-transparent',
        'justify-center sm:justify-start',
        disabled && 'opacity-50 cursor-not-allowed',
        sizeClasses[size].container,
        className
      )}
      role="radiogroup"
      aria-label={`Select watch status for ${contentType}`}
    >
      {availableStatuses.map((status) => {
        const config = getStatusConfig(status);
        const isSelected = value === status;
        
        return (
          <button
            key={status}
            type="button"
            onClick={() => handleStatusChange(status)}
            onKeyDown={(e) => handleKeyDown(e, status)}
            disabled={disabled}
            className={cn(
              'relative flex items-center justify-center gap-1.5',
              'rounded-md transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800',
              'disabled:cursor-not-allowed',
              sizeClasses[size].button,
              isSelected
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            )}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${config?.label || status} status${config?.description ? `: ${config.description}` : ''}`}
          >
            {config && (
              <>
                <span 
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    isSelected ? 'bg-white' : statusColors[status]
                  )}
                  aria-hidden="true"
                />
                <span className={cn(
                  'font-medium truncate',
                  sizeClasses[size].text
                )}>
                  {config.label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default StatusSegmentedSelector;