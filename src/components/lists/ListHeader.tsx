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
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import CollaborationModal from "./CollaborationModal";
import ListSettingsModal from "./ListSettingsModal";
import { useUser } from "../providers/AuthProvider";
import { PageHeader } from "../ui/PageHeader";
import { GetListResponse } from "@/lib/lists/types";

interface ListHeaderProps {
  initialList: GetListResponse;
}

export default function ListHeader({ initialList }: ListHeaderProps) {
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
    isArchived?: boolean;
    syncWatchStatus?: boolean;
  }) => {
    setList((prev) => ({ ...prev, ...updatedList }));
    router.refresh();
  };

  const handleListDelete = () => {
    router.push("/lists");
  };

  return (
    <>
      <PageHeader
        title={list.name}
        backLinkHref="/lists"
        subheaderSlot={
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {list.isArchived && (
              <>
                <Archive className="h-3 w-3" />
                <span className="hidden sm:block">Archived</span>
                <span>•</span>
              </>
            )}
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
              <span>{list.itemCount}</span>
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

      {/* List Description */}
      {list.description && (
        <Card className="sm:max-w-7xl sm:mx-auto mx-4 mt-6 bg-gray-900 border-gray-800">
          <CardContent>
            <p className="text-gray-300">{list.description}</p>
          </CardContent>
        </Card>
      )}

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
    </>
  );
}
