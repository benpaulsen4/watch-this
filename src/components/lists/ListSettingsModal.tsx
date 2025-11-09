"use client";

import { useState } from "react";
import { Trash2, Save, AlertTriangle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
// Using local List interface to match API response format

interface List {
  id: string;
  name: string;
  description: string | null;
  listType: "movie" | "tv" | "mixed";
  isPublic: boolean;
  syncWatchStatus: boolean;
  ownerId: string;
  ownerUsername?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  list: List;
  isOwner: boolean;
  onListUpdate: (updatedList: Partial<List>) => void;
  onListDelete: () => void;
}

export default function ListSettingsModal({
  isOpen,
  onClose,
  list,
  isOwner,
  onListUpdate,
  onListDelete,
}: ListSettingsModalProps) {
  const [formData, setFormData] = useState({
    name: list.name,
    description: list.description || "",
    listType: list.listType,
    isPublic: list.isPublic,
    syncWatchStatus: list.syncWatchStatus,
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
    return true;
  };

  const updateListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          listType: formData.listType,
          isPublic: formData.isPublic,
          syncWatchStatus: formData.syncWatchStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update list");
      return data;
    },
    onSuccess: (data) => {
      onListUpdate(data);
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

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete list");
      return data;
    },
    onSuccess: () => {
      onListDelete();
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
      title="List Settings"
      subtitle={list.name}
      isDismissable={!isLoading && !isDeleting}
      size="md"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {!showDeleteConfirm ? (
          <>
            {/* List Name */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                List Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                disabled={!isOwner || isLoading}
                className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter list name"
                maxLength={100}
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.name.length}/100 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                disabled={!isOwner || isLoading}
                className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                placeholder="Enter list description (optional)"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.description.length}/500 characters
              </p>
            </div>

            {/* List Type */}
            <div>
              <Dropdown
                label="List Type"
                placeholder="Select type"
                selectedKey={formData.listType}
                onSelectionChange={(key) =>
                  handleInputChange("listType", String(key || formData.listType))
                }
                isDisabled={!isOwner || isLoading}
                options={[
                  { key: "mixed", label: "Mixed (Movies & TV Shows)" },
                  { key: "movie", label: "Movies Only" },
                  { key: "tv", label: "TV Shows Only" },
                ]}
              />
            </div>

            {/* Visibility */}
            <div>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) =>
                    handleInputChange("isPublic", e.target.checked)
                  }
                  disabled={!isOwner || isLoading}
                  className="w-4 h-4 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-gray-300">
                  Make this list public
                </span>
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-7">
                Public lists can be discovered and viewed by other users
              </p>
            </div>

            {/* Sync Watch Status */}
            <div>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.syncWatchStatus}
                  onChange={(e) =>
                    handleInputChange("syncWatchStatus", e.target.checked)
                  }
                  disabled={!isOwner || isLoading}
                  className="w-4 h-4 text-green-600 bg-gray-900 border-gray-600 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-gray-300">
                  Sync watch status with collaborators
                </span>
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-7">
                When enabled, watch status updates will be synchronized across
                all collaborators
              </p>
            </div>

            {/* Action Buttons */}
            {isOwner && (
              <div className="flex flex-col space-y-3 pt-4">
                <Button onClick={handleSave} loading={isLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete List
                </Button>
              </div>
            )}

            {!isOwner && (
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                <p className="text-yellow-400 text-sm">
                  Only the list owner can modify these settings.
                </p>
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
                Are you sure you want to delete &quot;{list.name}&quot;? This
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
