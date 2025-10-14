"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Check, X, AlertCircle, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  user: { timezone?: string };
  onUserUpdate: () => Promise<void> | void;
};

export function TimezoneSelector({ user, onUserUpdate }: Props) {
  const [timezones, setTimezones] = useState<string[]>([]);
  const [timezone, setTimezone] = useState<string>(user.timezone || "UTC");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Populate supported timezones (browser only)
    try {
      // Type-safe check for supportedValuesOf method
      const intlWithSupported = Intl as typeof Intl & {
        supportedValuesOf?: (type: string) => string[];
      };

      const supported = intlWithSupported.supportedValuesOf
        ? intlWithSupported.supportedValuesOf("timeZone")
        : [];
      if (supported && Array.isArray(supported) && supported.length > 0) {
        if (!supported.includes("UTC")) supported.push("UTC"); // UTC not included in chrome supported list
        setTimezones(supported);
      } else {
        // Fallback small list
        setTimezones([
          "UTC",
          "America/Los_Angeles",
          "America/New_York",
          "Europe/London",
          "Europe/Paris",
          "Asia/Tokyo",
          "Asia/Singapore",
          "Australia/Sydney",
        ]);
      }
    } catch {
      setTimezones(["UTC"]);
    }
  }, []);

  useEffect(() => {
    setTimezone(user.timezone || "UTC");
  }, [user.timezone]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to update timezone");
      }
      await onUserUpdate();
      setIsEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update timezone");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setTimezone(user.timezone || "UTC");
    setIsEditing(false);
    setError(null);
  };

  const localTZ = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6">
        {/* Timezone Icon */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
            <Globe className="h-6 w-6 text-gray-400" />
          </div>
        </div>

        {/* Timezone Management */}
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-100 mb-2">Timezone</h3>
            <p className="text-sm text-gray-400">
              Set your timezone for accurate activity tracking and scheduling.
            </p>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="timezone"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Timezone
                </label>
                <div className="relative">
                  {/* TODO use select component */}
                  <select
                    id="timezone"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={saving}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Browser detected: {localTZ}
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || timezone === user.timezone}
                  loading={saving}
                  size="sm"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
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
                {user.timezone || "UTC"}
              </p>
              <p className="text-sm text-gray-400">
                Browser detected: {localTZ}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Change Timezone
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
