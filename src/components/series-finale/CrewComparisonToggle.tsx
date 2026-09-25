"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Switch } from "@/components/ui/Switch";

type Props = {
  user: { shareStatsWithCollaborators: boolean };
  onUpdate: () => Promise<void> | void;
};

const DESCRIPTION =
  "People you share a list with can see your episode and hour totals in their Series Finale. Turning this off removes you from theirs.";

/**
 * The crew-comparison opt-out. Unlike `TimezoneSelector`, there is no edit
 * mode to enter first -- a boolean has nothing to confirm before sending, so
 * every toggle PUTs straight to `/api/auth/session`.
 *
 * The switch flips immediately (optimistic, the same shape as
 * `ListSettingsModal`'s archive toggle) and reverts on a failed PUT, saying
 * so plainly, rather than leaving the control showing a value that was
 * never saved.
 */
export function CrewComparisonToggle({ user, onUpdate }: Props) {
  const [checked, setChecked] = useState(user.shareStatsWithCollaborators);
  const [error, setError] = useState<string | null>(null);

  // Adjusts local state during render rather than in an effect (see
  // https://react.dev/learn/you-might-not-need-an-effect), the same
  // "remembered prop" shape as `ListSettingsModal`'s `wasOpen`. This is what
  // picks up a value that changed for a reason other than this component's
  // own mutation -- e.g. another tab's change landing after
  // `refreshSession`. `checked` otherwise stays free to diverge from the
  // prop in between, which is exactly what the optimistic flip below and its
  // revert rely on.
  const [seenValue, setSeenValue] = useState(user.shareStatsWithCollaborators);
  if (seenValue !== user.shareStatsWithCollaborators) {
    setSeenValue(user.shareStatsWithCollaborators);
    setChecked(user.shareStatsWithCollaborators);
  }

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const response = await fetch("/api/auth/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareStatsWithCollaborators: next }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save");
      }
      return data;
    },
    onSuccess: async () => {
      await onUpdate();
    },
    onError: (_error: unknown, next: boolean) => {
      // The optimistic flip below is what the switch reads, so a rejected PUT
      // has to put it back -- next was the value just sent, so the value
      // before that toggle is simply its opposite.
      setChecked(!next);
      setError("Could not save that. Reverted.");
    },
  });

  const handleChange = (selected: boolean) => {
    setError(null);
    setChecked(selected);
    mutation.mutate(selected);
  };

  return (
    <div className="space-y-2">
      <Switch
        label="Include me in crew comparisons"
        helperText={DESCRIPTION}
        isSelected={checked}
        onChange={handleChange}
        isDisabled={mutation.isPending}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
