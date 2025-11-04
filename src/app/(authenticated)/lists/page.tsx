import ListsClient from "@/components/lists/ListsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { getListsResponse } from "@/lib/lists/list-utils";
import { cookies } from "next/headers";

export default async function ListsPage() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return null;

  const listsWithPosters = await getListsResponse(user.id);

  return <ListsClient initialLists={listsWithPosters} />;
}
