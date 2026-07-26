import ListsClient from "@/components/lists/ListsClient";
import { listLists } from "@/lib/lists/service";

import { requireUser } from "../requireUser";

export default async function ListsPage() {
  const user = await requireUser("/lists");

  const listsWithPosters = await listLists(user.id);

  return <ListsClient initialLists={listsWithPosters} />;
}
