"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  Lock,
  Globe,
  Share,
  Settings,
  FileStack,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb/client";
import CollaborationModal from "./CollaborationModal";
import ListSettingsModal from "./ListSettingsModal";
import { useUser } from "../providers/AuthProvider";
import { ContentCard } from "../content/ContentCard";

interface ListItem extends TMDBMovie, TMDBTVShow {
  listItemId: string;
  createdAt: string;
}

interface List {
  id: string;
  name: string;
  description: string | null;
  listType: "movie" | "tv" | "mixed";
  isPublic: boolean;
  syncWatchStatus: boolean;
  ownerId: string;
  ownerUsername?: string;
  ownerProfilePictureUrl?: string | null;
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
  const user = useUser();
  const [list, setList] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const fetchListDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/lists/${listId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("List not found");
        } else {
          setError("Failed to load list details");
        }
        return;
      }

      const data = await response.json();
      setList(data);
    } catch (err) {
      console.error("Error fetching list details:", err);
      setError("Failed to load list details");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    fetchListDetails();
  }, [fetchListDetails]);

  const handleListUpdate = (updatedList: Partial<List>) => {
    setList((prev) => (prev ? { ...prev, ...updatedList } : null));
  };

  const handleListDelete = () => {
    router.push("/lists");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner
          size="xl"
          variant="primary"
          text="Loading list details..."
        />
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
            {error || "List not found"}
          </h3>
          <p className="text-gray-500 mb-6">
            The list you&apos;re looking for doesn&apos;t exist or has been
            deleted.
          </p>
          <Button onClick={() => router.push("/lists")}>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/lists")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-100">{list.name}</h1>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  {list.isPublic ? (
                    <>
                      <Globe className="h-3 w-3" />
                      <span className="hidden sm:block">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" />
                      <span className="hidden sm:block">Private</span>
                    </>
                  )}
                  {list.syncWatchStatus && (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        <span className="hidden sm:block">Sync</span>
                      </div>
                    </>
                  )}
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <FileStack className="h-3 w-3" />
                    <span>{list.items.length}</span>
                    <span className="hidden sm:block">items</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{list.collaborators}</span>
                    <span className="hidden sm:block">collaborators</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCollaborationModal(true)}
              >
                <Share className="h-4 w-4" />
                <span className="ml-2 hidden sm:block">Share</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsModal(true)}
              >
                <Settings className="h-4 w-4" />
                <span className="ml-2 hidden sm:block">Settings</span>
              </Button>
              <Button onClick={() => router.push("/search")}>
                <Plus className="h-5 w-5" />
                <span className="ml-2 hidden sm:block">Add Content</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* List Description */}
        {list.description && (
          <Card className="mb-8 bg-gray-900 border-gray-800">
            <CardContent>
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
            <Button onClick={() => router.push("/search")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
            {list.items.map((item) => {
              // The item now contains complete TMDB data merged with list-specific data
              const { listItemId, createdAt, ...contentData } = item;

              return (
                <ContentCard
                  key={listItemId}
                  content={contentData as TMDBMovie | TMDBTVShow}
                  addedDate={createdAt}
                  showAddedDate={true}
                  currentListId={listId}
                  onRemoveFromList={() => fetchListDetails()}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Collaboration Modal */}
      <CollaborationModal
        isOpen={showCollaborationModal}
        onClose={() => setShowCollaborationModal(false)}
        listId={listId}
        listName={list?.name || ""}
        isOwner={user?.id === list?.ownerId}
        ownerUsername={list?.ownerUsername}
        ownerProfilePictureUrl={list?.ownerProfilePictureUrl}
      />

      {/* List Settings Modal */}
      {list && (
        <ListSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          list={list}
          isOwner={user?.id === list.ownerId}
          onListUpdate={handleListUpdate}
          onListDelete={handleListDelete}
        />
      )}
    </div>
  );
}
