'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Users, Lock, Globe, Edit, Share, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ContentCard } from '@/components/ui/ContentCard';
import { toast } from 'sonner';
import type { TMDBMovie, TMDBTVShow } from '@/lib/tmdb/client';

interface ListItem extends TMDBMovie, TMDBTVShow {
  listItemId: string;
  addedAt: string;
  notes: string | null;
  sortOrder: number;
}

interface List {
  id: string;
  name: string;
  description: string | null;
  listType: 'movie' | 'tv' | 'mixed';
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  items: ListItem[];
  collaborators: number;
}

interface ListDetailsClientProps {
  listId: string;
}

export default function ListDetailsClient({ listId }: ListDetailsClientProps) {
  const router = useRouter();
  const [list, setList] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListDetails();
  }, [listId]);

  const fetchListDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/lists/${listId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('List not found');
        } else {
          setError('Failed to load list details');
        }
        return;
      }
      
      const data = await response.json();
      setList(data);
    } catch (err) {
      console.error('Error fetching list details:', err);
      setError('Failed to load list details');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to remove this item from the list?')) return;
    
    try {
      console.log('Attempting to delete item:', itemId, 'from list:', listId);
      
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listItemId: itemId }),
      });
      
      console.log('Delete response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Delete error response:', errorData);
        throw new Error(errorData.error || 'Failed to delete item');
      }
      
      const result = await response.json();
      console.log('Delete success response:', result);
      
      // Update local state
      setList(prev => prev ? {
        ...prev,
        items: prev.items.filter(item => item.listItemId !== itemId)
      } : null);
      
      // Show success feedback
      toast.success('Item removed from list successfully');
    } catch (err) {
      console.error('Error deleting item:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete item';
      toast.error(`Error: ${errorMessage}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" text="Loading list details..." />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="h-8 w-8 text-gray-600" />
          </div>
          <h3 className="text-xl font-medium text-gray-300 mb-2">
            {error || 'List not found'}
          </h3>
          <p className="text-gray-500 mb-6">
            The list you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button onClick={() => router.push('/lists')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lists
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/lists')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-100">{list.name}</h1>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  {list.isPublic ? (
                    <>
                      <Globe className="h-3 w-3" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" />
                      Private
                    </>
                  )}
                  <span>•</span>
                  <span>{list.items.length} items</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{list.collaborators}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Share className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button onClick={() => router.push('/search')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Content
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* List Description */}
        {list.description && (
          <Card className="mb-8 bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <p className="text-gray-300">{list.description}</p>
            </CardContent>
          </Card>
        )}



        {/* List Items */}
        {list.items.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="h-8 w-8 text-gray-600" />
            </div>
            <h3 className="text-xl font-medium text-gray-300 mb-2">
              No content yet
            </h3>
            <p className="text-gray-500 mb-6">
              Start building your list by adding movies and TV shows
            </p>
            <Button onClick={() => router.push('/search')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {list.items.map((item) => {
              // The item now contains complete TMDB data merged with list-specific data
              const { listItemId, addedAt, notes, sortOrder, ...contentData } = item;

              return (
                 <ContentCard
                   key={listItemId}
                   content={contentData as TMDBMovie | TMDBTVShow}
                   showRemoveButton={true}
                   onRemove={() => handleDeleteItem(listItemId)}
                   addedDate={addedAt}
                   showAddedDate={true}
                   currentListId={listId}
                 />
               );
             })}
          </div>
        )}
      </main>
    </div>
  );
}