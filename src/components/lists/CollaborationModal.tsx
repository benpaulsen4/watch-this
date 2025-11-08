"use client";

import { useState } from "react";
import { UserPlus, Trash2, Users } from "lucide-react";
import { PermissionLevel, type PermissionLevelEnum } from "@/lib/db/schema";
import { ProfileImage } from "../ui/ProfileImage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Collaborator {
  id: string;
  userId: string;
  username: string;
  profilePictureUrl?: string | null;
  permissionLevel: string;
  createdAt: string;
}

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  isOwner: boolean;
  ownerUsername?: string;
  ownerProfilePictureUrl?: string | null;
}

export default function CollaborationModal({
  isOpen,
  onClose,
  listId,
  listName,
  isOwner,
  ownerUsername,
  ownerProfilePictureUrl,
}: CollaborationModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPermissionLevel, setNewPermissionLevel] =
    useState<PermissionLevelEnum>(PermissionLevel.COLLABORATOR);
  const [addingCollaborator, setAddingCollaborator] = useState(false);

  const queryClient = useQueryClient();

  const collaboratorsQuery = useQuery<{ collaborators: Collaborator[] }>({
    queryKey: ["lists", listId, "collaborators"],
    enabled: isOpen && isOwner,
    queryFn: async () => {
      const response = await fetch(`/api/lists/${listId}/collaborators`);
      if (!response.ok) throw new Error("Failed to fetch collaborators");
      const data = await response.json();
      return data;
    },
  });

  const addCollaborator = async () => {
    if (!newUsername.trim()) {
      setError("Username is required");
      return;
    }
    setError(null);
    setSuccess(null);
    addCollaboratorMutation.mutate({
      username: newUsername.trim(),
      permissionLevel: newPermissionLevel,
    });
  };

  const addCollaboratorMutation = useMutation({
    mutationFn: async ({
      username,
      permissionLevel,
    }: {
      username: string;
      permissionLevel: PermissionLevelEnum;
    }) => {
      setAddingCollaborator(true);
      const response = await fetch(`/api/lists/${listId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, permissionLevel }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to add collaborator");
      return data;
    },
    onSuccess: (data) => {
      setSuccess(data.message);
      setNewUsername("");
      setNewPermissionLevel(PermissionLevel.COLLABORATOR);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Failed to add collaborator"
      );
    },
    onSettled: () => setAddingCollaborator(false),
  });

  const removeCollaborator = async (
    collaboratorUserId: string,
    username: string
  ) => {
    if (
      !confirm(`Are you sure you want to remove ${username} from this list?`)
    ) {
      return;
    }

    setError(null);
    setSuccess(null);
    removeCollaboratorMutation.mutate({ collaboratorUserId });
  };

  const removeCollaboratorMutation = useMutation({
    mutationFn: async ({
      collaboratorUserId,
    }: {
      collaboratorUserId: string;
    }) => {
      const response = await fetch(
        `/api/lists/${listId}/collaborators/${collaboratorUserId}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to remove collaborator");
      return { collaboratorUserId, message: data.message };
    },
    onSuccess: ({ message }) => {
      setSuccess(message);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Failed to remove collaborator"
      );
    },
  });

  const updatePermission = async (
    collaboratorUserId: string,
    newPermission: string
  ) => {
    setError(null);
    setSuccess(null);
    updatePermissionMutation.mutate({ collaboratorUserId, newPermission });
  };

  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      collaboratorUserId,
      newPermission,
    }: {
      collaboratorUserId: string;
      newPermission: string;
    }) => {
      const response = await fetch(
        `/api/lists/${listId}/collaborators/${collaboratorUserId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionLevel: newPermission }),
        }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to update permission");
      return { collaboratorUserId, newPermission, message: data.message };
    },
    onSuccess: ({ message }) => {
      setSuccess(message);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Failed to update permission"
      );
    },
  });

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Collaborators"
      subtitle={listName}
      size="lg"
    >
      <div className="space-y-6">
        {!isOwner ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">
              Only the list owner can manage collaborators.
            </p>
          </div>
        ) : (
          <>
            {/* Messages */}
            {error && (
              <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-200">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearMessages}
                    aria-label="Dismiss error"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-900/40 border border-green-700 rounded-lg text-green-200">
                <div className="flex items-center justify-between">
                  <span>{success}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearMessages}
                    aria-label="Dismiss message"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            )}

            {/* Add Collaborator Form */}
            <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Add Collaborator
              </h3>
              <div className="flex gap-3 flex-col sm:flex-row">
                <div className="flex-1">
                  <Input
                    placeholder="Enter username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
                  />
                </div>
                <select
                  value={newPermissionLevel}
                  onChange={(e) =>
                    setNewPermissionLevel(e.target.value as PermissionLevelEnum)
                  }
                  className="px-3 py-2 rounded-lg border border-gray-600 bg-transparent text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value={PermissionLevel.COLLABORATOR}>
                    Collaborator
                  </option>
                  <option value={PermissionLevel.VIEWER}>Viewer</option>
                </select>
                <Button
                  onClick={addCollaborator}
                  disabled={addingCollaborator || !newUsername.trim()}
                  loading={addingCollaborator}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Owner Display */}
            {ownerUsername && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">
                  List Owner
                </h3>
                <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                  <div className="flex items-center gap-3">
                    <ProfileImage
                      username={ownerUsername}
                      src={ownerProfilePictureUrl}
                      size="md"
                    />
                    <div>
                      <p className="text-white font-medium">{ownerUsername}</p>
                      <p className="text-gray-400 text-sm">Owner</p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-yellow-600/20 border border-yellow-600/30 rounded text-yellow-400 text-sm font-medium">
                    Owner
                  </div>
                </div>
              </div>
            )}

            {/* Collaborators List */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">
                Collaborators
              </h3>
              {collaboratorsQuery.isLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-gray-400 mt-2">Loading collaborators...</p>
                </div>
              ) : (collaboratorsQuery.data?.collaborators || []).length ===
                0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400">
                    No collaborators yet. Add some to start sharing!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(collaboratorsQuery.data?.collaborators || []).map(
                    (collaborator) => (
                      <div
                        key={collaborator.id}
                        className="flex items-center justify-between p-4 bg-gray-700/40 rounded-lg border border-gray-700"
                      >
                        <div className="flex items-center gap-3">
                          <ProfileImage
                            username={collaborator.username}
                            src={collaborator.profilePictureUrl}
                            size="md"
                          />
                          <div>
                            <p className="text-white font-medium">
                              {collaborator.username}
                            </p>
                            <p className="text-gray-400 text-sm">
                              {collaborator.permissionLevel ===
                              PermissionLevel.COLLABORATOR
                                ? "Can edit"
                                : "View only"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={collaborator.permissionLevel}
                            onChange={(e) =>
                              updatePermission(
                                collaborator.userId,
                                e.target.value
                              )
                            }
                            className="px-3 py-1 rounded-lg border border-gray-600 bg-transparent text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          >
                            <option value={PermissionLevel.COLLABORATOR}>
                              Collaborator
                            </option>
                            <option value={PermissionLevel.VIEWER}>
                              Viewer
                            </option>
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove collaborator"
                            onClick={() =>
                              removeCollaborator(
                                collaborator.userId,
                                collaborator.username
                              )
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
