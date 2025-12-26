import ListHeader from "@/components/lists/ListHeader";
import ListItems from "@/components/lists/ListItems";
import { ListFilters } from "@/components/lists/ListFilters";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { cookies } from "next/headers";
import { getList } from "@/lib/lists/service";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContentCardSkeleton } from "@/components/content/ContentCardSkeleton";
import { WatchStatusEnum } from "@/lib/db/schema";

interface ListDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    watchStatus?: string | string[];
    sortOrder?: string;
  }>;
}

export default async function ListDetailsPage({
  params,
  searchParams,
}: ListDetailsPageProps) {
  const { id } = await params;
  const { watchStatus: watchStatusParam, sortOrder: sortOrderParam } =
    await searchParams;

  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  const list = await getList(user.id, id);

  if (list === "notFound") return notFound();

  // Parse filters
  const validStatuses = [
    "planning",
    "watching",
    "paused",
    "completed",
    "dropped",
    "none",
  ];
  const rawStatuses = Array.isArray(watchStatusParam)
    ? watchStatusParam
    : [watchStatusParam];
  const watchStatus = rawStatuses.filter(
    (s) => s && validStatuses.includes(s)
  ) as (WatchStatusEnum | "none")[];

  const sortOrder =
    sortOrderParam === "descending" ? "descending" : "ascending";

  return (
    <div className="min-h-screen bg-gray-950">
      <ListHeader initialList={list} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ListFilters listType={list.listType} />

        <Suspense
          key={JSON.stringify({ watchStatus, sortOrder })}
          fallback={
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {Array.from({
                length: Math.max(1, Math.min(list.itemCount || 12, 12)),
              }).map((_, i) => (
                <ContentCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <ListItems
            listId={id}
            watchStatus={watchStatus}
            sortOrder={sortOrder}
          />
        </Suspense>
      </main>
    </div>
  );
}
