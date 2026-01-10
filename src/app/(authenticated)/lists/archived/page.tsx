import { cookies } from "next/headers";

import ListsClient from "@/components/lists/ListsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { listArchivedLists } from "@/lib/lists/service";

export default async function ArchivedListsPage() {
  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  const listsWithPosters = await listArchivedLists(user.id);

  return (
    <ListsClient
      initialLists={listsWithPosters}
      title="Archived Lists"
      isArchivedView={true}
    />
  );
}
