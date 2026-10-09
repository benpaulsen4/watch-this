"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { startNavigationProgress } from "@/lib/navigation-progress";

/**
 * `useRouter`, but `push` and `replace` start the top-of-page navigation bar.
 * Links start it on their own; use this wherever code navigates instead.
 */
export function useProgressRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();

  return useMemo(
    () => ({
      ...router,
      push: (...args) => {
        startNavigationProgress(args[0]);
        router.push(...args);
      },
      replace: (...args) => {
        startNavigationProgress(args[0]);
        router.replace(...args);
      },
    }),
    [router],
  );
}
