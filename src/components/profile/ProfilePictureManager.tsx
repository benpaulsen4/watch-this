'use client';

import { useState } from 'react';
import { Camera, Check, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { User } from '@/lib/auth/client';

interface ProfilePictureManagerProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export function ProfilePictureManager({ user, onUserUpdate }: ProfilePictureManagerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newUrl, setNewUrl] = useState(user.profilePictureUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Empty URL is valid (removes profile picture)
    
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateUrl(newUrl)) {
      setError('Please enter a valid HTTP or HTTPS URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profilePictureUrl: newUrl.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile picture');
      }

      const updatedUser = await response.json();
      onUserUpdate(updatedUser.user);
      setIsEditing(false);
      setPreviewError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile picture');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setNewUrl(user.profilePictureUrl || '');
    setIsEditing(false);
    setError(null);
    setPreviewError(false);
  };

  const handleImageError = () => {
    setPreviewError(true);
  };

  const handleImageLoad = () => {
    setPreviewError(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6">
        {/* Profile Picture Display */}
        <div className="flex-shrink-0">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-800 border-2 border-gray-700 overflow-hidden flex items-center justify-center">
              {user.profilePictureUrl && !previewError ? (
                // URL could be from anywhere
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.profilePictureUrl}
                  alt="Profile picture"
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                />
              ) : (
                <Camera className="h-8 w-8 text-gray-500" />
              )}
            </div>
          </div>
        </div>

        {/* Profile Picture Management */}
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-100 mb-2">Profile Picture</h3>
            <p className="text-sm text-gray-400">
              Add a profile picture using an external URL. Supported formats: JPG, PNG, GIF, WebP.
            </p>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="profile-url" className="block text-sm font-medium text-gray-300 mb-2">
                  Image URL
                </label>
                {/* TODO use input component */}
                <input
                  id="profile-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => {
                    setNewUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="https://example.com/your-image.jpg"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              {/* URL Preview */}
              {newUrl && validateUrl(newUrl) && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Preview:</p>
                  <div className="w-16 h-16 rounded-lg bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={newUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={() => setError('Unable to load image from this URL')}
                      onLoad={() => setError(null)}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={!validateUrl(newUrl)}
                  loading={loading}
                  size="sm"
                >
                    <Check className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={loading}
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-300">
                {user.profilePictureUrl ? (
                  <span className="break-all">{user.profilePictureUrl}</span>
                ) : (
                  <span className="text-gray-500">No profile picture set</span>
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Camera className="h-4 w-4 mr-2" />
                {user.profilePictureUrl ? 'Change Picture' : 'Add Picture'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}