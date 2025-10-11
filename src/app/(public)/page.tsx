"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/components/providers/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push("/dashboard");
      } else {
        router.push("/auth");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <LoadingSpinner size="xl" variant="primary" text="Loading WatchThis..." />
    </div>
  );
}
