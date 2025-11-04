"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Smartphone,
  Monitor,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface PasskeyDevice {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsed: string | null;
}

export function PasskeyDevicesViewer() {
  const [devices, setDevices] = useState<PasskeyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/profile/devices");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load devices");
      }

      const data = await response.json();
      console.log(data);
      setDevices(data.devices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  const getDeviceIcon = (deviceName?: string) => {
    const name = deviceName?.toLowerCase();
    if (
      name?.includes("mobile") ||
      name?.includes("phone") ||
      name?.includes("android") ||
      name?.includes("ios")
    ) {
      return <Smartphone className="h-5 w-5 text-blue-400" />;
    }
    return <Monitor className="h-5 w-5 text-green-400" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getLastUsedText = (lastUsedAt: string | null) => {
    if (!lastUsedAt) return "Never used";

    const lastUsed = new Date(lastUsedAt);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60),
    );

    if (diffInHours < 1) return "Used recently";
    if (diffInHours < 24) return `Used ${diffInHours} hours ago`;
    if (diffInHours < 168)
      return `Used ${Math.floor(diffInHours / 24)} days ago`;

    return formatDate(lastUsedAt);
  };

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" variant="primary" text="Loading devices..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100 mb-2">
            Passkey Devices
          </h3>
          <p className="text-sm text-gray-400">
            Manage the devices registered for passwordless authentication.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDevices}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {devices.map((device) => (
          <Card key={device.id} variant="outline">
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getDeviceIcon(device.deviceName)}
                  <div>
                    <h4 className="font-medium text-gray-100">
                      {device.deviceName}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>Added {formatDate(device.createdAt)}</span>
                      <span>•</span>
                      <span>{getLastUsedText(device.lastUsed)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-400 mb-1">About Passkeys</h4>
            <p className="text-sm text-gray-300">
              Passkeys are a secure, passwordless way to sign in using your
              device&apos;s built-in authentication (like fingerprint, face
              recognition, or PIN). They&apos;re more secure than passwords and
              can&apos;t be phished or stolen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
