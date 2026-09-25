import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "./ShareButton";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mockCardFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    }),
  );

/** The download path needs an anchor whose `.click()` jsdom cannot navigate. */
const stubDownload = () => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  });
  return vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
};

const renderButton = (
  props: Partial<{ label: string; size: "sm" | "lg" }> = {},
) =>
  render(<ShareButton period="2026" username="ben" {...props} />, { wrapper });

/**
 * One client held outside the tree, so a test can watch its cache and a
 * rerender keeps it -- `wrapper` above builds a fresh client on every render.
 */
const renderWithClient = (username = "ben") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (name: string) => (
    <QueryClientProvider client={client}>
      <ShareButton period="2026" username={name} />
    </QueryClientProvider>
  );
  const result = render(tree(username));
  return {
    client,
    rerenderAs: (name: string) => result.rerender(tree(name)),
  };
};

/**
 * Waits until the mount-time prefetch has landed *and* the button has
 * re-rendered holding the file. TanStack notifies observers on a zero-delay
 * timer, so the cache has the file a tick before the component does.
 */
const waitForPrefetch = async (client: QueryClient) => {
  await waitFor(() =>
    expect(
      client
        .getQueriesData({ queryKey: ["series-finale-card"] })
        .some(([, data]) => data instanceof File),
    ).toBe(true),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

type ShareFn = (data: ShareData) => Promise<void>;

const clickShare = async (name: RegExp = /share/i) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("ShareButton", () => {
  it("prefetches the card as soon as it mounts, before any click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderButton();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/card"),
    );
  });

  it("fetches the card for the given period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    stubDownload();

    renderButton();
    await clickShare();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/series-finale/2026/card"),
    );
  });

  it("shares only the card file: no text, title or url", async () => {
    mockCardFetch();
    const share = vi.fn<ShareFn>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });

    renderButton();
    await clickShare();

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]?.[0];
    expect(Object.keys(data ?? {})).toEqual(["files"]);
    expect(data?.files).toHaveLength(1);
    const file = data?.files?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("series-finale-2026.png");
    expect(file?.type).toBe("image/png");
  });

  // iOS Safari refuses navigator.share once the tap's transient activation
  // has lapsed, and an `await` before the call is enough to lapse it. With
  // the card prefetched, the call has to happen inside the click itself.
  it("calls the share sheet synchronously in the click once the card is prefetched", async () => {
    mockCardFetch();
    const share = vi.fn<ShareFn>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });

    const { client } = renderWithClient();
    await waitForPrefetch(client);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    // Nothing awaited between the click and this line.
    expect(share).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /share/i })).not.toBeDisabled(),
    );
  });

  it("fetches a fresh card when the username changes, not the cached one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { client, rerenderAs } = renderWithClient("ben");
    await waitForPrefetch(client);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerenderAs("ben-renamed");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("falls back to a download when the platform cannot share files", async () => {
    mockCardFetch();
    // jsdom's own navigator has neither `share` nor `canShare`.
    const clickSpy = stubDownload();

    renderButton();
    await clickShare();

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it("names the downloaded file after the period", async () => {
    mockCardFetch();
    let downloadName: string | undefined;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    renderButton();
    await clickShare();

    await waitFor(() => expect(downloadName).toBe("series-finale-2026.png"));
  });

  it("revokes the object URL after the click has been handed off, not during it", async () => {
    mockCardFetch();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const { client } = renderWithClient();
    await waitForPrefetch(client);

    // With the card prefetched, the whole download path runs inside the
    // click, so any revoke not deferred to a timer has happened by now.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("stays silent when the user cancels the native share sheet", async () => {
    mockCardFetch();
    const cancelled = Object.assign(new Error("cancelled"), {
      name: "AbortError",
    });
    const share = vi.fn().mockRejectedValue(cancelled);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });

    renderButton();
    await clickShare();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /share/i })).not.toBeDisabled(),
    );
    expect(screen.queryByText(/could not be made/i)).not.toBeInTheDocument();
  });

  // A DOMException is an Error in current engines, but the cancel check must
  // not depend on that: it reads the name off whatever shape was thrown.
  it("stays silent on a cancel that is not an Error instance", async () => {
    mockCardFetch();
    const share = vi.fn().mockRejectedValue({ name: "AbortError" });
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });

    renderButton();
    await clickShare();

    await waitFor(() => expect(share).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /share/i })).not.toBeDisabled(),
    );
    expect(screen.queryByText(/could not be made/i)).not.toBeInTheDocument();
  });

  it("falls back to download when the share sheet refuses with NotAllowedError", async () => {
    mockCardFetch();
    const refused = Object.assign(new Error("not allowed"), {
      name: "NotAllowedError",
    });
    const share = vi.fn().mockRejectedValue(refused);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });
    const clickSpy = stubDownload();

    renderButton();
    await clickShare();

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(screen.queryByText(/could not be made/i)).not.toBeInTheDocument();
  });

  it("reports a failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    renderButton();
    await clickShare();

    await waitFor(() =>
      expect(screen.getByText(/could not be made/i)).toBeInTheDocument(),
    );
  });

  it("uses the given label and size, as the story summary card does", async () => {
    mockCardFetch();
    renderButton({ label: "Share your card", size: "lg" });

    expect(
      screen.getByRole("button", { name: "Share your card" }),
    ).toBeInTheDocument();
  });
});
