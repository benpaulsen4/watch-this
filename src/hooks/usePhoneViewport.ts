"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `md`: the line between a phone and a desktop. */
export const PHONE_MEDIA_QUERY = "(max-width: 767px)";

function phoneQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(PHONE_MEDIA_QUERY)
    : null;
}

function subscribe(onChange: () => void) {
  const query = phoneQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const getSnapshot = () => phoneQuery()?.matches ?? false;

// The server has no viewport, and hydration must match what it rendered.
const getServerSnapshot = () => null;

/**
 * Whether the viewport is a phone's: true or false once known, and null on
 * the server and through hydration, when it cannot be. Null is not a phone:
 * nothing that depends on the answer should act on it, only wait.
 *
 * A client-side navigation reads the real answer on its first render; only a
 * full page load spends one render on null.
 */
export function usePhoneViewport(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}
