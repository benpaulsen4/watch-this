import { Input } from "watch-this";

export function WithLabels() {
  return (
    <div className="max-w-sm space-y-5">
      <Input label="List name" placeholder="Weekend Watchlist" />
      <Input
        label="Invite by username"
        placeholder="ana_watches"
        helperText="They'll get an invite the next time they sign in."
      />
    </div>
  );
}

export function Validation() {
  return (
    <div className="max-w-sm space-y-5">
      <Input
        label="Username"
        defaultValue="marcus"
        variant="success"
        helperText="That username is available."
      />
      <Input
        label="Username"
        defaultValue="ana watches"
        error="Usernames can't contain spaces."
      />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="max-w-sm space-y-4">
      <Input size="sm" placeholder="Small" />
      <Input size="default" placeholder="Default" />
      <Input size="lg" placeholder="Large" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="max-w-sm">
      <Input label="Email" defaultValue="ben@example.com" disabled />
    </div>
  );
}
