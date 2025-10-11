import { useEffect, useRef, useCallback } from "react";

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  threshold?: number;
  debounceMs?: number;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  threshold = 100,
  debounceMs = 40,
}: UseInfiniteScrollOptions) {
  const targetRef = useRef<HTMLDivElement>(null);
  const lastExecutionRef = useRef<number>(0);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loading) {
        const now = Date.now();
        if (now - lastExecutionRef.current >= debounceMs) {
          lastExecutionRef.current = now;
          onLoadMore();
        }
      }
    },
    [onLoadMore, hasMore, loading, debounceMs],
  );

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1,
    });

    observer.observe(target);

    return () => {
      observer.unobserve(target);
      observer.disconnect();
    };
  }, [handleIntersection, threshold]);

  return { targetRef };
}
