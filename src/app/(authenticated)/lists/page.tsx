import { cookies } from "next/headers";

import ListsClient from "@/components/lists/ListsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { listLists } from "@/lib/lists/service";

export default async function ListsPage() {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  const listsWithPosters = await listLists(user.id);

  return <ListsClient initialLists={listsWithPosters} />;
}
