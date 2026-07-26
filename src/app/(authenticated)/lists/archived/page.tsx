import ListsClient from "@/components/lists/ListsClient";
import { listArchivedLists } from "@/lib/lists/service";

import { requireUser } from "../../requireUser";

export default async function ArchivedListsPage() {
  const user = await requireUser("/lists/archived");

  const listsWithPosters = await listArchivedLists(user.id);

  return (
    <ListsClient
      initialLists={listsWithPosters}
      title="Archived Lists"
      isArchivedView={true}
    />
  );
}
