function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) return "http://localhost:3000";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function getSiteOrigin(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.WEBAUTHN_ORIGIN;
  if (explicit) return normalizeOrigin(explicit);

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export function getSiteUrl(pathname: string = "/"): string {
  return new URL(pathname, getSiteOrigin()).toString();
}

export function getMetadataBase(): URL {
  return new URL(getSiteOrigin());
}
