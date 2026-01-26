import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/webauthn";
import { getListRecommendations } from "@/lib/lists/recommendations";

import { ListItemWrapper } from "./ListItemWrapper";

interface ListRecommendationsProps {
  listId: string;
}

export default async function ListRecommendations({
  listId,
}: ListRecommendationsProps) {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (!user) return null;

  const recommendations = await getListRecommendations(user.id, listId);
  if (recommendations === "notFound" || recommendations.length === 0)
    return null;

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Recommended</h2>
          <p className="text-sm text-gray-500">
            Suggestions based on what’s already in this list
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {recommendations.map((content) => (
          <ListItemWrapper
            key={`${content.contentType}:${content.tmdbId}`}
            content={content}
            currentListId={listId}
            showWatchStatus={true}
          />
        ))}
      </div>
    </section>
  );
}
