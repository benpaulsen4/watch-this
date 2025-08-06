'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Users, TrendingUp, Heart } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow } from '@/lib/tmdb/client';
import { Card, CardContent } from '@/components/ui/Card';
import { ContentCard } from '@/components/ui/ContentCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';

export function DashboardClient() {
  const router = useRouter();
  const [trendingContent, setTrendingContent] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(true);

  const loadTrendingContent = useCallback(async () => {
    try {
      const response = await fetch('/api/tmdb/trending?media_type=all&time_window=day');
      if (response.ok) {
        const data = await response.json();
        setTrendingContent(data.results?.slice(0, 8) || []);
      }
    } catch (error) {
      console.error('Failed to load trending content:', error);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=all`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results?.slice(0, 6) || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrendingContent();
  }, [loadTrendingContent]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-red-500">WatchThis</h1>
            </div>
            
            <div className="flex-1 max-w-md mx-8">
              <SearchInput
                value={searchQuery}
                onSearch={handleSearch}
                placeholder="Search movies and TV shows..."
                loading={searchLoading}
              />
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/lists')}>
                <Heart className="h-4 w-4 mr-2" />
                My Lists
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/search')}>
                <Search className="h-4 w-4 mr-2" />
                Discover
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Results */}
        {searchQuery && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-100 mb-6">
              Search Results for &quot;{searchQuery}&quot;
            </h2>
            {searchLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="lg" variant="primary" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                {searchResults.map((item) => (
                  <ContentCard key={item.id} content={item} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">No results found for &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </section>
        )}

        {/* Quick Actions */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-100 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card 
              variant="entertainment" 
              className="cursor-pointer hover:scale-105 transition-transform"
              onClick={() => router.push('/lists')}
            >
              <CardContent className="p-6 text-center">
                <Plus className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-100 mb-2">Create List</h3>
                <p className="text-gray-400 text-sm">
                  Organize your favorite movies and shows
                </p>
              </CardContent>
            </Card>

            <Card 
              variant="entertainment" 
              className="cursor-pointer hover:scale-105 transition-transform"
              onClick={() => router.push('/search')}
            >
              <CardContent className="p-6 text-center">
                <TrendingUp className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-100 mb-2">Discover</h3>
                <p className="text-gray-400 text-sm">
                  Find new content based on your preferences
                </p>
              </CardContent>
            </Card>

            <Card 
              variant="entertainment" 
              className="cursor-pointer hover:scale-105 transition-transform"
            >
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-100 mb-2">Collaborate</h3>
                <p className="text-gray-400 text-sm">
                  Share lists and recommendations with friends
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Trending Content */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">Trending Today</h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => router.push('/search')}
            >
              View All
            </Button>
          </div>
          
          {contentLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" variant="primary" />
            </div>
          ) : trendingContent.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-6">
              {trendingContent.map((item) => (
                <ContentCard key={item.id} content={item} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">No trending content available</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}