import ListsClient from "@/components/lists/ListsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { listLists } from "@/lib/lists/service";
import { cookies } from "next/headers";

export default async function ListsPage() {
  const resolvedCookies = await cookies();
  console.debug("cookies size: ", resolvedCookies.size);
  const sessionCookie = resolvedCookies.get("session");
  console.debug("session cookie: ", sessionCookie?.value);
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  const listsWithPosters = await listLists(user.id);

  return <ListsClient initialLists={listsWithPosters} />;
}
