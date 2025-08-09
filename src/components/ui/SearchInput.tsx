import { forwardRef, useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './Input';
import { Button } from './Button';
import { Search, X } from 'lucide-react';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  onSearch?: (query: string) => void;
  onClear?: () => void;
  loading?: boolean;
  debounceMs?: number;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ 
    className, 
    onSearch, 
    onClear, 
    loading = false,
    debounceMs = 500,
    value: controlledValue,
    defaultValue,
    ...props 
  }, ref) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? defaultValue ?? '');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Clear timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set a new timeout
      timeoutRef.current = setTimeout(() => {
        onSearch?.(newValue);
      }, debounceMs);
    };

    const handleClear = () => {
      setInternalValue('');
      onClear?.();
      onSearch?.('');
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    return (
      <div className={cn('relative flex items-center gap-2', className)}>
        <div className="relative flex-1">
          {/* Search icon */}
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          
          {/* Input */}
          <Input
            ref={ref}
            value={internalValue}
            onChange={handleChange}
            size="default"
            className="pl-10 pr-10"
            placeholder="Search movies and TV shows..."
            {...props}
          />
          
          {/* Clear button */}
          {internalValue && (
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
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };