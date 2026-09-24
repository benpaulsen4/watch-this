import { notFound } from "next/navigation";

import { RecapClient } from "@/components/series-finale/RecapClient";
import { parsePeriodLabel } from "@/lib/series-finale/periods";

import { requireUser, toClientUser } from "../../requireUser";

interface SeriesFinalePageProps {
  params: Promise<{ period: string }>;
}

export default async function SeriesFinalePage({
  params,
}: SeriesFinalePageProps) {
  const { period } = await params;
  const user = await requireUser(`/series-finale/${period}`);

  // A segment that is not a period at all is a missing page. Left to the API,
  // it would come back as a 400 and read as "try again in a moment".
  if (!parsePeriodLabel(period)) notFound();

  return (
    <div className="min-h-screen bg-gray-950">
      <RecapClient period={period} user={toClientUser(user)} />
    </div>
  );
}
