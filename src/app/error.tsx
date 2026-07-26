"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is all that survives to the client for a server-side throw, so
    // it is the only way to tie a report from a user back to a server log line.
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm shadow-xl shadow-purple-500/10 p-8 text-center">
        <div className="flex justify-center">
          <AlertTriangle className="h-12 w-12 text-red-400" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-100">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          We couldn&apos;t load this page. This is usually temporary - trying
          again often works.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-gray-500">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={() => reset()}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
