'use client';

import { useState } from 'react';
import { Edit3, Check, X, AlertCircle, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { User } from '@/lib/auth';

interface UsernameChangerProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export function UsernameChanger({ user, onUserUpdate }: UsernameChangerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newUsername, setNewUsername] = useState(user.username);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateUsername = (username: string): string | null => {
    if (!username.trim()) {
      return 'Username is required';
    }
    
    if (username.length < 3) {
      return 'Username must be at least 3 characters long';
    }
    
    if (username.length > 50) {
      return 'Username must be no more than 50 characters long';
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return 'Username can only contain letters, numbers, hyphens, and underscores';
    }
    
    return null;
  };

  const handleUsernameChange = (value: string) => {
    setNewUsername(value);
    const validation = validateUsername(value);
    setValidationError(validation);
    setError(null);
  };

  const handleSave = async () => {
    const validation = validateUsername(newUsername);
    if (validation) {
      setValidationError(validation);
      return;
    }

    if (newUsername === user.username) {
      setIsEditing(false);
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
          username: newUsername.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          setError('This username is already taken');
        } else {
          throw new Error(errorData.error || 'Failed to update username');
        }
        return;
      }

      const updatedUser = await response.json();
      onUserUpdate(updatedUser.user);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update username');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setNewUsername(user.username);
    setIsEditing(false);
    setError(null);
    setValidationError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6">
        {/* Username Icon */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-gray-400" />
          </div>
        </div>

        {/* Username Management */}
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-100 mb-2">Username</h3>
            <p className="text-sm text-gray-400">
              Your username is how others will identify you on the platform.
            </p>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <div className="relative">
                  {/* TODO use input component */}
                  <input
                    id="username"
                    type="text"
                    value={newUsername}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    disabled={loading}
                    maxLength={50}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  3-50 characters, letters, numbers, hyphens, and underscores only
                </p>
              </div>

              {(validationError || error) && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {validationError || error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={loading || !!validationError || !!error || newUsername === user.username}
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
              <p className="text-lg font-medium text-gray-100">
                @{user.username}
              </p>
              <p className="text-sm text-gray-400">
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Change Username
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}