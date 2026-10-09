import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "watch-this";

export function InCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Dune: Part Two</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="genre">Sci-Fi</Badge>
          <Badge variant="rating">★ 8.4</Badge>
          <Badge variant="year">2024</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function WithText() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Up next</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-300">
          Season 2, Episode 4 — &ldquo;The Long Way Round&rdquo;. Airs Thursday
          on your local schedule.
        </p>
      </CardContent>
    </Card>
  );
}
