"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api/client";
import { PermissionLevel, type PermissionLevelEnum } from "@/lib/db/schema";
import * as listsApi from "@/lib/lists/contract";
import { CreateCollaboratorInput } from "@/lib/lists/types";

import { ProfileImage } from "../ui/ProfileImage";

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

  const queryClient = useQueryClient();

  const collaboratorsQuery = useQuery({
    queryKey: ["lists", listId, "collaborators"],
    enabled: isOpen && isOwner,
    queryFn: ({ signal }) =>
      api(listsApi.listListCollaborators, { params: { id: listId } }, { signal }),
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
    mutationFn: (input: CreateCollaboratorInput) =>
      api(listsApi.createListCollaborator, {
        params: { id: listId },
        body: input,
      }),
    onSuccess: (data) => {
      setSuccess(data.message);
      setNewUsername("");
      setNewPermissionLevel(PermissionLevel.COLLABORATOR);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to add collaborator"));
    },
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
    mutationFn: ({ collaboratorUserId }: { collaboratorUserId: string }) =>
      api(listsApi.deleteListCollaborator, {
        params: { id: listId, userId: collaboratorUserId },
      }),
    onSuccess: ({ message }) => {
      setSuccess(message);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to remove collaborator"));
    },
  });

  const updatePermission = async (
    collaboratorUserId: string,
    newPermission: PermissionLevelEnum,
  ) => {
    setError(null);
    setSuccess(null);
    updatePermissionMutation.mutate({ collaboratorUserId, newPermission });
  };

  const updatePermissionMutation = useMutation({
    mutationFn: ({
      collaboratorUserId,
      newPermission,
    }: {
      collaboratorUserId: string;
      newPermission: PermissionLevelEnum;
    }) =>
      api(listsApi.updateListCollaborator, {
        params: { id: listId, userId: collaboratorUserId },
        body: { permissionLevel: newPermission },
      }),
    onSuccess: ({ message }) => {
      setSuccess(message);
      queryClient.invalidateQueries({
        queryKey: ["lists", listId, "collaborators"],
      });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to update permission"));
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
                <Dropdown
                  placeholder="Collaborator"
                  selectedKey={newPermissionLevel}
                  onSelectionChange={(key) =>
                    setNewPermissionLevel(
                      (key as PermissionLevelEnum) ||
                        PermissionLevel.COLLABORATOR,
                    )
                  }
                  options={[
                    {
                      key: PermissionLevel.COLLABORATOR,
                      label: "Collaborator",
                    },
                    { key: PermissionLevel.VIEWER, label: "Viewer" },
                  ]}
                  className="sm:w-44"
                />
                <Button
                  onClick={addCollaborator}
                  disabled={addCollaboratorMutation.isPending || !newUsername.trim()}
                  loading={addCollaboratorMutation.isPending}
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
                          <Dropdown
                            placeholder="Collaborator"
                            selectedKey={collaborator.permissionLevel}
                            onSelectionChange={(key) =>
                              updatePermission(
                                collaborator.userId,
                                (key as PermissionLevelEnum) ||
                                  PermissionLevel.COLLABORATOR,
                              )
                            }
                            options={[
                              {
                                key: PermissionLevel.COLLABORATOR,
                                label: "Collaborator",
                              },
                              { key: PermissionLevel.VIEWER, label: "Viewer" },
                            ]}
                            size="sm"
                            className="w-44"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove collaborator"
                            onClick={() =>
                              removeCollaborator(
                                collaborator.userId,
                                collaborator.username,
                              )
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
    </Modal>
  );
}
