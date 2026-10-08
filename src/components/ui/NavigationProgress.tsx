"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";

import {
  finishNavigationProgress,
  isNavigationPending,
  startNavigationProgress,
  subscribeNavigationProgress,
} from "@/lib/navigation-progress";
import { cn } from "@/lib/utils";

// Prefetched routes usually land within a frame or two; holding the bar back
// keeps those navigations from flashing it.
export const SHOW_DELAY_MS = 120;
export const TRICKLE_MS = 300;
// How long the bar takes to fill once the route lands, then to fade out. The
// transition classes below are written to match.
export const FINISH_MS = 200;
export const FADE_MS = 300;

const INITIAL_PROGRESS = 0.15;
// The bar creeps towards this but never reaches it, since a server render
// gives no real progress to report.
const TRICKLE_CEILING = 0.9;

// waiting: a navigation started, but the show delay has not elapsed
// loading:  the bar is visible and trickling
// done:     the route landed; the bar fills, then fades
type Phase = "idle" | "waiting" | "loading" | "done";

function onDocumentClick(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;

  startNavigationProgress(anchor.href);
}

// A page restored from the back/forward cache comes back exactly as it was
// left, so one left by a plain <a> (the help articles' links are) would still
// be mid-navigation, and its URL will never change to finish it.
function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) finishNavigationProgress();
}

function NavigationProgressBar() {
  const pending = useSyncExternalStore(
    subscribeNavigationProgress,
    isNavigationPending,
    () => false,
  );
  const pathname = usePathname();
  const search = useSearchParams().toString();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [prevPending, setPrevPending] = useState(pending);

  if (pending !== prevPending) {
    setPrevPending(pending);
    if (pending) {
      setPhase("waiting");
      setProgress(0);
    } else {
      setPhase(phase === "loading" ? "done" : "idle");
    }
  }

  // The route has landed once the URL it renders changes.
  useEffect(() => {
    finishNavigationProgress();
  }, [pathname, search]);

  useEffect(() => {
    // Capture phase, so it runs before next/link calls preventDefault to take
    // the navigation client-side.
    document.addEventListener("click", onDocumentClick, true);
    // Back or forward supersedes whatever was pending, and may land on an
    // entry with the same path and search, which would never finish it.
    window.addEventListener("popstate", finishNavigationProgress);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", finishNavigationProgress);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (phase === "waiting") {
      const timer = setTimeout(() => {
        setPhase("loading");
        setProgress(INITIAL_PROGRESS);
      }, SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "loading") {
      const timer = setInterval(() => {
        setProgress((p) => p + (TRICKLE_CEILING - p) * 0.1);
      }, TRICKLE_MS);
      return () => clearInterval(timer);
    }
    if (phase === "done") {
      const timer = setTimeout(() => setPhase("idle"), FINISH_MS + FADE_MS);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const visible = phase === "loading" || phase === "done";

  return (
    <div
      aria-hidden="true"
      data-testid="navigation-progress"
      data-phase={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5"
    >
      <div
        className={cn(
          "h-full origin-left bg-gradient-to-r from-red-600 to-orange-500 shadow-lg shadow-red-500/40",
          phase === "loading" &&
            "transition-transform duration-300 ease-out motion-reduce:transition-none",
          // Fill first, then fade once the fill has finished.
          phase === "done" &&
            "transition-[transform,opacity] duration-[200ms,300ms] delay-[0ms,200ms] ease-out motion-reduce:transition-none",
        )}
        style={{
          transform: `scaleX(${phase === "done" ? 1 : visible ? progress : 0})`,
          opacity: phase === "loading" ? 1 : 0,
        }}
      />
    </div>
  );
}

/**
 * A thin bar along the top of the viewport while a client-side navigation
 * waits on the server. Mounted once, in the root layout.
 */
export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary, or it opts every statically
  // rendered route out of static rendering.
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
