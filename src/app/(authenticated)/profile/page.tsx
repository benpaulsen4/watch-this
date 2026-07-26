import { ProfileClient } from "@/components/profile/ProfileClient";

import { requireUser } from "../requireUser";

export default async function ProfilePage() {
  await requireUser("/profile");

  return <ProfileClient />;
}
