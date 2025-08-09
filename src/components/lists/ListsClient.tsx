'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Users, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getImageUrl } from '@/lib/tmdb/client';
import Image from 'next/image';

interface List {
  id: string;
  name: string;
  description: string | null;
  listType: string;
  isPublic: boolean;
  ownerId: string;
  itemCount: number;
  collaborators: number;
  createdAt: string;
  updatedAt: string;
}

interface ListItem {
  id: string;
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  notes: string | null;
  addedAt: string;
  sortOrder: number;
}

export default function ListsClient() {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListIsPublic, setNewListIsPublic] = useState(false);
  const [newListType, setNewListType] = useState('mixed');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listItems, setListItems] = useState<Record<string, ListItem[]>>({});



  const fetchListItems = async (listId: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return data.items || [];
    } catch (err) {
      console.error('Error fetching list items:', err);
      return [];
    }
  };

  useEffect(() => {
    const fetchLists = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/lists', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch lists');
        }
        
        const data = await response.json();
        const fetchedLists = data.lists || [];
        setLists(fetchedLists);
        
        // Fetch items for each list to create collages
        const itemsPromises = fetchedLists.map(async (list: List) => {
          const items = await fetchListItems(list.id);
          return { listId: list.id, items: items.slice(0, 4) }; // Only need first 4 for collage
        });
        
        const allItems = await Promise.all(itemsPromises);
        const itemsMap: Record<string, ListItem[]> = {};
        allItems.forEach(({ listId, items }) => {
          itemsMap[listId] = items;
        });
        setListItems(itemsMap);
      } catch (err) {
        console.error('Error fetching lists:', err);
        setError('Failed to load lists. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchLists();
  }, []);

  const CollagePreview = ({ items }: { items: ListItem[] }) => {
    const placeholderCount = Math.max(0, 4 - items.length);
    const placeholders = Array(placeholderCount).fill(null);
    
    // Debug logging
    console.log('CollagePreview items:', items);
    
    return (
      <div className="grid grid-cols-2 gap-1 w-full h-24 mb-4 rounded-lg overflow-hidden bg-gray-800">
        {items.map((item, index) => {
          // Debug each item
          console.log(`Item ${index}:`, item);
          console.log(`Poster path:`, item.posterPath);
          
          return (
            <div key={item.id} className="relative bg-gray-700 aspect-[2/3]">
              {item.posterPath ? (
                <Image
                  src={getImageUrl(item.posterPath, 'w185') || ''}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50px, 75px"
                  onError={(e) => console.error('Image load error:', e)}
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-xs text-gray-500 text-center p-1">{item.title}</span>
                </div>
              )}
            </div>
          );
        })}
        {placeholders.map((_, index) => (
          <div key={`placeholder-${index}`} className="bg-gray-700 aspect-[2/3] flex items-center justify-center">
            <Plus className="h-4 w-4 text-gray-500" />
          </div>
        ))}
      </div>
    );
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setCreating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          listType: newListType,
          isPublic: newListIsPublic,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create list');
      }
      
      const data = await response.json();
      setLists(prev => [data.list, ...prev]);
      
      // Reset form
      setNewListName('');
      setNewListDescription('');
      setNewListIsPublic(false);
      setNewListType('mixed');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating list:', err);
      setError(err instanceof Error ? err.message : 'Failed to create list');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;
    
    try {
      setError(null);
      
      const response = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete list');
      }
      
      setLists(prev => prev.filter(list => list.id !== listId));
    } catch (err) {
      console.error('Error deleting list:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" text="Loading lists..." />
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
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-gray-100">My Lists</h1>
            </div>
            
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create List
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-800 rounded-lg">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Create List Form */}
        {showCreateForm && (
          <Card className="mb-8 bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-gray-100">Create New List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  List Name *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Enter list name"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="Describe your list (optional)"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              
              <div>
                <label htmlFor="listType" className="block text-sm font-medium text-gray-300 mb-2">
                  List Type
                </label>
                <select
                  id="listType"
                  value={newListType}
                  onChange={(e) => setNewListType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="mixed">Mixed (Movies & TV Shows)</option>
                  <option value="movies">Movies Only</option>
                  <option value="tv">TV Shows Only</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newListIsPublic}
                  onChange={(e) => setNewListIsPublic(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-800 text-red-600 focus:ring-red-500"
                />
                <label htmlFor="isPublic" className="text-sm text-gray-300">
                  Make this list public
                </label>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={handleCreateList} 
                  disabled={!newListName.trim() || creating}
                >
                  {creating ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create List'
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lists Grid */}
        {lists.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="h-8 w-8 text-gray-600" />
            </div>
            <h3 className="text-xl font-medium text-gray-300 mb-2">
              No lists yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create your first list to start organizing your favorite content
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First List
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lists.map((list) => {
              const items = listItems[list.id] || [];
              
              return (
                <Card 
                  key={list.id} 
                  className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-all cursor-pointer hover:shadow-xl hover:shadow-black/25 group"
                  onClick={() => router.push(`/lists/${list.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-gray-100 text-lg group-hover:text-white transition-colors">
                            {list.name}
                          </CardTitle>
                          <span className="px-2 py-1 text-xs bg-blue-600 text-blue-100 rounded-full capitalize">
                            {list.listType}
                          </span>
                        </div>
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
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        className="text-gray-400 hover:text-red-400 hover:bg-gray-800 active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    {/* Collage Preview */}
                    <CollagePreview items={items} />
                    
                    {list.description && (
                      <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                        {list.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span>{list.itemCount} items</span>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{list.collaborators}</span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-600 mt-3">
                      Updated {new Date(list.updatedAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}