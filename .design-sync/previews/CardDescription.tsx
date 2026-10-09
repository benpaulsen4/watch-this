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

export function Multiline() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Season finales</CardTitle>
        <CardDescription>
          Titles whose current season ends this month. Updated nightly from
          TMDB, so episode counts may lag a day behind broadcast.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
