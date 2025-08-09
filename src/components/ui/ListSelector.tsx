'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { List } from '@/lib/db/schema';

export interface ListSelectorProps {
  contentType: 'movie' | 'tv';
  contentId: number;
  currentListId?: string;
  onAddToList: (listId: string) => void;
  onRemoveFromList: (listId: string, itemId: string) => void;
  className?: string;
}

export function ListSelector({ contentType, contentId, currentListId, onAddToList, onRemoveFromList, className }: ListSelectorProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [listsWithContent, setListsWithContent] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

const fetchListsWithContent = useCallback(async () => {
  console.log("callback running")
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

  useEffect(() => {
    const fetchLists = async () => {
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
    }
  };

    fetchLists();
    fetchListsWithContent();
  }, [contentId, fetchListsWithContent]);

  
  // Filter lists based on content type
  const filteredLists = lists.filter(list => {
    if (list.listType === 'mixed') return true;
    if (contentType === 'movie' && list.listType === 'movie') return true;
    if (contentType === 'tv' && list.listType === 'tv') return true;
    return false;
  });

  const handleSelectList = (listId: string) => {
    onAddToList(listId);
    setTimeout(() => fetchListsWithContent(), 300);
  };

  const handleRemoveFromList = (listId: string, itemId: string) => {
    onRemoveFromList(listId, itemId);
    setTimeout(() => fetchListsWithContent(), 300);
  };

  if (loading) {
    return (
      <div className={cn('bg-gray-800 rounded-lg p-4', className)}>
        <div className="text-gray-300 text-sm">Loading lists...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('bg-gray-800 rounded-lg p-4', className)}>
        <div className="text-red-400 text-sm mb-2">Error: {error}</div>
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
    <div className={cn('bg-gray-800 rounded-lg p-4', className)}>
      <div className="mb-3">
        <h3 className="text-gray-100 font-medium text-sm mb-1">
          Manage Lists
        </h3>
        <p className="text-gray-400 text-xs">
          Select a compatible list for this {contentType === 'movie' ? 'movie' : 'TV show'}
        </p>
      </div>
      
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {filteredLists.map((list) => {
          const isCurrentList = currentListId === list.id;
          const hasContent = Object.hasOwn(listsWithContent, list.id);
          const itemId = listsWithContent[list.id];
          
          return (
            <button
              key={list.id}
              onClick={() => hasContent ? handleRemoveFromList(list.id, itemId) : handleSelectList(list.id)}

              className={cn(
                "w-full text-left p-3 rounded-lg transition-colors group", "bg-gray-700 hover:bg-gray-600"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-gray-100 font-medium text-sm truncate">
                      {list.name}
                    </div>
                    {isCurrentList && (
                      <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                        Current
                      </span>
                    )}
                    {hasContent && (
                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                        Added
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {list.listType === 'mixed' ? 'Mixed' :
                     list.listType === 'movie' ? 'Movies' : 'TV Shows'} &nbsp;• &nbsp;
                    {list.isPublic ? 'Public' : 'Private'}
                  </div>
                </div>
                <div className="ml-2">
                  {hasContent ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <div className={cn(
                      "transition-opacity",
                    "opacity-0 group-hover:opacity-100"
                    )}>
                      <Plus className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}