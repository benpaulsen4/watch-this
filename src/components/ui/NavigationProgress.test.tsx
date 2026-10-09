import { act, fireEvent, render, screen } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishNavigationProgress,
  isNavigationPending,
  startNavigationProgress,
} from "@/lib/navigation-progress";

import {
  FADE_MS,
  FINISH_MS,
  NavigationProgress,
  SHOW_DELAY_MS,
  TRICKLE_MS,
} from "./NavigationProgress";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

const bar = () => screen.getByTestId("navigation-progress");
const fill = () => bar().firstElementChild as HTMLElement;
const scale = () => Number(/scaleX\(([\d.]+)\)/.exec(fill().style.transform)![1]);

describe("NavigationProgress", () => {
  let pathname = "/dashboard";

  beforeEach(() => {
    vi.useFakeTimers();
    pathname = "/dashboard";
    window.history.replaceState(null, "", pathname);
    vi.mocked(usePathname).mockImplementation(() => pathname);
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
  });

  afterEach(() => {
    finishNavigationProgress();
    vi.useRealTimers();
  });

  const land = (rerender: (ui: React.ReactElement) => void, to: string) => {
    pathname = to;
    window.history.replaceState(null, "", to);
    rerender(<NavigationProgress />);
  };

  it("stays hidden for a navigation that lands within the show delay", () => {
    const { rerender } = render(<NavigationProgress />);

    act(() => startNavigationProgress("/lists"));
    expect(bar()).toHaveAttribute("data-phase", "waiting");
    expect(fill().style.opacity).toBe("0");

    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS - 1));
    act(() => land(rerender, "/lists"));

    expect(bar()).toHaveAttribute("data-phase", "idle");
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    expect(fill().style.opacity).toBe("0");
  });

  it("shows, trickles below the ceiling, then fills and fades when the route lands", () => {
    const { rerender } = render(<NavigationProgress />);

    act(() => startNavigationProgress("/lists"));
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    expect(bar()).toHaveAttribute("data-phase", "loading");
    expect(fill().style.opacity).toBe("1");
    const shown = scale();
    expect(shown).toBeGreaterThan(0);

    // Long enough to approach the ceiling, short of the store's give-up.
    act(() => vi.advanceTimersByTime(TRICKLE_MS * 40));
    expect(scale()).toBeGreaterThan(shown);
    expect(scale()).toBeLessThan(0.9);

    act(() => land(rerender, "/lists"));
    expect(isNavigationPending()).toBe(false);
    expect(bar()).toHaveAttribute("data-phase", "done");
    expect(scale()).toBe(1);
    expect(fill().style.opacity).toBe("0");

    act(() => vi.advanceTimersByTime(FINISH_MS + FADE_MS));
    expect(bar()).toHaveAttribute("data-phase", "idle");
    expect(scale()).toBe(0);
  });

  it("finishes when only the search params change", () => {
    const { rerender } = render(<NavigationProgress />);

    act(() => startNavigationProgress("/dashboard?tab=upcoming"));
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=upcoming") as ReturnType<typeof useSearchParams>,
    );
    act(() => rerender(<NavigationProgress />));

    expect(isNavigationPending()).toBe(false);
    expect(bar()).toHaveAttribute("data-phase", "idle");
  });

  it("restarts from empty when a navigation starts while the last one fades", () => {
    const { rerender } = render(<NavigationProgress />);

    act(() => startNavigationProgress("/lists"));
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    act(() => land(rerender, "/lists"));
    expect(bar()).toHaveAttribute("data-phase", "done");

    act(() => startNavigationProgress("/search"));
    expect(bar()).toHaveAttribute("data-phase", "waiting");
    expect(scale()).toBe(0);

    act(() => vi.advanceTimersByTime(FINISH_MS + FADE_MS));
    expect(bar()).toHaveAttribute("data-phase", "loading");
  });

  it("finishes on back or forward", () => {
    render(<NavigationProgress />);

    act(() => startNavigationProgress("/lists"));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(isNavigationPending()).toBe(false);
  });

  it("finishes when the page is restored from the back/forward cache", () => {
    render(<NavigationProgress />);

    act(() => startNavigationProgress("/lists"));
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: false }),
      );
    });
    expect(isNavigationPending()).toBe(true);

    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(isNavigationPending()).toBe(false);
  });

  describe("link clicks", () => {
    const renderWithLink = (attrs: Record<string, string> = {}) => {
      render(
        <>
          <NavigationProgress />
          {/* A bare anchor: the bar listens for clicks on any link, and
              next/link renders one of these. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/lists" {...attrs}>
            <span>Lists</span>
          </a>
        </>,
      );
      // jsdom would otherwise try to navigate.
      document.addEventListener("click", (e) => e.preventDefault(), {
        once: true,
      });
      return screen.getByText("Lists");
    };

    it("starts on a plain left click inside a link", () => {
      fireEvent.click(renderWithLink());
      expect(isNavigationPending()).toBe(true);
    });

    it.each([
      ["a modifier key", { metaKey: true }],
      ["a middle click", { button: 1 }],
    ])("ignores %s, which opens a new tab", (_, init) => {
      fireEvent.click(renderWithLink(), init);
      expect(isNavigationPending()).toBe(false);
    });

    it("ignores links that open in another window", () => {
      fireEvent.click(renderWithLink({ target: "_blank" }));
      expect(isNavigationPending()).toBe(false);
    });

    it("ignores download links", () => {
      fireEvent.click(renderWithLink({ download: "" }));
      expect(isNavigationPending()).toBe(false);
    });

    it("ignores a click something else already cancelled", () => {
      const link = renderWithLink();
      // Window capture listeners run before the bar's document one.
      window.addEventListener("click", (e) => e.preventDefault(), {
        capture: true,
        once: true,
      });
      fireEvent.click(link);
      expect(isNavigationPending()).toBe(false);
    });

    it("ignores a link to the current page", () => {
      fireEvent.click(renderWithLink({ href: "/dashboard#upcoming" }));
      expect(isNavigationPending()).toBe(false);
    });
  });
});
