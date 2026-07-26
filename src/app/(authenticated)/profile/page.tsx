import { ProfileClient } from "@/components/profile/ProfileClient";

import { requireUser, toClientUser } from "../requireUser";

export default async function ProfilePage() {
  // The resolved user is handed down as a prop rather than discarded. Without
  // it ProfileClient renders nothing until the auth context finishes its own
  // `GET /api/auth/session`, which repeats the lookup this page just did and
  // puts a full-screen spinner in front of an already-rendered page (UI-07).
  const user = await requireUser("/profile");

  return <ProfileClient initialUser={toClientUser(user)} />;
}
