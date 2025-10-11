import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <LoadingSpinner
            size="xl"
            variant="primary"
            text="Loading content..."
          />
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
