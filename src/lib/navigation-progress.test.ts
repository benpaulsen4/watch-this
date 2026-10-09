import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishNavigationProgress,
  isNavigationPending,
  isTrackedNavigation,
  MAX_PENDING_MS,
  startNavigationProgress,
  subscribeNavigationProgress,
} from "./navigation-progress";

describe("navigation-progress", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/lists/1?sort=asc");
  });

  afterEach(() => {
    finishNavigationProgress();
  });

  describe("isTrackedNavigation", () => {
    it("tracks a different path or search on this origin", () => {
      expect(isTrackedNavigation("/dashboard")).toBe(true);
      expect(isTrackedNavigation("/lists/1?sort=desc")).toBe(true);
      expect(isTrackedNavigation("/lists/1")).toBe(true);
      expect(isTrackedNavigation(`${window.location.origin}/search`)).toBe(
        true,
      );
    });

    it("ignores the current URL and hash-only changes, which never land", () => {
      expect(isTrackedNavigation("/lists/1?sort=asc")).toBe(false);
      expect(isTrackedNavigation("/lists/1?sort=asc#items")).toBe(false);
      expect(isTrackedNavigation("#items")).toBe(false);
    });

    it("compares search params as useSearchParams serialises them", () => {
      window.history.replaceState(null, "", "/search?q=the%20wire");
      expect(isTrackedNavigation("/search?q=the+wire")).toBe(false);
      expect(isTrackedNavigation("/search?q=the+bear")).toBe(true);
    });

    it("ignores other origins and schemes", () => {
      expect(isTrackedNavigation("https://www.themoviedb.org/")).toBe(false);
      expect(isTrackedNavigation("mailto:someone@example.com")).toBe(false);
    });
  });

  it("starts once and notifies subscribers, then finishes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNavigationProgress(listener);

    startNavigationProgress("/dashboard");
    startNavigationProgress("/search");
    expect(isNavigationPending()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    finishNavigationProgress();
    finishNavigationProgress();
    expect(isNavigationPending()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    startNavigationProgress("/dashboard");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not start for an untracked navigation", () => {
    startNavigationProgress("#items");
    expect(isNavigationPending()).toBe(false);
  });

  it("finishes a pending navigation replaced by one to the current URL", () => {
    startNavigationProgress("/dashboard");
    startNavigationProgress("/lists/1?sort=asc");
    expect(isNavigationPending()).toBe(false);
  });

  describe("when the URL never changes", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("gives up after MAX_PENDING_MS", () => {
      startNavigationProgress("/dashboard");
      vi.advanceTimersByTime(MAX_PENDING_MS - 1);
      expect(isNavigationPending()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isNavigationPending()).toBe(false);
    });

    it("does not let an earlier navigation's timer cut a later one short", () => {
      startNavigationProgress("/dashboard");
      vi.advanceTimersByTime(MAX_PENDING_MS - 1000);
      finishNavigationProgress();

      startNavigationProgress("/search");
      vi.advanceTimersByTime(1000);
      expect(isNavigationPending()).toBe(true);
    });
  });
});
