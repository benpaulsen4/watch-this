"use client";

import { useState } from "react";
import { X, UserPlus, Trash2, Users } from "lucide-react";
import { PermissionLevel, type PermissionLevelEnum } from "@/lib/db/schema";
import { ProfileImage } from "../ui/ProfileImage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
        err instanceof Error ? err.message : "Failed to add collaborator",
      );
    },
    onSettled: () => setAddingCollaborator(false),
  });

  const removeCollaborator = async (
    collaboratorUserId: string,
    username: string,
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
        { method: "DELETE" },
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
        err instanceof Error ? err.message : "Failed to remove collaborator",
      );
    },
  });

  const updatePermission = async (
    collaboratorUserId: string,
    newPermission: string,
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
        },
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
        err instanceof Error ? err.message : "Failed to update permission",
      );
    },
  });

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header // TODO Style colors are wrong, also doesn't use ARIA modal component */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-white">
                Manage Collaborators
              </h2>
              <p className="text-gray-400 text-sm">{listName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
                  {error}
                  <button
                    onClick={clearMessages}
                    className="float-right text-red-400 hover:text-red-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-200">
                  {success}
                  <button
                    onClick={clearMessages}
                    className="float-right text-green-400 hover:text-green-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Add Collaborator Form */}
              <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Add Collaborator
                </h3>
                <div className="flex gap-3 flex-col sm:flex-row">
                  {/* TODO use input component */}
                  <input
                    type="text"
                    placeholder="Enter username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
                  />
                  <select
                    value={newPermissionLevel}
                    onChange={(e) =>
                      setNewPermissionLevel(
                        e.target.value as PermissionLevelEnum,
                      )
                    }
                    className="px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={PermissionLevel.COLLABORATOR}>
                      Collaborator
                    </option>
                    <option value={PermissionLevel.VIEWER}>Viewer</option>
                  </select>
                  {/* TODO Use button component */}
                  <button
                    onClick={addCollaborator}
                    disabled={addingCollaborator || !newUsername.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {addingCollaborator ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Add
                  </button>
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
                        <p className="text-white font-medium">
                          {ownerUsername}
                        </p>
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
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400 mt-2">
                      Loading collaborators...
                    </p>
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
                          className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
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
                                  e.target.value,
                                )
                              }
                              className="px-3 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value={PermissionLevel.COLLABORATOR}>
                                Collaborator
                              </option>
                              <option value={PermissionLevel.VIEWER}>
                                Viewer
                              </option>
                            </select>
                            <button
                              onClick={() =>
                                removeCollaborator(
                                  collaborator.userId,
                                  collaborator.username,
                                )
                              }
                              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                              title="Remove collaborator"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
