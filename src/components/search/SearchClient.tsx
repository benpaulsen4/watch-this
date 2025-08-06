'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Filter, TrendingUp } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow, TMDBGenre } from '@/lib/tmdb/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ContentCard } from '@/components/ui/ContentCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';

type ContentType = 'all' | 'movie' | 'tv';
type SortBy = 'popularity.desc' | 'vote_average.desc' | 'release_date.desc' | 'title.asc';

export function SearchClient() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('all');
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('popularity.desc');
  const [showFilters, setShowFilters] = useState(false);
  const [trendingContent, setTrendingContent] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [discoverContent, setDiscoverContent] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);

  const loadGenres = async () => {
    try {
      const response = await fetch('/api/tmdb/genres?type=all');
      if (response.ok) {
        const data = await response.json();
        setGenres(data.genres || []);
      }
    } catch (error) {
      console.error('Failed to load genres:', error);
    }
  };

  const loadTrendingContent = async () => {
    try {
      const response = await fetch('/api/tmdb/trending?media_type=all&time_window=day');
      if (response.ok) {
        const data = await response.json();
        setTrendingContent(data.results?.slice(0, 10) || []);
      }
    } catch (error) {
      console.error('Failed to load trending content:', error);
    }
  };

  const loadDiscoverContent = useCallback(async (pageNum = 1, append = false) => {
    try {
      const params = new URLSearchParams({
        type: contentType === 'all' ? 'movie' : contentType,
        page: pageNum.toString(),
        sort_by: sortBy
      });
      
      if (selectedGenre) params.append('with_genres', selectedGenre);
      if (selectedYear) params.append('year', selectedYear);

      const response = await fetch(`/api/tmdb/discover?${params}`);
      if (response.ok) {
        const data = await response.json();
        const newResults = data.results || [];
        
        if (append) {
          setDiscoverContent(prev => [...prev, ...newResults]);
        } else {
          setDiscoverContent(newResults);
        }
        
        setHasMore(pageNum < (data.total_pages || 1));
      }
    } catch (error) {
      console.error('Failed to load discover content:', error);
    } finally {
      setContentLoading(false);
    }
  }, [contentType, sortBy, selectedGenre, selectedYear]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      loadDiscoverContent();
      return;
    }

    setSearchLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        type: contentType
      });
      
      const response = await fetch(`/api/tmdb/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  }, [contentType, loadDiscoverContent]);

  useEffect(() => {
    loadGenres();
    loadTrendingContent();
    loadDiscoverContent();
  }, [loadDiscoverContent]);

  useEffect(() => {
    if (searchQuery) {
      handleSearch(searchQuery);
    } else {
      loadDiscoverContent();
    }
  }, [contentType, selectedGenre, selectedYear, sortBy, searchQuery, handleSearch, loadDiscoverContent]);

  const loadMore = () => {
    if (!searchQuery && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadDiscoverContent(nextPage, true);
    }
  };

  const clearFilters = () => {
    setSelectedGenre('');
    setSelectedYear('');
    setSortBy('popularity.desc');
    setContentType('all');
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

  const displayContent = searchQuery ? searchResults : discoverContent;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-gray-100">Discover</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-8">
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search movies and TV shows..."
            loading={searchLoading}
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <Card variant="entertainment" className="mb-8">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content Type
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as ContentType)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100"
                  >
                    <option value="all">All</option>
                    <option value="movie">Movies</option>
                    <option value="tv">TV Shows</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Genre
                  </label>
                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100"
                  >
                    <option value="">All Genres</option>
                    {genres.map((genre) => (
                      <option key={genre.id} value={genre.id}>
                        {genre.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100"
                  >
                    <option value="">All Years</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100"
                  >
                    <option value="popularity.desc">Popularity</option>
                    <option value="vote_average.desc">Rating</option>
                    <option value="release_date.desc">Release Date</option>
                    <option value="title.asc">Title</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">
              {searchQuery ? `Search Results for "${searchQuery}"` : 'Discover Content'}
            </h2>
          </div>

          {(searchLoading || contentLoading) ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" variant="primary" />
            </div>
          ) : displayContent.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {displayContent.map((item) => (
                  <ContentCard key={item.id} content={item} />
                ))}
              </div>
              
              {!searchQuery && hasMore && (
                <div className="flex justify-center mt-8">
                  <Button onClick={loadMore} variant="outline">
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">
                {searchQuery ? `No results found for "${searchQuery}"` : 'No content available'}
              </p>
            </div>
          )}
        </section>

        {/* Trending Sidebar */}
        {!searchQuery && trendingContent.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-red-400" />
              <h3 className="text-xl font-semibold text-gray-100">Trending Today</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {trendingContent.map((item) => (
                <ContentCard key={item.id} content={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}