'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Users, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface List {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  itemCount: number;
  collaborators: number;
  createdAt: string;
  updatedAt: string;
}

export default function ListsClient() {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListIsPublic, setNewListIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);



  useEffect(() => {
    // Mock data for demonstration
    const mockLists: List[] = [
      {
        id: '1',
        name: 'Must Watch Movies',
        description: 'My collection of must-see films',
        isPublic: true,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-20T15:30:00Z',
        itemCount: 12,
        collaborators: 3
      },
      {
        id: '2',
        name: 'TV Series Backlog',
        description: 'Shows I need to catch up on',
        isPublic: false,
        createdAt: '2024-01-10T08:00:00Z',
        updatedAt: '2024-01-18T12:00:00Z',
        itemCount: 8,
        collaborators: 1
      },
      {
        id: '3',
        name: 'Comedy Specials',
        description: 'Stand-up and comedy shows',
        isPublic: true,
        createdAt: '2024-01-12T14:00:00Z',
        updatedAt: '2024-01-16T09:30:00Z',
        itemCount: 5,
        collaborators: 0
      }
    ];
    setLists(mockLists);
    setLoading(false);
  }, []);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setCreating(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newList: List = {
      id: Date.now().toString(),
      name: newListName,
      description: newListDescription,
      isPublic: newListIsPublic,
      itemCount: 0,
      collaborators: 1,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };

    setLists(prev => [newList, ...prev]);
    setNewListName('');
    setNewListDescription('');
    setNewListIsPublic(false);
    setShowCreateForm(false);
    setCreating(false);
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return;
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setLists(prev => prev.filter(list => list.id !== listId));
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
            {lists.map((list) => (
              <Card key={list.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-gray-100 text-lg mb-1">
                        {list.name}
                      </CardTitle>
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
                      onClick={() => handleDeleteList(list.id)}
                      className="text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent>
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
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => router.push(`/lists/${list.id}`)}
                    >
                      View List
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        // TODO: Implement edit functionality
                        console.log('Edit list:', list.id);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-600 mt-3">
                    Updated {new Date(list.updatedAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}