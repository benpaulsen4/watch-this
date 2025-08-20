"use client";

import { useState } from "react";
import { X, Trash2, Save, AlertTriangle } from "lucide-react";
// Using local List interface to match API response format

interface List {
  id: string;
  name: string;
  description: string | null;
  listType: 'movie' | 'tv' | 'mixed';
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
    type: list.listType,
    isPublic: list.isPublic,
    syncWatchStatus: list.syncWatchStatus,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          type: formData.type,
          isPublic: formData.isPublic,
          syncWatchStatus: formData.syncWatchStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update list");
      }

      const updatedList = await response.json();
      onListUpdate(updatedList);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete list");
      }

      onListDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isLoading || isDeleting) return;
    setShowDeleteConfirm(false);
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header // TODO does not use ARIA modal component */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">List Settings</h2>
          <button
            onClick={handleClose}
            disabled={isLoading || isDeleting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!showDeleteConfirm ? (
            <>
              {/* List Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  List Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  disabled={!isOwner || isLoading}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter list name"
                  maxLength={100}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {formData.name.length}/100 characters
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  disabled={!isOwner || isLoading}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  placeholder="Enter list description (optional)"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {formData.description.length}/500 characters
                </p>
              </div>

              {/* List Type // TODO does not work (nor should it really exist) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  List Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => handleInputChange("type", e.target.value)}
                  disabled={!isOwner || isLoading}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="mixed">Mixed (Movies & TV Shows)</option>
                  <option value="movie">Movies Only</option>
                  <option value="tv">TV Shows Only</option>
                </select>
              </div>

              {/* Visibility */}
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => handleInputChange("isPublic", e.target.checked)}
                    disabled={!isOwner || isLoading}
                    className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    onChange={(e) => handleInputChange("syncWatchStatus", e.target.checked)}
                    disabled={!isOwner || isLoading}
                    className="w-4 h-4 text-green-600 bg-gray-800 border-gray-600 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-medium text-gray-300">
                    Sync watch status with collaborators
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  When enabled, watch status updates will be synchronized across all collaborators
                </p>
              </div>

              {/* Action Buttons */}
              {isOwner && (
                <div className="flex flex-col space-y-3 pt-4">
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isLoading ? "Saving..." : "Save Changes"}</span>
                  </button>

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete List</span>
                  </button>
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
                  Are you sure you want to delete &quot;{list.name}&quot;? This action cannot be undone.
                  All items and collaborators will be removed.
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}