import { Dropdown } from "watch-this";

const STATUS_OPTIONS = [
  { key: "watching", label: "Watching" },
  { key: "completed", label: "Completed" },
  { key: "planning", label: "Plan to watch" },
  { key: "paused", label: "Paused" },
  { key: "dropped", label: "Dropped" },
];

const SORT_OPTIONS = [
  { key: "recent", label: "Recently added" },
  { key: "title", label: "Title A–Z" },
  { key: "rating", label: "Rating" },
  { key: "release", label: "Release date" },
];

export function Default() {
  return (
    <div className="max-w-xs space-y-5">
      <Dropdown
        label="Watch status"
        options={STATUS_OPTIONS}
        selectedKey="watching"
      />
      <Dropdown
        label="Sort by"
        options={SORT_OPTIONS}
        placeholder=""
      />
    </div>
  );
}

export function Validation() {
  return (
    <div className="max-w-xs space-y-5">
      <Dropdown
        label="Watch status"
        options={STATUS_OPTIONS}
        selectedKey="completed"
        helperText="Used to work out what to show you next."
      />
      <Dropdown
        label="Watch status"
        options={STATUS_OPTIONS}
        placeholder=""
        error="Pick a status before saving."
      />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="max-w-xs space-y-5">
      <Dropdown size="sm" label="Small" options={SORT_OPTIONS} selectedKey="recent" />
      <Dropdown size="default" label="Default" options={SORT_OPTIONS} selectedKey="recent" />
      <Dropdown size="lg" label="Large" options={SORT_OPTIONS} selectedKey="recent" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="max-w-xs">
      <Dropdown
        label="Watch status"
        options={STATUS_OPTIONS}
        selectedKey="planning"
        isDisabled
      />
    </div>
  );
}
