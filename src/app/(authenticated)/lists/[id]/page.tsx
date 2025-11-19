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

  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return null;

  const list = await getList(user.id, id);

  if (list === "notFound") return notFound();

  return <ListDetailsClient initialList={list} />;
}
