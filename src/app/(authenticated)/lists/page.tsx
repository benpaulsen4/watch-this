import ListsClient from "@/components/lists/ListsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { listLists } from "@/lib/lists/service";
import { cookies } from "next/headers";

export default async function ListsPage() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return "debug message";

  const listsWithPosters = await listLists(user.id);

  return <ListsClient initialLists={listsWithPosters} />;
}
