import { forwardRef, useState } from 'react';
import { cn, debounce } from '@/lib/utils';
import { Input } from './Input';
import { Button } from './Button';
import { Search, X, Filter } from 'lucide-react';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  onSearch?: (query: string) => void;
  onClear?: () => void;
  onFilterClick?: () => void;
  showFilter?: boolean;
  loading?: boolean;
  debounceMs?: number;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ 
    className, 
    onSearch, 
    onClear, 
    onFilterClick,
    showFilter = false,
    loading = false,
    debounceMs = 300,
    value: controlledValue,
    defaultValue,
    ...props 
  }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue || '');
    const value = controlledValue !== undefined ? controlledValue : internalValue;

    // Create debounced search function
    const debouncedSearch = debounce((...args: unknown[]) => {
      const query = args[0] as string;
      onSearch?.(query);
    }, debounceMs) as (query: string) => void;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      
      // Call debounced search
      debouncedSearch(newValue);
    };

    const handleClear = () => {
      if (controlledValue === undefined) {
        setInternalValue('');
      }
      onClear?.();
      onSearch?.('');
    };

    return (
      <div className={cn('relative flex items-center gap-2', className)}>
        <div className="relative flex-1">
          {/* Search icon */}
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          
          {/* Input */}
          <Input
            ref={ref}
            value={value}
            onChange={handleChange}
            size="default"
            className="pl-10 pr-10"
            placeholder="Search movies and TV shows..."
            {...props}
          />
          
          {/* Clear button */}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClear}
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-400 hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          {/* Loading indicator */}
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-red-500" />
            </div>
          )}
        </div>
        
        {/* Filter button */}
        {showFilter && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onFilterClick}
            className="flex-shrink-0"
          >
            <Filter className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };