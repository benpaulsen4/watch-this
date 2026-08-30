import { Play, Plus } from "lucide-react";
import { Button } from "watch-this";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Add to list</Button>
      <Button variant="secondary">Change status</Button>
      <Button variant="outline">View details</Button>
      <Button variant="ghost">Dismiss</Button>
      <Button variant="destructive">Remove from list</Button>
      <Button variant="link">Browse trending</Button>
    </div>
  );
}

export function Emphasis() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="gradient">
        <Play className="mr-2 h-4 w-4" />
        Start watching
      </Button>
      <Button variant="entertainment">
        <Plus className="mr-2 h-4 w-4" />
        Create a shared list
      </Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra large</Button>
      <Button size="icon" aria-label="Add">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function States() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Default</Button>
      <Button loading>Saving</Button>
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
