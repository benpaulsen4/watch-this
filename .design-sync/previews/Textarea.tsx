import { Textarea } from "watch-this";

export function Default() {
  return (
    <div className="max-w-sm">
      <Textarea
        label="List description"
        size="textarea"
        rows={4}
        placeholder="What's this list for?"
        helperText="Shown to anyone you invite."
      />
    </div>
  );
}

export function Filled() {
  return (
    <div className="max-w-sm">
      <Textarea
        label="Notes"
        size="textarea"
        rows={4}
        defaultValue={
          "Start with season 2 — season 1 is skippable apart from the finale."
        }
      />
    </div>
  );
}

export function WithError() {
  return (
    <div className="max-w-sm">
      <Textarea
        label="List description"
        size="textarea"
        rows={3}
        defaultValue={
          "Everything we keep meaning to get round to: the prestige dramas we " +
          "bailed on halfway, the films Marcus swears are essential, and the " +
          "comfort rewatches nobody needs to justify. Sorted roughly by how " +
          "likely we are to actually finish them."
        }
        error="Descriptions are limited to 200 characters."
      />
    </div>
  );
}
