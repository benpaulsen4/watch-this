import { getCurrentUser } from "@/lib/auth/webauthn";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return redirect("/auth");

  return redirect("/dashboard");
}
