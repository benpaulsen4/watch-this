"use client";

import {
  Shield,
  Smartphone,
  Monitor,
  AlertCircle,
  RefreshCw,
  Copy as CopyIcon,
  Check as CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Input } from "@/components/ui/Input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PasskeyDevice } from "@/lib/profile/devices/types";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { initiatePasskeyClaim } from "@/lib/auth/client";
import QRCode from "@/components/ui/QRCode";

export function PasskeyDevicesViewer() {
  const {
    data: devicesData,
    isLoading,
    error,
    refetch,
  } = useQuery<{ devices: PasskeyDevice[] }>({
    queryKey: ["profile", "devices"],
    queryFn: async () => {
      const response = await fetch("/api/profile/devices");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load devices");
      }
      return response.json();
    },
  });

  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimInfo, setClaimInfo] = useState<null | {
    claimId: string;
    claimCode: string;
    token: string;
    magicLink: string;
    qrPayload: string;
    expiresAt: string;
  }>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isClaimModalOpen) return;
    setIsPolling(true);
    const ids = (devicesData?.devices || []).map((d) => d.id);
    const timer = setInterval(() => {
      refetch().then(({ data }) => {
        const currentIds = (data?.devices || []).map((d) => d.id);
        const added = currentIds.some((id) => !ids.includes(id));
        if (added) {
          setIsClaimModalOpen(false);
          setClaimInfo(null);
          setIsPolling(false);
          queryClient.invalidateQueries({ queryKey: ["profile", "devices"] });
        }
      });
    }, 4000);
    return () => {
      clearInterval(timer);
      setIsPolling(false);
    };
  }, [isClaimModalOpen, refetch, queryClient]);

  const initiateClaimMutation = useMutation({
    mutationFn: initiatePasskeyClaim,
    onSuccess: (info) => {
      setClaimError(null);
      setClaimInfo(info);
      setIsClaimModalOpen(true);
    },
    onError: (err) => {
      const message =
        (err as Error)?.message || "Failed to initiate passkey claim";
      setClaimError(
        message.toLowerCase().includes("rate limit")
          ? "Too many Add Passkey attempts in the last hour. Please try again later."
          : message
      );
    },
  });

  const startClaim = async () => {
    setIsInitiating(true);
    try {
      await initiateClaimMutation.mutateAsync();
    } finally {
      setIsInitiating(false);
    }
  };

  const canDelete = (devicesData?.devices?.length || 0) > 1;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/profile/devices/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete device");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "devices"] });
    },
  });

  const deleteDevice = async (id: string) => {
    if (!canDelete) return;
    await deleteMutation.mutateAsync(id);
  };

  const getDeviceIcon = (deviceName?: string | null) => {
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
      (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) return "Used recently";
    if (diffInHours < 24) return `Used ${diffInHours} hours ago`;
    if (diffInHours < 168)
      return `Used ${Math.floor(diffInHours / 24)} days ago`;

    return formatDate(lastUsedAt);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" variant="primary" text="Loading devices..." />
      </div>
    );
  }

  return (
    <>
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={startClaim}
              disabled={isInitiating}
            >
              Add Passkey
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <AlertCircle className="h-4 w-4" />
            {(error as Error).message}
          </div>
        )}

        {claimError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <AlertCircle className="h-4 w-4" />
            {claimError}
          </div>
        )}

        <div className="space-y-3">
          {(devicesData?.devices || []).map((device) => (
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
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteDevice(device.id)}
                      disabled={!canDelete}
                    >
                      Delete
                    </Button>
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
                recognition, or PIN). They&apos;re more secure than passwords
                and can&apos;t be phished or stolen.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Modal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        title="Add a New Passkey"
        subtitle="Use your other device to scan the QR or open the link"
        size="md"
      >
        {claimInfo ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-200">Claim Code</p>
              <p className="text-lg font-semibold text-gray-100 tracking-widest">
                {claimInfo.claimCode}
              </p>
            </div>
            <div>
              <Input label="Magic Link" value={claimInfo.magicLink} readOnly />
              <div className="mt-2 flex justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Open the link on the other device</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(claimInfo.magicLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {}
                  }}
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">QR Code</p>
              <div className="flex items-center justify-center">
                <QRCode
                  value={claimInfo.qrPayload}
                  size={220}
                  className="rounded-lg border border-gray-800"
                />
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Expires at {formatDate(claimInfo.expiresAt)}
            </p>
            <div className="flex justify-between">
              {isPolling && (
                <LoadingSpinner
                  size="sm"
                  variant="primary"
                  text="Listening for new device..."
                />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await fetch(
                      `/api/profile/devices/claims/${claimInfo.claimId}`,
                      { method: "DELETE" }
                    );
                    setIsClaimModalOpen(false);
                    setClaimInfo(null);
                  } catch {}
                }}
              >
                Cancel Claim
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <LoadingSpinner
              size="lg"
              variant="primary"
              text="Preparing claim..."
            />
          </div>
        )}
      </Modal>
    </>
  );
}
