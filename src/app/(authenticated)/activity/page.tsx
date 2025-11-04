import { ActivityTimelineClient } from "@/components/activity/ActivityTimelineClient";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ActivityPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader title="Activity Timeline" backLinkHref="/dashboard" />
      <ActivityTimelineClient />
    </div>
  );
}
