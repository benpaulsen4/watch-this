import { SearchInput } from "watch-this";

export function Default() {
  return (
    <div className="max-w-md">
      <SearchInput placeholder="Search films and TV" />
    </div>
  );
}

export function WithQuery() {
  return (
    <div className="max-w-md">
      <SearchInput defaultValue="dune" placeholder="Search films and TV" />
    </div>
  );
}

export function Loading() {
  return (
    <div className="max-w-md">
      <SearchInput defaultValue="severance" loading />
    </div>
  );
}
