import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "watch-this";

export function InCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Weekend Watchlist</CardTitle>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button size="sm">Open list</Button>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SpaceBetween() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Invite expiring</CardTitle>
      </CardHeader>
      <CardFooter className="justify-between">
        <span className="text-xs text-gray-400">Expires in 3 days</span>
        <Button size="sm" variant="ghost">
          Reset link
        </Button>
      </CardFooter>
    </Card>
  );
}
