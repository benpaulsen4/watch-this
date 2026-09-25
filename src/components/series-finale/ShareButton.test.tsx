import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
) => render(<ShareButton period="2026" {...props} />, { wrapper });

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

  it("uses the native share sheet when it can share files", async () => {
    mockCardFetch();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });

    renderButton();
    await clickShare();

    await waitFor(() => expect(share).toHaveBeenCalled());
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

  it("revokes the object URL once the click has been handed off", async () => {
    mockCardFetch();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderButton();
    await clickShare();

    // Deferred with `setTimeout`, not called synchronously inside the click
    // handler -- see the comment beside `URL.revokeObjectURL` in the source.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:x"));
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
