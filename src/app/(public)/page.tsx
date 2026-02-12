import {
  Activity,
  ArrowRight,
  CalendarDays,
  Github,
  Import,
  ListChecks,
  Search,
  Users,
} from "lucide-react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";

import { LandingSpotlightClient } from "@/components/landing/LandingSpotlightClient";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/webauthn";

export default async function Home() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  return (
    <main className="relative overflow-hidden">
      <LandingSpotlightClient className="relative">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_var(--spot-x)_var(--spot-y),rgba(239,68,68,0.22),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(700px_circle_at_15%_30%,rgba(249,115,22,0.14),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_85%_70%,rgba(168,85,247,0.12),transparent_60%)]" />
          <div className="absolute inset-0 opacity-35 bg-[radial-gradient(circle,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:3px_3px] animate-[wt-grain_7s_steps(10)_infinite]" />
          <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.06),transparent)] bg-[length:100%_140px] animate-[wt-scan_7s_linear_infinite]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(239,68,68,0.08),transparent_35%,rgba(249,115,22,0.06))] animate-[wt-grid-drift_18s_ease-in-out_infinite]" />
        </div>

        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6">
            <Link href="/" className="group inline-flex items-center gap-3">
              <Image
                src="/logo-master.svg"
                alt="WatchThis"
                width={180}
                height={50}
                priority={true}
                className="h-8 w-auto opacity-95 transition-opacity group-hover:opacity-100"
              />
              <span className="sr-only">WatchThis</span>
            </Link>

            <nav className="flex items-center gap-2">
              <Button asChild={true} variant="ghost" size="sm">
                <Link href="/help">Help Center</Link>
              </Button>
              <Button asChild={true} variant="entertainment" size="sm">
                <Link href="/auth">
                  Sign In <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </nav>
          </div>
        </header>

        <section className="relative z-10">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
            <div className="space-y-7">
              <div className="space-y-4">
                <h1 className="text-balance text-4xl font-semibold tracking-tight text-gray-50 sm:text-5xl lg:text-6xl">
                  Movie &amp; TV watchlists that feel like real life.
                </h1>
                <p className="max-w-xl text-pretty text-base text-gray-300 sm:text-lg">
                  WatchThis helps you discover what to watch, organize it into
                  shared lists, and keep progress in sync across devices (and
                  optionally with friends and family).
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild={true} variant="entertainment" size="xl">
                  <Link href="/auth">Get Started</Link>
                </Button>
                <Button asChild={true} variant="outline" size="xl">
                  <Link href="/help/getting-started/what-is-watchthis">
                    Learn How It Works
                  </Link>
                </Button>
                {user !== null && (
                  <Button asChild={true} variant="ghost" size="xl">
                    <Link href="/dashboard">Go to Dashboard</Link>
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/30 px-3 py-2 backdrop-blur-sm">
                  <Users className="h-4 w-4 text-red-400" />
                  Shared lists with permissions
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/30 px-3 py-2 backdrop-blur-sm">
                  <Activity className="h-4 w-4 text-red-400" />
                  Activity feed for your crew
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/30 px-3 py-2 backdrop-blur-sm">
                  <CalendarDays className="h-4 w-4 text-red-400" />
                  TV schedule + episode tracking
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(500px_circle_at_50%_20%,rgba(239,68,68,0.20),transparent_65%)] blur-2xl" />

              <div className="relative grid gap-4">
                <Card
                  variant="glass"
                  hover="glow"
                  className="relative overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(450px_circle_at_15%_25%,rgba(239,68,68,0.15),transparent_60%)]" />
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <ListChecks className="h-5 w-5 text-red-400" />
                      Lists that travel with you
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-300">
                    Your watch status is separate from lists, so you can
                    reshuffle without losing progress.
                  </CardContent>
                </Card>

                <Card
                  variant="glass"
                  hover="glow"
                  className="relative overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_80%_20%,rgba(249,115,22,0.14),transparent_62%)]" />
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-red-400" />
                      Friends &amp; family, but optional sync
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-300">
                    Share a list, pick permissions, and enable watch-status
                    syncing only when you want it.
                  </CardContent>
                </Card>

                <Card
                  variant="glass"
                  hover="glow"
                  className="relative overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_30%_80%,rgba(168,85,247,0.12),transparent_62%)]" />
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-red-400" />
                      Discover → add → track
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-300">
                    TMDB-powered search and details, provider discovery, and
                    recommendations that fit each list.
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 border-y border-gray-900/60 bg-gray-950/40">
          <div className="mx-auto max-w-6xl px-4 py-6">
            <div className="relative overflow-hidden rounded-xl border border-gray-900 bg-gray-950/60">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_50%_-20%,rgba(239,68,68,0.16),transparent_60%)]" />
              <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
                <div className="flex w-max items-center gap-10 py-4 pl-6 pr-12 text-xs text-gray-400 motion-reduce:translate-x-0 motion-reduce:animate-none sm:text-sm animate-[wt-marquee_28s_linear_infinite]">
                  <span className="whitespace-nowrap text-gray-300">
                    Shared lists
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    Optional watch-status sync
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    Activity feed
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    TV scheduling
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    Episode tracking
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    Import/export
                  </span>
                  <span className="whitespace-nowrap text-gray-300">
                    Provider discovery
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Shared lists
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Optional watch-status sync
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Activity feed
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    TV scheduling
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Episode tracking
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Import/export
                  </span>
                  <span
                    aria-hidden={true}
                    className="whitespace-nowrap text-gray-300"
                  >
                    Provider discovery
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </LandingSpotlightClient>

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-10 md:grid-cols-2 md:items-end">
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-400">
                Built for people
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-gray-50 sm:text-4xl">
                Less “app,” more “group plan.”
              </h2>
              <p className="text-gray-300">
                WatchThis is designed for the way friends and families actually
                watch: shared lists, different pacing, and the occasional “wait,
                you watched that without me?”
              </p>
            </div>
            <div className="space-y-4 rounded-2xl border border-gray-900 bg-gray-900/20 p-6">
              <p className="text-sm text-gray-300">
                What sets WatchThis apart from typical trackers:
              </p>
              <div className="grid gap-3 text-sm text-gray-300 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-md bg-red-500/15 text-red-300 grid place-items-center">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <span>Share lists with permissions, not chaos</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-md bg-red-500/15 text-red-300 grid place-items-center">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <span>Activity feed keeps everyone in the loop</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-md bg-red-500/15 text-red-300 grid place-items-center">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </div>
                  <span>TV schedules for “weeknight shows”</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-md bg-red-500/15 text-red-300 grid place-items-center">
                    <Import className="h-3.5 w-3.5" />
                  </div>
                  <span>Export and import your progress</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Card
              variant="entertainment"
              hover="lift"
              className="relative overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_20%_0%,rgba(239,68,68,0.16),transparent_60%)]" />
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-red-400" />
                  Shared lists
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-300">
                Create lists for “with the kids,” “date night,” or “friends in
                town.” Make them private or public, then invite collaborators.
              </CardContent>
            </Card>

            <Card
              variant="entertainment"
              hover="lift"
              className="relative overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_80%_0%,rgba(249,115,22,0.14),transparent_60%)]" />
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-red-400" />
                  Activity feed
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-300">
                See what people add and watch, so recommendations don&apos;t get
                lost in texts or group chats.
              </CardContent>
            </Card>

            <Card
              variant="entertainment"
              hover="lift"
              className="relative overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_50%_0%,rgba(168,85,247,0.12),transparent_60%)]" />
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-red-400" />
                  TV scheduling
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-300">
                Track episodes and schedule shows on specific days so your “next
                episode” is always ready when the week rolls around.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="relative border-t border-gray-900/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-10 md:grid-cols-[1fr_0.9fr] md:items-start">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-gray-50 sm:text-3xl">
                A quick mental model
              </h2>
              <p className="text-gray-300">
                Discover content, save it to lists, and track watch status
                separately. That means you can share a list without forcing
                everyone to watch at the same pace.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-900 bg-gray-900/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
                    <Search className="h-4 w-4 text-red-400" /> Discover
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    TMDB-powered search, details, cast, and recommendations.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-900 bg-gray-900/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
                    <ListChecks className="h-4 w-4 text-red-400" /> Organize
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    Build lists, share them, and control permissions.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-900 bg-gray-900/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
                    <CalendarDays className="h-4 w-4 text-red-400" /> Track
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    Watch status, episodes, schedules, and progress sync
                    (optional).
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild={true} variant="gradient" size="lg">
                  <Link href="/auth">
                    Start watching together{" "}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild={true} variant="outline" size="lg">
                  <Link href="/help">Browse Help Articles</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-900 bg-gray-900/15 p-6">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-gray-100">
                  Helpful reads
                </p>
                <Link
                  href="/help"
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Help Center
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                <Link
                  href="/help/getting-started/what-is-watchthis"
                  className="group rounded-xl border border-gray-900 bg-gray-950/40 p-4 transition-colors hover:bg-gray-900/30"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-100">
                        What is WatchThis?
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        Lists, tracking, schedules, and sync in one place.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-300" />
                  </div>
                </Link>
                <Link
                  href="/help/collaboration/share-a-list-with-collaborators"
                  className="group rounded-xl border border-gray-900 bg-gray-950/40 p-4 transition-colors hover:bg-gray-900/30"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-100">
                        Share a list with collaborators
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        Invite friends, set permissions, choose sync behavior.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-300" />
                  </div>
                </Link>
                <Link
                  href="/help/tracking/watch-status-explained"
                  className="group rounded-xl border border-gray-900 bg-gray-950/40 p-4 transition-colors hover:bg-gray-900/30"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-100">
                        Watch status explained
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        Planning, watching, paused, completed, dropped.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-300" />
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-900/60">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-100">WatchThis</p>
              <p className="text-sm text-gray-400">Media is better together.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild={true} variant="ghost" size="sm">
                <Link href="/help">Help Center</Link>
              </Button>
              <Button asChild={true} variant="outline" size="sm">
                <Link href="/auth">Sign In</Link>
              </Button>
              <Button asChild={true} variant="ghost" size="sm">
                <a
                  href="https://github.com/benpaulsen4/watch-this"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center"
                >
                  <Github className="mr-2 h-4 w-4" />
                  Contribute on GitHub
                </a>
              </Button>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              TMDB and JustWatch are used for content data and availability.
            </p>
            <p>© {new Date().getFullYear()} WatchThis</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
