import ListDetailsClient from "@/components/lists/ListDetailsClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { cookies } from "next/headers";
import { getList } from "@/lib/lists/service";
import { notFound } from "next/navigation";

interface ListDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ListDetailsPage({
  params,
}: ListDetailsPageProps) {
  const { id } = await params;

  const resolvedCookies = await cookies();
  const sessionCookie = resolvedCookies.get("session");
  const user = await getCurrentUser(sessionCookie?.value);

  if (user === null) return "Refresh if this page does not go away";

  const list = await getList(user.id, id);

  if (list === "notFound") return notFound();

  return <ListDetailsClient initialList={list} />;
}
