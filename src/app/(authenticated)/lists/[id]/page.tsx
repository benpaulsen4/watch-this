import { Suspense } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ListDetailsClient from "@/components/lists/ListDetailsClient";

interface ListDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ListDetailsPage({
  params,
}: ListDetailsPageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <LoadingSpinner
            size="xl"
            variant="primary"
            text="Loading list details..."
          />
        </div>
      }
    >
      <ListDetailsClient listId={id} />
    </Suspense>
  );
}
