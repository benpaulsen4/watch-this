import { Card, CardDescription, CardHeader, CardTitle } from "watch-this";

export function InCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Weekend Watchlist</CardTitle>
        <CardDescription>Shared with Ana and Marcus</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function LongTitle() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>
          Everything we said we&apos;d watch and never did
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
