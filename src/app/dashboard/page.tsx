'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession, signOut } from '@/lib/auth/client';
import { Plus, Search, TrendingUp, Clock, Users, Settings, LogOut } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow } from '@/lib/tmdb/client';
import { Card, CardContent } from '@/components/ui/Card';
import { ContentCard } from '@/components/ui/ContentCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';

interface User {
  id: string;
  username: string;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendingContent, setTrendingContent] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // TODO Place this in a shared layout
  const checkAuth = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      if (session?.user) {
        setUser(session.user);
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

  const loadTrendingContent = useCallback(async () => {
    try {
      const response = await fetch('/api/tmdb/trending?media_type=all&time_window=week');
      if (response.ok) {
        const data = await response.json();
        setTrendingContent(data.results?.slice(0, 8) || []);
      }
    } catch (error) {
      console.error('Failed to load trending content:', error);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    loadTrendingContent();
  }, [checkAuth, loadTrendingContent]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=multi`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results?.slice(0, 6) || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                WatchThis
              </h1>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md mx-8">
              <SearchInput
                value={searchQuery}
                onSearch={handleSearch}
                loading={searchLoading}
                placeholder="Search movies and TV shows..."
              />
            </div>

            {/* User Menu TODO place header components in shared layout*/}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-300">Welcome, {user?.username}</span>
              <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Results */}
        {searchQuery && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Search Results for &quot;{searchQuery}&quot;
            </h2>
            {searchLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="lg" variant="primary" text="Searching..." />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {searchResults.map((content) => (
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
            ) : (
              <p className="text-gray-400 text-center py-8">No results found for &quot;{searchQuery}&quot;</p>
            )}
          </section>
        )}

        {/* Quick Actions */}
        <section className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="entertainment" hover="lift" className="cursor-pointer" onClick={() => router.push('/lists')}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20">
                  <Plus className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100">Create List</h3>
                  <p className="text-sm text-gray-400">Start a new watchlist</p>
                </div>
              </CardContent>
            </Card>

            <Card variant="entertainment" hover="lift" className="cursor-pointer" onClick={() => router.push('/search')}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/20">
                  <Search className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100">Discover</h3>
                  <p className="text-sm text-gray-400">Find new content</p>
                </div>
              </CardContent>
            </Card>

            <Card variant="entertainment" hover="lift" className="cursor-pointer">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/20">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100">Collaborate</h3>
                  <p className="text-sm text-gray-400">Share with friends</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Trending This Week */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-red-400" />
            <h2 className="text-xl font-semibold text-gray-100">Trending This Week</h2>
          </div>
          
          {trendingContent.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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
          ) : (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" variant="primary" text="Loading trending content..." />
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Clock className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-100">Recent Activity</h2>
          </div>
          
          <Card variant="entertainment">
            <CardContent className="p-6">
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                {/* TODO Add recent activity logic */}
                <p className="text-gray-400">No recent activity</p>
                <p className="text-sm text-gray-500 mt-1">
                  Start adding movies and TV shows to see your activity here
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}