import { ActivityTimelineClient } from "@/components/activity/ActivityTimelineClient";
import { PageHeader } from "@/components/ui/PageHeader";

import { requireUser } from "../requireUser";

export default async function ActivityPage() {
  await requireUser("/activity");

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader title="Activity Timeline" backLinkHref="/dashboard" />
      <ActivityTimelineClient />
    </div>
  );
}
