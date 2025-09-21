'use client';

import { useState, useEffect, useCallback } from 'react';
import { Globe, Minus, Plus, RotateCcw, Lock, Users, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { List } from '@/lib/db/schema';
import { LoadingSpinner } from './LoadingSpinner';
import { Button } from './Button';
import { Badge } from './Badge';

export interface ListSelectorProps {
  contentType: 'movie' | 'tv';
  contentId: number;
  currentListId?: string;
  onAddToList: (listId: string) => void;
  onRemoveFromList: (listId: string, itemId: string) => void;
  className?: string;
}

export interface ListResult extends List {
  collaborators: number;
}

export function ListSelector({ contentType, contentId, currentListId, onAddToList, onRemoveFromList, className }: ListSelectorProps) {
  const [lists, setLists] = useState<ListResult[]>([]);
  const [listsWithContent, setListsWithContent] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

const fetchListsWithContent = useCallback(async () => {
    try {
      const response = await fetch(`/api/content/${contentId}/lists`);
      if (response.ok) {
        const data = await response.json() as { listId: string; itemId: string }[];

        setListsWithContent(data.reduce((acc, list) => {
          acc[list.listId] = list.itemId;
          return acc;
        }, {} as Record<string, string>));
      }
    } catch (err) {
      console.error('Failed to fetch lists with content:', err);
    }
  }, [contentId]);

const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lists');
      if (!response.ok) {
        throw new Error('Failed to fetch lists');
      }
      const data = await response.json();
      setLists(data.lists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lists');
    } finally {
      setLoading(false);
    }}, [])

  useEffect(() => {
    fetchLists();
    fetchListsWithContent();
  }, [contentId, fetchListsWithContent, fetchLists]);

  
  // Filter lists based on content type
  const filteredLists = lists.filter(list => {
    if (list.listType === 'mixed') return true;
    if (contentType === 'movie' && list.listType === 'movies') return true;
    if (contentType === 'tv' && list.listType === 'tv') return true;
    return false;
  });

  const handleSelectList = (listId: string) => {
    setListsWithContent((prev) => ({
          ...prev,
          [listId]: contentId.toString(),
        }));
    onAddToList(listId);
    setTimeout(() => fetchListsWithContent(), 500);
  };

  const handleRemoveFromList = (listId: string, itemId: string) => {
    setListsWithContent((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [listId]: _, ...rest } = prev;
      return rest;
    });
    onRemoveFromList(listId, itemId);
    setTimeout(() => fetchListsWithContent(), 500);
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <LoadingSpinner size="lg" text='Loading lissts...' />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <p className="text-red-400 mb-4">{error}</p>
        <Button onClick={fetchLists} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (filteredLists.length === 0) {
    return (
      <div className={cn('bg-gray-800 rounded-lg p-4', className)}>
        <div className="text-gray-300 text-sm mb-2">
          No compatible lists found. Create a {contentType === 'movie' ? 'movie' : 'TV show'} or mixed list first.
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-lg font-semibold text-gray-100">Manage Lists</h3>
      
        {filteredLists.map((list) => {
          const isCurrentList = currentListId === list.id;
          const hasContent = Object.hasOwn(listsWithContent, list.id);
          const itemId = listsWithContent[list.id];
          
          return (
            <div key={list.id} className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-100">
                    {list.name}
                  </h4>
                  <div className="text-sm text-gray-400 flex items-center flex-wrap gap-1">
                    {list.listType === 'mixed' ? 'Mixed' :
                     list.listType === 'movies' ? 'Movies' : 'TV Shows'} 
                     <span>&nbsp;•&nbsp;</span>
                    {list.isPublic ? (
                    <>
                      <Globe className="h-3 w-3" />
                      <span>Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" />
                      <span>Private</span>
                    </>
                  )}
                  {list.syncWatchStatus && (
                    <>
                      <span>&nbsp;•&nbsp;</span>
                      <div className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        <span>Sync</span>
                      </div>
                    </>
                  )}
                  {list.collaborators > 0 && (
                    <>
                      <span>&nbsp;•&nbsp;</span>
                      <Users className="h-3 w-3" />
                      <span>{list.collaborators}</span>
                    </>
                  )}
                </div>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap justify-end">     
                  {isCurrentList && (
                      <Badge variant="info">
                        Current
                      </Badge>

                    )}
                    {hasContent && (
                      <Badge variant="success">
                        Added
                      </Badge>
                    )}      
                  <div className="flex gap-1">
                    {hasContent ? (
                      <Button
                        onClick={() => handleRemoveFromList(list.id, itemId)}
                        size="sm"
                        variant="outline"
                        className="text-sm"
                      >
                        <Minus /> &nbsp; Remove
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSelectList(list.id)}
                        size="sm"
                        variant="outline"
                        className="text-sm"
                      >
                        <Plus /> &nbsp; Add
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })}
    </div>
  );
}