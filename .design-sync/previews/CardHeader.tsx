import { Card, CardDescription, CardHeader, CardTitle } from "watch-this";

export function InCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Weekend Watchlist</CardTitle>
        <CardDescription>Shared with Ana and Marcus · 12 titles</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function TitleOnly() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Continue watching</CardTitle>
      </CardHeader>
    </Card>
  );
}
