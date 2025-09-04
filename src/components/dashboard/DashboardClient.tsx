'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Heart } from 'lucide-react';
import type { TMDBMovie, TMDBTVShow } from '@/lib/tmdb/client';
import { ContentCard } from '@/components/ui/ContentCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import {ProfileImage} from '@/components/ui';
import { getCurrentSession } from '@/lib/auth/client';
import { ActivityFeed } from "@/components/activity/ActivityFeed";

export function DashboardClient() {
  const router = useRouter();
  const [trendingContent, setTrendingContent] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string; profilePictureUrl?: string | null } | null>(null);

  const loadTrendingContent = useCallback(async () => {
    try {
      const response = await fetch('/api/tmdb/trending?media_type=all&time_window=day');
      if (response.ok) {
        const data = await response.json();
        setTrendingContent(data.results?.slice(0, 6) || []);
      }
    } catch (error) {
      console.error('Failed to load trending content:', error);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const loadUserSession = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      if (session?.user) {
        setUser(session.user);
      }
    } catch (error) {
      console.error('Failed to load user session:', error);
    }
  }, []);

  useEffect(() => {
    loadTrendingContent();
    loadUserSession();
  }, [loadTrendingContent, loadUserSession]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-red-500">WatchThis</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/lists')}>
                <Heart className="h-4 w-4" />
                <span className='ml-2 hidden sm:block'>My Lists</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/search')}>
                <Search className="h-4 w-4" />
                <span className='ml-2 hidden sm:block'>Discover</span>
              </Button>
              {user && (
                <button
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors border border-gray-700 hover:border-gray-600"
                  title="Profile Settings"
                >
                  <ProfileImage
                    src={user.profilePictureUrl}
                    username={user.username}
                    size="sm"
                  />
                  <span className="text-gray-100 text-sm font-medium hidden sm:block">
                    {user.username}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Activity Feed */}
        <section className="mb-8">
          <ActivityFeed currentUsername={user?.username ?? ''} />
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
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
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