import { renderHook } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishNavigationProgress,
  isNavigationPending,
} from "@/lib/navigation-progress";

import { useProgressRouter } from "./useProgressRouter";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

describe("useProgressRouter", () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    bfcacheId: "_b_1_",
  };

  beforeEach(() => {
    window.history.replaceState(null, "", "/lists");
    vi.mocked(useRouter).mockReturnValue(
      router as unknown as ReturnType<typeof useRouter>,
    );
  });

  afterEach(() => {
    finishNavigationProgress();
  });

  it("starts the bar and forwards push", () => {
    const { result } = renderHook(() => useProgressRouter());

    result.current.push("/lists/1", { scroll: false });

    expect(isNavigationPending()).toBe(true);
    expect(router.push).toHaveBeenCalledWith("/lists/1", { scroll: false });
  });

  it("starts the bar and forwards replace", () => {
    const { result } = renderHook(() => useProgressRouter());

    result.current.replace("/auth");

    expect(isNavigationPending()).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/auth");
  });

  it("leaves refresh alone", () => {
    const { result } = renderHook(() => useProgressRouter());

    result.current.refresh();

    expect(isNavigationPending()).toBe(false);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("passes everything else through untouched", () => {
    const { result } = renderHook(() => useProgressRouter());

    expect(result.current.prefetch).toBe(router.prefetch);
    expect(result.current.back).toBe(router.back);
    expect(result.current.bfcacheId).toBe("_b_1_");
  });

  it("keeps the same identity across renders", () => {
    const { result, rerender } = renderHook(() => useProgressRouter());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
