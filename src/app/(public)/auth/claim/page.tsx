"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import { useRouter,useSearchParams } from "next/navigation";
import { Suspense,useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent,CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  beginClaimRegistration,
  verifyClaimRegistration,
} from "@/lib/auth/client";

export function ClaimPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const token = searchParams.get("token") || "";

  const runClaimMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Missing token");
      const { options, challengeToken } = await beginClaimRegistration(token);
      const registrationResponse = await startRegistration({
        optionsJSON: options,
      });
      await verifyClaimRegistration({
        token,
        challengeToken,
        registrationResponse,
      });
    },
    onSuccess: () => {
      router.replace("/auth?redirect=%2Fdashboard");
    },
    onError: (e: any) => {
      setError(e instanceof Error ? e.message : "Failed to add passkey");
    },
    onSettled: () => setLoading(false),
  });

  useEffect(() => {
    runClaimMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Card variant="entertainment" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Add Passkey</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner
                variant="primary"
                size="lg"
                text="Starting registration..."
              />
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
              <Button variant="outline" onClick={() => router.replace("/auth")}>
                Back to Auth
              </Button>
            </div>
          ) : (
            <div className="text-gray-300 text-sm">
              Passkey added. Redirecting...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClaimsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <LoadingSpinner variant="primary" size="xl" />
        </div>
      }
    >
      <ClaimPageContent />
    </Suspense>
  );
}
