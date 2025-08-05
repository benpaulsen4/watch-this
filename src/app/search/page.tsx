'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/client';
import { ArrowLeft, Filter, TrendingUp, Star } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow, TMDBGenre } from '@/lib/tmdb/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ContentCard } from '@/components/ui/ContentCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';

type ContentType = 'all' | 'movie' | 'tv';
type SortBy = 'popularity.desc' | 'vote_average.desc' | 'release_date.desc' | 'title.asc';

export default function SearchPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
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

  const checkAuth = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      if (session?.user) {
        // User is authenticated, continue
      } else {
        router.push('/auth');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  }, [router]);

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
    checkAuth();
    loadGenres();
    loadTrendingContent();
    loadDiscoverContent();
  }, [checkAuth, loadDiscoverContent]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" text="Loading search..." />
      </div>
    );
  }

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
            loading={searchLoading}
            placeholder="Search for movies and TV shows..."
            className="max-w-2xl mx-auto"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <Card variant="entertainment" className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Filters</CardTitle>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Content Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content Type
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as ContentType)}
                    className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 focus:border-red-500 focus:ring-red-500"
                  >
                    <option value="all">All</option>
                    <option value="movie">Movies</option>
                    <option value="tv">TV Shows</option>
                  </select>
                </div>

                {/* Genre */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Genre
                  </label>
                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 focus:border-red-500 focus:ring-red-500"
                  >
                    <option value="">All Genres</option>
                    {genres.map((genre) => (
                      <option key={genre.id} value={genre.id}>
                        {genre.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 focus:border-red-500 focus:ring-red-500"
                  >
                    <option value="">All Years</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 focus:border-red-500 focus:ring-red-500"
                  >
                    <option value="popularity.desc">Most Popular</option>
                    <option value="vote_average.desc">Highest Rated</option>
                    <option value="release_date.desc">Newest</option>
                    <option value="title.asc">Title A-Z</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trending Section (only when not searching) */}
        {!searchQuery && trendingContent.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-red-400" />
              <h2 className="text-xl font-semibold text-gray-100">Trending Today</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-4">
              {trendingContent.map((content) => (
                <ContentCard
                  key={`${content.id}-${'title' in content ? 'movie' : 'tv'}`}
                  content={content}
                  variant="compact"
                  onAddToList={() => {
                    // TODO: Implement add to list functionality
                    console.log('Add to list:', content);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Results Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-100">
              {searchQuery ? `Search Results for "${searchQuery}"` : 'Discover Content'}
            </h2>
            
            {displayContent.length > 0 && (
              <p className="text-sm text-gray-400">
                {displayContent.length} results
              </p>
            )}
          </div>
          
          {searchLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" variant="primary" text="Searching..." />
            </div>
          ) : displayContent.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {displayContent.map((content) => (
                  <ContentCard
                    key={`${content.id}-${'title' in content ? 'movie' : 'tv'}`}
                    content={content}
                    variant="default"
                    onAddToList={() => {
                      // TODO: Implement add to list functionality
                      console.log('Add to list:', content);
                    }}
                  />
                ))}
              </div>
              
              {/* Load More Button */}
              {!searchQuery && hasMore && (
                <div className="flex justify-center mt-8">
                  <Button
                    onClick={loadMore}
                    variant="outline"
                    className="px-8"
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Card variant="entertainment">
              <CardContent className="text-center py-12">
                <Star className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                  {searchQuery ? 'No results found' : 'Start discovering'}
                </h3>
                <p className="text-gray-400">
                  {searchQuery 
                    ? `No content found for "${searchQuery}". Try different keywords or filters.`
                    : 'Use the search bar or filters to discover amazing movies and TV shows.'
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}