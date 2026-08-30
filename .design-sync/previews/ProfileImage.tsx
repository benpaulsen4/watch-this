import { ProfileImage } from "watch-this";

export function Sizes() {
  return (
    <div className="flex items-end gap-5">
      <ProfileImage username="ana" size="sm" />
      <ProfileImage username="ana" size="md" />
      <ProfileImage username="ana" size="lg" />
      <ProfileImage username="ana" size="xl" />
    </div>
  );
}

export function Fallbacks() {
  return (
    <div className="flex items-center gap-4">
      {["ana", "ben", "marcus", "priya", "sam", "theo"].map((username) => (
        <div key={username} className="flex flex-col items-center gap-2">
          <ProfileImage username={username} size="lg" />
          <span className="text-xs text-gray-400">{username}</span>
        </div>
      ))}
    </div>
  );
}

export function InAList() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {["ana", "marcus", "priya"].map((username) => (
          <ProfileImage
            key={username}
            username={username}
            size="md"
            className="ring-2 ring-gray-950"
          />
        ))}
      </div>
      <span className="text-sm text-gray-400">3 collaborators</span>
    </div>
  );
}
