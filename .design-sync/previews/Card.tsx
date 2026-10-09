import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "watch-this";

export function Composed() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Weekend Watchlist</CardTitle>
        <CardDescription>
          Shared with Ana and Marcus · 12 titles
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="genre">Sci-Fi</Badge>
          <Badge variant="rating">★ 8.4</Badge>
          <Badge variant="year">2024</Badge>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Open list</Button>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Variants() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["default", "entertainment", "glass", "solid", "outline"] as const).map(
        (variant) => (
          <Card key={variant} variant={variant} size="sm">
            <CardTitle className="text-base">{variant}</CardTitle>
            <CardDescription>Surface treatment</CardDescription>
          </Card>
        ),
      )}
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-col gap-4">
      {(["sm", "default", "lg"] as const).map((size) => (
        <Card key={size} size={size}>
          <CardTitle className="text-base">Padding: {size}</CardTitle>
        </Card>
      ))}
    </div>
  );
}
