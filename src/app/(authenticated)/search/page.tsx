import { Suspense } from 'react';
import { SearchClient } from '@/components/search/SearchClient';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function SearchPage() {

  return (
      <Suspense 
        fallback={
          <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <LoadingSpinner size="xl" variant="primary" text="Loading content..." />
          </div>
        }
      >
        <SearchClient />
      </Suspense>
  );
}