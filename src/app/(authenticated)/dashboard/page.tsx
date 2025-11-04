import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ContentCard } from "@/components/content/ContentCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileImage } from "@/components/ui/ProfileImage";
import { List, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { cookies } from "next/headers";
import { tmdbClient } from "@/lib/tmdb/client";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return null;

  const tmdbTrending = await tmdbClient.getTrending("all", "day");
  const trendingPromises = tmdbTrending.results
    .slice(0, 6)
    .map((t) => enrichWithContentStatus(t, user.id));
  const trendingContent = await Promise.all(trendingPromises);

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader
        title="WatchThis"
        titleClassName="text-2xl font-bold text-red-500"
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/lists">
            <List className="h-4 w-4" />
            <span className="ml-2 hidden sm:block">My Lists</span>
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/search">
            <Search className="h-4 w-4" />
            <span className="ml-2 hidden sm:block">Discover</span>
          </Link>
        </Button>
        <Button variant="secondary" className="px-2 h-12" asChild>
          <Link href="/profile">
            <ProfileImage
              src={user.profilePictureUrl}
              username={user.username}
              size="sm"
            />
            <span className="ml-2 hidden sm:block">{user.username}</span>
          </Link>
        </Button>
      </PageHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Activity Feed */}
        <section className="mb-8">
          <ActivityFeed currentUsername={user.username} />
        </section>

        {/* Trending Content */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">Trending Today</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/search">View All</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
            {trendingContent.map((item) => (
              <ContentCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
