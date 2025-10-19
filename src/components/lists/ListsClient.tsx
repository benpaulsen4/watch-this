"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { List } from "@/lib/db";
import { PageHeader } from "../ui/PageHeader";
import { ListCard } from "./ListCard";

export interface ListResponse extends List {
  itemCount: number;
  collaborators: number;
  posterPaths: string[];
}

export default function ListsClient() {
  const router = useRouter();
  const [lists, setLists] = useState<ListResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListIsPublic, setNewListIsPublic] = useState(false);
  const [newListType, setNewListType] = useState("mixed");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLists = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/lists");

        if (!response.ok) {
          throw new Error("Failed to fetch lists");
        }

        const data = await response.json();
        const fetchedLists = data.lists || [];
        setLists(fetchedLists);
      } catch (err) {
        console.error("Error fetching lists:", err);
        setError("Failed to load lists. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchLists();
  }, []);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          listType: newListType,
          isPublic: newListIsPublic,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create list");
      }

      const data = await response.json();
      setLists((prev) => [data.list, ...prev]);

      // Reset form
      setNewListName("");
      setNewListDescription("");
      setNewListIsPublic(false);
      setNewListType("mixed");
      setShowCreateForm(false);
    } catch (err) {
      console.error("Error creating list:", err);
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
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
      <PageHeader title="My Lists" backLinkHref="/dashboard">
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-5 w-5 mr-2" />
          Create List
        </Button>
      </PageHeader>

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
                <label
                  htmlFor="listType"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
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
                    "Create List"
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
              return (
                <ListCard
                  key={list.id}
                  list={list}
                  onClick={() => router.push(`/lists/${list.id}`)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
