"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * The `name` of a `DOMException`-shaped rejection, by shape rather than by
 * `instanceof`: a cancel read as an unknown failure would show failure copy
 * and skip the NotAllowedError download fallback.
 */
function errorName(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : undefined;
}

async function fetchCardFile(period: string): Promise<File> {
  const response = await fetch(`/api/series-finale/${period}/card`);
  if (!response.ok) throw new Error(`Card failed: ${response.status}`);

  const blob = await response.blob();
  return new File([blob], `series-finale-${period}.png`, {
    type: "image/png",
  });
}

/**
 * The card query, shared between the mount-time prefetch and the click
 * handler's fallback fetch, so both agree on the same cache entry.
 *
 * Keyed by the username the card is drawn with, not just the period: a
 * rename mid-session keeps the same user id, so the sign-in cache clear in
 * AuthProvider does not fire, and the cached card would still carry the old
 * name.
 */
function cardQueryOptions(period: string, username: string) {
  return queryOptions({
    queryKey: ["series-finale-card", period, username] as const,
    queryFn: () => fetchCardFile(period),
    // A generated card is a snapshot: nothing to refetch for, and a failed
    // fetch should not spend retries a click will just repeat anyway.
    staleTime: Infinity,
    retry: false,
  });
}

/** What a failed share says, wherever it is shown. */
export const SHARE_FAILURE_LINE =
  "That card could not be made. Try again in a moment.";

interface ShareButtonProps {
  period: string;
  /** The viewer's username, which the server draws on the card. */
  username: string;
  /** "Share" in the recap header, "Share your card" on the story's close. */
  label?: string;
  size?: "sm" | "lg";
  /**
   * Below `sm`, show only the icon; the label stays the button's accessible
   * name. For the recap header, where a phone has no room for the words.
   */
  collapse?: boolean;
  /**
   * When given, a failure is the caller's to show (with
   * `SHARE_FAILURE_LINE`), and the button draws no line of its own: the recap
   * header's bar has a fixed height, so the line goes below it. Called with
   * true on a failure and false when the next attempt starts.
   */
  onFailureChange?: (failed: boolean) => void;
}

/**
 * Fetches the rendered card and hands it to the platform.
 *
 * The card is prefetched as soon as this mounts (via `useQuery`, so no raw
 * `useEffect` + `setState`), and the query result is read synchronously in
 * the click handler when it is already there -- `navigator.share` has to be
 * called within the click's own call stack, or iOS Safari refuses it once
 * transient activation lapses waiting on a fetch. If the prefetch has not
 * finished yet, the click falls back to awaiting it.
 *
 * `navigator.share` with files is absent on most desktop browsers, so the
 * download path is a real path rather than a fallback nobody hits.
 */
export function ShareButton({
  period,
  username,
  label = "Share",
  size = "sm",
  collapse = false,
  onFailureChange,
}: ShareButtonProps) {
  const queryClient = useQueryClient();
  const options = cardQueryOptions(period, username);
  const { data: cardFile } = useQuery(options);
  const [busy, setBusy] = useState(false);
  const [failed, setFailedState] = useState(false);
  const setFailed = (value: boolean) => {
    setFailedState(value);
    onFailureChange?.(value);
  };

  const share = async () => {
    setBusy(true);
    setFailed(false);

    try {
      const file = cardFile ?? (await queryClient.fetchQuery(options));

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (shareError) {
          const name = errorName(shareError);
          // The user cancelled the share sheet: not a failure worth a line.
          if (name === "AbortError") return;
          // A browser that refuses this particular share (iOS Safari after
          // a slow prefetch, mainly) still has a download path to offer.
          if (name !== "NotAllowedError") {
            setFailed(true);
            return;
          }
        }
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      // Revoked once the click has been handed off, not synchronously --
      // some browsers start the download on the next tick.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        size === "lg" ? "items-center" : "items-end",
      )}
    >
      <Button
        variant="gradient"
        size={size}
        className={cn(collapse && "px-2.5 sm:px-3")}
        onClick={() => void share()}
        disabled={busy}
      >
        <Share2
          aria-hidden="true"
          className={cn("h-4 w-4", collapse ? "sm:mr-2" : "mr-2")}
        />
        {collapse ? (
          <span className="sr-only sm:not-sr-only">{label}</span>
        ) : (
          label
        )}
      </Button>
      {failed && !onFailureChange && (
        <span className="mt-1 text-xs text-gray-500">{SHARE_FAILURE_LINE}</span>
      )}
    </div>
  );
}
