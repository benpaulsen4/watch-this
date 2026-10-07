import { notFound } from "next/navigation";

import { StoryReel } from "@/components/series-finale/StoryReel";
import { parsePeriodLabel } from "@/lib/series-finale/periods";

import { requireUser, toClientUser } from "../../../requireUser";

interface SeriesFinaleStoryPageProps {
  params: Promise<{ period: string }>;
}

export default async function SeriesFinaleStoryPage({
  params,
}: SeriesFinaleStoryPageProps) {
  const { period } = await params;
  const user = await requireUser(`/series-finale/${period}/story`);

  // As on the recap page: a segment that is not a period is a missing page,
  // not a load failure to retry.
  if (!parsePeriodLabel(period)) notFound();

  return <StoryReel period={period} user={toClientUser(user)} />;
}
