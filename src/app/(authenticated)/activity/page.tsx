import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ActivityTimelineClient } from "@/components/activity/ActivityTimelineClient";
import { Suspense } from "react";

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <LoadingSpinner
            size="xl"
            variant="primary"
            text="Loading activity timeline..."
          />
        </div>
      }
    >
      <ActivityTimelineClient />
    </Suspense>
  );
}
