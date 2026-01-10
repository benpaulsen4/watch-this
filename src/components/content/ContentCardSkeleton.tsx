import { Play } from "lucide-react";

import { Card } from "@/components/ui/Card";

export function ContentCardSkeleton() {
  return (
    <Card
      variant="entertainment"
      className="overflow-hidden animate-pulse"
      size="sm"
      aria-label="Loading content"
    >
      <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gray-700">
        <Play className="h-12 w-12 text-gray-400" />
      </div>
      <div className="mt-4">
        <div className="h-6 bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-5 bg-gray-700 rounded w-1/2" />
      </div>
    </Card>
  );
}
