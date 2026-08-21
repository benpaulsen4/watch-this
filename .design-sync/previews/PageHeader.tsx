import { Button, PageHeader } from "watch-this";

export function Default() {
  return <PageHeader title="Your lists" />;
}

export function WithActions() {
  return (
    <PageHeader title="Weekend Watchlist" backLinkHref="/lists">
      <Button size="sm" variant="outline">
        Share
      </Button>
      <Button size="sm">Add a title</Button>
    </PageHeader>
  );
}

export function WithSubheader() {
  return (
    <PageHeader
      title="Weekend Watchlist"
      backLinkHref="/lists"
      subheaderSlot={
        <p className="text-sm text-gray-400">
          Shared with Ana and Marcus · 12 titles
        </p>
      }
    >
      <Button size="sm" variant="ghost">
        Settings
      </Button>
    </PageHeader>
  );
}
