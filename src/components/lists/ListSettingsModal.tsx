"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Save,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Input, Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import {
  GetListResponse,
  ListListsResponse,
  UpdateListInput,
} from "@/lib/lists/types";

type Mode = "edit" | "create";

interface ListSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  list?: GetListResponse;
  isOwner?: boolean;
  mode?: Mode;
  onListUpdate?: (updatedList: UpdateListInput) => void;
  onListDelete?: () => void;
  onListCreate?: (createdList: ListListsResponse) => void;
  allowedListTypes?: Array<"mixed" | "movies" | "tv">;
}

export default function ListSettingsModal({
  isOpen,
  onClose,
  list,
  isOwner = true,
  mode = "edit",
  onListUpdate,
  onListDelete,
  onListCreate,
  allowedListTypes,
}: ListSettingsModalProps) {
  const [formData, setFormData] = useState<UpdateListInput & { name: string }>({
    name: list?.name ?? "",
    description: list?.description,
    listType: list?.listType ?? "mixed",
    isPublic: list?.isPublic ?? false,
    syncWatchStatus: list?.syncWatchStatus ?? false,
    isArchived: list?.isArchived ?? false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError("List name is required");
      return false;
    }
    if (formData.name.length > 100) {
      setError("List name must be 100 characters or less");
      return false;
    }
    if (
      mode === "create" &&
      allowedListTypes &&
      !allowedListTypes.includes(formData.listType as any)
    ) {
      setError("Invalid list type for this action");
      return false;
    }
    return true;
  };

  const updateListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists/${list?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: (formData.description ?? "").trim() || null,
          listType: formData.listType,
          isPublic: formData.isPublic,
          isArchived: formData.isArchived,
          syncWatchStatus: formData.syncWatchStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update list");
      return data;
    },
    onSuccess: (data) => {
      const updated =
        (data as { list: ListListsResponse }).list ??
        (data as ListListsResponse);
      onListUpdate?.({
        name: updated.name,
        description: updated.description,
        listType: updated.listType as any,
        isPublic: updated.isPublic,
        isArchived: updated.isArchived,
        syncWatchStatus: updated.syncWatchStatus,
      });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to update list");
    },
    onSettled: () => setIsLoading(false),
  });

  const handleSave = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setError("");
    await updateListMutation.mutateAsync();
  };

  const handleArchiveToggle = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setError("");
    setFormData((prev) => ({
      ...prev,
      isArchived: !prev.isArchived,
      syncWatchStatus: !prev.isArchived ? false : prev.syncWatchStatus,
    }));

    await updateListMutation.mutateAsync();
  };

  const createListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name.trim(),
          description: (formData.description ?? "").trim() || null,
          listType: formData.listType,
          isPublic: formData.isPublic,
          syncWatchStatus: formData.syncWatchStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create list");
      return data;
    },
    onSuccess: (data) => {
      const created: ListListsResponse =
        (data as { list: ListListsResponse }).list ??
        (data as ListListsResponse);
      onListCreate?.(created);
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to create list");
    },
    onSettled: () => setIsLoading(false),
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists/${list?.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete list");
      return data;
    },
    onSuccess: () => {
      onListDelete?.();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    },
    onSettled: () => setIsDeleting(false),
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");
    await deleteListMutation.mutateAsync();
  };

  const handleClose = () => {
    if (isLoading || isDeleting) return;
    setShowDeleteConfirm(false);
    setError("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={mode === "create" ? "Create New List" : "List Settings"}
      subtitle={mode === "create" ? undefined : list?.name}
      isDismissable={!isLoading && !isDeleting}
      size="md"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {!showDeleteConfirm || mode === "create" ? (
          <>
            {/* List Name */}
            <Input
              label="List Name * "
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              disabled={(mode === "edit" && !isOwner) || isLoading}
              placeholder="Enter list name"
              maxLength={100}
              helperText={`${formData.name?.length ?? 0}/100 characters`}
            />

            {/* Description */}
            <Textarea
              label="Description"
              value={formData.description ?? ""}
              onChange={(e) => handleInputChange("description", e.target.value)}
              disabled={(mode === "edit" && !isOwner) || isLoading}
              placeholder="Enter list description (optional)"
              rows={3}
              maxLength={500}
              helperText={`${
                (formData.description ?? "").length
              }/500 characters`}
            />

            {/* List Type */}
            <div>
              <Dropdown
                label="List Type"
                placeholder="Select type"
                selectedKey={formData.listType}
                onSelectionChange={(key) =>
                  handleInputChange(
                    "listType",
                    String(key || formData.listType)
                  )
                }
                isDisabled={(mode === "edit" && !isOwner) || isLoading}
                options={(allowedListTypes ?? ["mixed", "movies", "tv"]).map(
                  (key) =>
                    key === "mixed"
                      ? { key: "mixed", label: "Mixed (Movies & TV Shows)" }
                      : key === "movies"
                      ? { key: "movies", label: "Movies Only" }
                      : { key: "tv", label: "TV Shows Only" }
                )}
              />
            </div>

            {/* Visibility */}
            <div>
              <Switch
                label="Make this list public"
                isSelected={formData.isPublic}
                onChange={(selected) => handleInputChange("isPublic", selected)}
                isDisabled={(mode === "edit" && !isOwner) || isLoading}
                helperText="Public lists can be discovered and viewed by other users"
              />
            </div>

            {/* Sync Watch Status */}
            <div>
              <Switch
                label="Sync watch status with collaborators"
                isSelected={formData.syncWatchStatus}
                onChange={(selected) =>
                  handleInputChange("syncWatchStatus", selected)
                }
                isDisabled={
                  (mode === "edit" && !isOwner) ||
                  isLoading ||
                  formData.isArchived
                }
                helperText="When enabled, watch status updates will be synchronized across all collaborators"
              />
            </div>

            {/* Action Buttons */}
            {mode === "edit" ? (
              isOwner ? (
                <div className="flex flex-col space-y-3 pt-4">
                  <Button onClick={handleSave} loading={isLoading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>

                  <div className="flex gap-2 pt-3 border-t border-gray-800">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleArchiveToggle}
                      loading={isLoading}
                    >
                      {formData.isArchived ? (
                        <>
                          <ArchiveRestore className="w-4 h-4 mr-2" />
                          Unarchive List
                        </>
                      ) : (
                        <>
                          <Archive className="w-4 h-4 mr-2" />
                          Archive List
                        </>
                      )}
                    </Button>

                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isLoading}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete List
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    Only the list owner can modify these settings.
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-col space-y-3 pt-4">
                <Button
                  onClick={async () => {
                    if (!validateForm()) return;
                    setIsLoading(true);
                    setError("");
                    await createListMutation.mutateAsync();
                  }}
                  loading={isLoading}
                >
                  Create
                </Button>
              </div>
            )}
          </>
        ) : (
          /* Delete Confirmation */
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <AlertTriangle className="w-12 h-12 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Delete List
              </h3>
              <p className="text-gray-300 text-sm">
                Are you sure you want to delete &quot;{list?.name}&quot;? This
                action cannot be undone. All items and collaborators will be
                removed.
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1"
                loading={isDeleting}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
