import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect,test, vi } from "vitest";

import { useInfiniteScroll } from "./useInfiniteScroll";

function InfiniteScrollTest({
  onLoadMore,
  hasMore,
  loading,
  threshold,
  debounceMs,
}: {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  threshold?: number;
  debounceMs?: number;
}) {
  const { targetRef } = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading,
    threshold,
    debounceMs,
  });
  return <div data-testid="sentinel" ref={targetRef} />;
}

describe("useInfiniteScroll", () => {
  let observeMock: ReturnType<typeof vi.fn>;
  let unobserveMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let capturedCallback: (entries: IntersectionObserverEntry[]) => void;
  let capturedOptions: IntersectionObserverInit | undefined;
  let IOConstructorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observeMock = vi.fn();
    unobserveMock = vi.fn();
    disconnectMock = vi.fn();
    capturedCallback = undefined as unknown as (
      entries: IntersectionObserverEntry[],
    ) => void;
    capturedOptions = undefined;

    IOConstructorMock = vi.fn(
      (
        cb: (entries: IntersectionObserverEntry[]) => void,
        options?: IntersectionObserverInit,
      ) => {
        capturedCallback = cb;
        capturedOptions = options;
        return {
          observe: observeMock,
          unobserve: unobserveMock,
          disconnect: disconnectMock,
        } as unknown as IntersectionObserver;
      },
    );

    window.IntersectionObserver =
      IOConstructorMock as unknown as typeof IntersectionObserver;
  });

  test("observes target with configured options and cleans up on unmount", () => {
    const onLoadMore = vi.fn();
    const { unmount } = render(
      <InfiniteScrollTest
        onLoadMore={onLoadMore}
        hasMore={true}
        loading={false}
        threshold={200}
        debounceMs={40}
      />,
    );

    const sentinel = screen.getByTestId("sentinel");
    expect(IOConstructorMock).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toEqual({
      root: null,
      rootMargin: "200px",
      threshold: 0.1,
    });
    expect(observeMock).toHaveBeenCalledWith(sentinel);

    unmount();
    expect(unobserveMock).toHaveBeenCalledWith(sentinel);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test("calls onLoadMore when intersecting, hasMore=true and loading=false", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTest
        onLoadMore={onLoadMore}
        hasMore={true}
        loading={false}
        threshold={100}
        debounceMs={40}
      />,
    );

    // Simulate intersection
    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test("does not call onLoadMore when loading=true", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTest
        onLoadMore={onLoadMore}
        hasMore={true}
        loading={true}
        threshold={100}
        debounceMs={40}
      />,
    );

    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("does not call onLoadMore when hasMore=false", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTest
        onLoadMore={onLoadMore}
        hasMore={false}
        loading={false}
        threshold={100}
        debounceMs={40}
      />,
    );

    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("debounces rapid successive intersections based on debounceMs", () => {
    const onLoadMore = vi.fn();
    const nowSpy = vi.spyOn(Date, "now");

    render(
      <InfiniteScrollTest
        onLoadMore={onLoadMore}
        hasMore={true}
        loading={false}
        threshold={100}
        debounceMs={50}
      />,
    );

    // First intersection at t=100ms (meets initial debounce threshold)
    nowSpy.mockReturnValue(100);
    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // Second intersection at t=120ms (still within 50ms window, debounced)
    nowSpy.mockReturnValue(120);
    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // Third intersection at t=200ms (past debounce; should trigger)
    nowSpy.mockReturnValue(200);
    capturedCallback([
      { isIntersecting: true } as unknown as IntersectionObserverEntry,
    ]);
    expect(onLoadMore).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});
