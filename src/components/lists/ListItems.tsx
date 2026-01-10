import { Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { WatchStatusEnum } from "@/lib/db/schema";
import { getListItems } from "@/lib/lists/service";

import { ListItemWrapper } from "./ListItemWrapper";

interface ListItemsProps {
  listId: string;
  watchStatus?: (WatchStatusEnum | "none")[];
  sortOrder?: "ascending" | "descending";
}

export default async function ListItems({
  listId,
  watchStatus,
  sortOrder,
}: ListItemsProps) {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (!user) return null;

  const response = await getListItems(user.id, listId, watchStatus, sortOrder);

  if (response === "notFound") {
    return (
      <div className="text-center text-red-500 py-8">Error loading items</div>
    );
  }

  const { items } = response;

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Plus className="h-8 w-8 text-gray-600" />
        </div>
        <h3 className="text-xl font-medium text-gray-300 mb-2">
          No content found
        </h3>
        <p className="text-gray-500 mb-6">
          Try adjusting your filters or add more content
        </p>
        <Button asChild>
          <Link href="/search">
            <Plus className="h-4 w-4 mr-2" />
            Add Content
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {items.map((item) => {
        const { listItemId, createdAt, ...contentData } = item;
        return (
          <ListItemWrapper
            key={listItemId}
            content={contentData}
            addedDate={createdAt}
            showAddedDate={true}
            currentListId={listId}
          />
        );
      })}
    </div>
  );
}
