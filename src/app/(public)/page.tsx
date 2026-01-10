import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/webauthn";

export default async function Home() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (user === null) return redirect("/auth");

  return redirect("/dashboard");
}
