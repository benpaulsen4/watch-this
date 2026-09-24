import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** The profile rows that open the recap and the story live on its data tab. */
export const PROFILE_DATA_TAB = "/profile#data";

/**
 * A 404: the period is not available to this user -- not over yet where they
 * are, or before they logged anything. Retrying never helps, so this does not
 * suggest it. Shared by the recap and the story.
 */
export function UnavailableNotice({ period }: { period: string }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-50">
        No Series Finale for {period}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm text-gray-400">
        Either that year is not over yet where you are, or you had not logged
        anything by then. Nothing to recap either way.
      </p>
      <Button variant="outline" size="sm" className="mt-6" asChild>
        <Link href={PROFILE_DATA_TAB}>Back to your profile</Link>
      </Button>
    </Card>
  );
}

/** Any other failure, which may well pass. */
export function LoadFailedNotice() {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <p className="text-sm text-gray-400">
        That recap could not be loaded. Try again in a moment.
      </p>
    </Card>
  );
}
