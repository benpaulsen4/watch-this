"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** A `DOMException`-shaped rejection, without assuming the constructor. */
function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
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
 */
function cardQueryOptions(period: string) {
  return queryOptions({
    queryKey: ["series-finale-card", period] as const,
    queryFn: () => fetchCardFile(period),
    // A generated card is a snapshot: nothing to refetch for, and a failed
    // fetch should not spend retries a click will just repeat anyway.
    staleTime: Infinity,
    retry: false,
  });
}

interface ShareButtonProps {
  period: string;
  /** "Share" in the recap header, "Share your card" on the story's close. */
  label?: string;
  size?: "sm" | "lg";
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
  label = "Share",
  size = "sm",
}: ShareButtonProps) {
  const queryClient = useQueryClient();
  const options = cardQueryOptions(period);
  const { data: cardFile } = useQuery(options);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
        onClick={() => void share()}
        disabled={busy}
      >
        <Share2 className="mr-2 h-4 w-4" />
        {label}
      </Button>
      {failed && (
        <span className="mt-1 text-xs text-gray-500">
          That card could not be made. Try again in a moment.
        </span>
      )}
    </div>
  );
}
