import type { NextConfig } from "next";

// SUPPLY-01. The app shipped with no security headers at all. `src/middleware.ts`
// exists but its matcher is scoped to /api/auth/* and /api/admin/* for rate
// limiting, so it is the wrong place for site-wide headers -- these belong here,
// where they apply to every response including static assets and /_next/image.

// Directives that cannot break rendering, so they are safe to *enforce* on day
// one. frame-ancestors is the whole point of this change: a registration or
// authentication ceremony rendered inside an attacker's frame is a real
// clickjacking target for a passkey app, and `frame-ancestors` in a
// Report-Only header would only report it, never block it. So it is enforced
// here while the resource directives below ride along in report-only.
const ENFORCED_CSP = [
  // No framing, by anyone. X-Frame-Options: DENY below says the same thing for
  // browsers that predate frame-ancestors.
  "frame-ancestors 'none'",
  // A <base> tag injected into any rendered markup could otherwise repoint
  // every relative URL on the page, including the WebAuthn API calls.
  "base-uri 'self'",
  // Nothing in this app uses <object>/<embed>, so deny the whole legacy plugin
  // surface rather than leave it as an injection sink.
  "object-src 'none'",
  // Every form in the app posts to its own API routes.
  "form-action 'self'",
].join("; ");

// The resource-loading half of the policy, shipped REPORT-ONLY on purpose. It
// is written to be correct as far as we can determine statically, but a CSP
// that is wrong about one third-party host takes the whole app down, and there
// is no way to prove it complete from source alone. Report-only lets a real
// deploy tell us what we missed before it is enforced.
//
// FOLLOW-UP: fold these into ENFORCED_CSP above once they are known to be
// complete. Note there is deliberately no `report-to`/`report-uri` and no
// collection endpoint, so "known to be complete" means someone walking the app
// with the browser console open -- violations surface there and nowhere else.
// Adding a reporting endpoint would make this self-verifying; until then the
// report-only half is a safety net for manual checking, not a signal that
// arrives on its own.
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is required, not lazy: Next injects its own inline
  // bootstrap and flight-data scripts into every page, and this app does not
  // run a nonce-generating middleware over all routes (the existing middleware
  // is scoped to two API prefixes). va.vercel-scripts.com is the host
  // @vercel/analytics and @vercel/speed-insights fall back to in debug/dev
  // mode; in production both load same-origin from /_vercel/*/script.js.
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  // Next and Tailwind both emit inline <style> blocks during hydration.
  "style-src 'self' 'unsafe-inline'",
  // image.tmdb.org matches images.remotePatterns below, for the cases that
  // bypass the /_next/image optimizer. data: is for the QR codes the device
  // claim flow renders via qrcode.toDataURL(); blob: for client-side object
  // URLs in the import/export flow.
  "img-src 'self' data: blob: https://image.tmdb.org",
  "font-src 'self' data:",
  // Vercel's analytics and speed-insights beacons are same-origin rewrites
  // (/_vercel/insights/event, /_vercel/speed-insights/vitals), and every other
  // fetch in the app targets its own /api routes. TMDB and JustWatch are called
  // server-side only, so they do not belong here.
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "media-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("https://image.tmdb.org/**")],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: ENFORCED_CSP },
          {
            key: "Content-Security-Policy-Report-Only",
            value: REPORT_ONLY_CSP,
          },
          // Browsers ignore HSTS delivered over plain HTTP, so this is inert on
          // localhost and only binds on the real HTTPS deployment. `preload` is
          // deliberately omitted: submitting to the preload list is effectively
          // irreversible and is the site owner's call, not a config default.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
