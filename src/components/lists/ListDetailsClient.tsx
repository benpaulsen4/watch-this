"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
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
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb/client";
import CollaborationModal from "./CollaborationModal";
import ListSettingsModal from "./ListSettingsModal";
import { useUser } from "../providers/AuthProvider";
import { PageHeader } from "../ui/PageHeader";
import { ContentCard } from "../content/ContentCard";
import { GetListResponse } from "@/lib/lists/types";

interface ListDetailsClientProps {
  initialList: GetListResponse;
}

export default function ListDetailsClient({
  initialList,
}: ListDetailsClientProps) {
  const router = useRouter();
  const user = useUser();
  const [list, setList] = useState<GetListResponse>(initialList);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const handleListUpdate = (updatedList: {
    name?: string;
    description?: string | null;
    listType?: "mixed" | "movies" | "tv";
    isPublic?: boolean;
    syncWatchStatus?: boolean;
  }) => {
    setList((prev) => ({ ...prev, ...updatedList }));
  };

  const handleListDelete = () => {
    router.push("/lists");
  };

  const handleContentRemoved = (listItemId: string) => {
    setList((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.listItemId !== listItemId),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader
        title={list.name}
        backLinkHref="/lists"
        subheaderSlot={
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
            {list.collaborators > 0 && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{list.collaborators}</span>
                  <span className="hidden sm:block">collaborators</span>
                </div>
              </>
            )}
            <span>•</span>
            <div className="flex items-center gap-1">
              <FileStack className="h-3 w-3" />
              <span>{list.items.length}</span>
              <span className="hidden sm:block">items</span>
            </div>
          </div>
        }
      >
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
      </PageHeader>

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
                  currentListId={list.id}
                  onRemoveFromList={() => handleContentRemoved(listItemId)}
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
        listId={list.id}
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
