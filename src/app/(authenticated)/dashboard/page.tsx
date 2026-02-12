import { List, Search } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ContentCardSkeleton } from "@/components/content/ContentCardSkeleton";
import TrendingStrip from "@/components/content/TrendingStrip";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileImage } from "@/components/ui/ProfileImage";
import { getCurrentUser } from "@/lib/auth/webauthn";

export default async function DashboardPage() {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader>
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
            <Suspense
              fallback={Array.from({ length: 6 }).map((_, i) => (
                <ContentCardSkeleton key={i} />
              ))}
            >
              <TrendingStrip items={6} userId={user.id} />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
