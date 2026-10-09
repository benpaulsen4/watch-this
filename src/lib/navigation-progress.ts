// A tiny external store behind the top-of-page navigation bar. Most pages are
// server components, so a click waits on a server render before the URL
// changes; the bar fills that gap. Anything that starts a navigation calls
// `startNavigationProgress`, and <NavigationProgress /> finishes it when the
// pathname or search params change.

type Listener = () => void;

// The URL change is the only "landed" signal, and some navigations never send
// one: Next discarding a pending navigation for a later one to the current
// URL, a Link whose own onClick cancels it, a redirect back to the current
// page. Past this, the bar gives up rather than sitting at 90% forever.
export const MAX_PENDING_MS = 15_000;

let pending = false;
let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

// useSearchParams().toString() re-serialises the query, so compare both sides
// in that form; `?a=b%20c` and `?a=b+c` are the same page.
function normaliseSearch(search: string) {
  return new URLSearchParams(search).toString();
}

/**
 * Whether navigating to `href` from the current page will wait on the Next
 * router. Hash-only and same-URL navigations never change the pathname or
 * search, so the bar would never be told to finish; cross-origin ones unload
 * the page, and the browser shows its own indicator for those.
 */
export function isTrackedNavigation(href: string): boolean {
  if (typeof window === "undefined") return false;

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) return false;
  return (
    url.pathname !== window.location.pathname ||
    normaliseSearch(url.search) !== normaliseSearch(window.location.search)
  );
}

export function startNavigationProgress(href: string) {
  if (!isTrackedNavigation(href)) {
    // A navigation to the current URL replaces whatever was pending, and it
    // will not change the URL either.
    finishNavigationProgress();
    return;
  }
  if (pending) return;
  pending = true;
  giveUpTimer = setTimeout(finishNavigationProgress, MAX_PENDING_MS);
  emit();
}

export function finishNavigationProgress() {
  clearTimeout(giveUpTimer);
  if (!pending) return;
  pending = false;
  emit();
}

export function subscribeNavigationProgress(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isNavigationPending() {
  return pending;
}
