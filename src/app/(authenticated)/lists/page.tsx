import { Suspense } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ListsClient from "@/components/lists/ListsClient";

export default function ListsPage() {
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
      <ListsClient />
    </Suspense>
  );
}
