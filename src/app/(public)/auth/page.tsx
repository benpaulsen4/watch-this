import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AuthPageClient from "@/components/auth/AuthPageClient";
import { getCurrentUser } from "@/lib/auth/webauthn";

function safeRedirectTarget(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value[0]
        : undefined;
  if (!raw) return "/dashboard";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/dashboard";
  return decoded;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await cookies()).get("session")?.value;
  const user = await getCurrentUser(session);

  if (user !== null) {
    const target = safeRedirectTarget((await searchParams)?.redirect);
    return redirect(target);
  }

  return <AuthPageClient />;
}
