'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/client';
import { Plus, Users, Lock, Globe, Edit, Trash2, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface List {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  collaboratorCount: number;
}

export default function ListsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<List[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListIsPublic, setNewListIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);

  // TODO Place this in a shared layout
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

  const loadLists = useCallback(async () => {
    try {
      // TODO: Implement API call to fetch user's lists
      // For now, using mock data
      const mockLists: List[] = [
        {
          id: '1',
          name: 'Must Watch Movies',
          description: 'My collection of must-see films',
          isPublic: true,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-20T15:30:00Z',
          itemCount: 12,
          collaboratorCount: 3
        },
        {
          id: '2',
          name: 'TV Series Backlog',
          description: 'Shows I need to catch up on',
          isPublic: false,
          createdAt: '2024-01-10T08:00:00Z',
          updatedAt: '2024-01-18T12:00:00Z',
          itemCount: 8,
          collaboratorCount: 1
        }
      ];
      setLists(mockLists);
    } catch (error) {
      console.error('Failed to load lists:', error);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    loadLists();
  }, [checkAuth, loadLists]);



  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setCreating(true);
    try {
      // TODO: Implement API call to create list
      const newList: List = {
        id: Date.now().toString(),
        name: newListName,
        description: newListDescription || undefined,
        isPublic: newListIsPublic,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        itemCount: 0,
        collaboratorCount: 0
      };
      
      setLists(prev => [newList, ...prev]);
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      setNewListIsPublic(false);
    } catch (error) {
      console.error('Failed to create list:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;

    try {
      // TODO: Implement API call to delete list
      setLists(prev => prev.filter(list => list.id !== listId));
    } catch (error) {
      console.error('Failed to delete list:', error);
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
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-gray-100">My Lists</h1>
            </div>
            
            <Button 
              onClick={() => setShowCreateForm(true)}
              className="bg-red-600 hover:bg-red-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create List
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create List Form */}
        {showCreateForm && (
          <Card variant="entertainment" className="mb-8">
            <CardHeader>
              <CardTitle>Create New List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="List Name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Enter list name..."
                required
              />
              
              <Input
                label="Description (Optional)"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                placeholder="Describe your list..."
              />
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newListIsPublic}
                  onChange={(e) => setNewListIsPublic(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                />
                <label htmlFor="isPublic" className="text-sm text-gray-300">
                  Make this list public
                </label>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={handleCreateList}
                  disabled={!newListName.trim() || creating}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {creating ? 'Creating...' : 'Create List'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lists Grid */}
        {lists.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lists.map((list) => (
              <Card 
                key={list.id} 
                variant="entertainment" 
                hover="lift"
                className="cursor-pointer"
                onClick={() => router.push(`/lists/${list.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{list.name}</CardTitle>
                      {list.description && (
                        <p className="text-sm text-gray-400 mt-1">{list.description}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement edit functionality
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>{list.itemCount} items</span>
                      <span>{list.collaboratorCount} collaborators</span>
                    </div>
                    
                    {/* Badges */}
                    <div className="flex items-center gap-2">
                      <Badge variant={list.isPublic ? 'success' : 'secondary'} size="sm">
                        {list.isPublic ? (
                          <><Globe className="h-3 w-3 mr-1" /> Public</>
                        ) : (
                          <><Lock className="h-3 w-3 mr-1" /> Private</>
                        )}
                      </Badge>
                      
                      {list.collaboratorCount > 0 && (
                        <Badge variant="default" size="sm">
                          <Users className="h-3 w-3 mr-1" />
                          Shared
                        </Badge>
                      )}
                    </div>
                    
                    {/* Last updated */}
                    <p className="text-xs text-gray-500">
                      Updated {new Date(list.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card variant="entertainment">
            <CardContent className="text-center py-12">
              <Plus className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-300 mb-2">
                No lists yet
              </h3>
              <p className="text-gray-400 mb-6">
                Create your first list to start organizing your favorite movies and TV shows
              </p>
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First List
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}