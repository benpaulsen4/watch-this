import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PHONE_MEDIA_QUERY, usePhoneViewport } from "./usePhoneViewport";

/** A controllable `matchMedia` whose one query can change after mounting. */
const stubMatchMedia = (initial: boolean) => {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((media: string) => ({
    get matches() {
      return matches;
    },
    media,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePhoneViewport", () => {
  it("asks for the width below md", () => {
    const media = stubMatchMedia(false);
    renderHook(() => usePhoneViewport());
    expect(media.matchMedia).toHaveBeenCalledWith(PHONE_MEDIA_QUERY);
    expect(PHONE_MEDIA_QUERY).toBe("(max-width: 767px)");
  });

  it("is true on a phone and false on a desktop", () => {
    stubMatchMedia(true);
    expect(renderHook(() => usePhoneViewport()).result.current).toBe(true);

    stubMatchMedia(false);
    expect(renderHook(() => usePhoneViewport()).result.current).toBe(false);
  });

  it("follows the viewport across the breakpoint, and unsubscribes", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => usePhoneViewport());

    act(() => media.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("is not a phone where matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => usePhoneViewport()).result.current).toBe(false);
  });

  it("is unknown on the server, whatever the client would say", () => {
    stubMatchMedia(true);
    function Probe() {
      return <span>{String(usePhoneViewport())}</span>;
    }
    expect(renderToString(<Probe />)).toContain("null");
  });
});
