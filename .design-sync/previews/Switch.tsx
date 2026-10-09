import { Switch } from "watch-this";

export function Default() {
  return (
    <div className="space-y-5">
      <Switch label="Email me about new episodes" defaultSelected />
      <Switch label="Show adult content" />
      <Switch
        label="Public profile"
        helperText="Anyone with your username can see your lists."
        defaultSelected
      />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="space-y-5">
      <Switch size="sm" label="Small" defaultSelected />
      <Switch size="default" label="Default" defaultSelected />
      <Switch size="lg" label="Large" defaultSelected />
    </div>
  );
}

export function Variants() {
  return (
    <div className="space-y-5">
      <Switch variant="default" label="Default" defaultSelected />
      <Switch variant="success" label="Success" defaultSelected />
      <Switch variant="error" label="Error" error="Verify your email first." />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="space-y-5">
      <Switch label="Disabled, off" isDisabled />
      <Switch label="Disabled, on" isDisabled defaultSelected />
    </div>
  );
}
