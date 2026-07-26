// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

// SUPPLY-01. These headers are the app's only clickjacking and transport
// defence, and next.config.ts is a file people edit for unrelated reasons
// (adding an image host, a rewrite). The point of this test is that deleting a
// directive has to be deliberate.
//
// The distinction worth protecting: `frame-ancestors` is inert in a
// Report-Only header -- it reports and does not block. So it must stay in the
// *enforced* policy. The resource directives are the ones allowed to be
// report-only while the policy is being proven against a real deploy.

async function headersFor(path: string) {
  const groups = await nextConfig.headers!();
  const entries = groups
    .filter((g) => new RegExp(`^${g.source.replace(/\/:path\*$/, "(/.*)?")}$`).test(path))
    .flatMap((g) => g.headers);
  return new Map(entries.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("enforces frame-ancestors 'none' rather than only reporting it", async () => {
    const headers = await headersFor("/auth/register");
    const enforced = headers.get("Content-Security-Policy");
    expect(enforced).toContain("frame-ancestors 'none'");
    // Belt and braces for pre-CSP3 browsers.
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps the resource directives out of the enforced policy", async () => {
    const headers = await headersFor("/");
    const enforced = headers.get("Content-Security-Policy")!;
    for (const directive of ["script-src", "style-src", "img-src", "default-src"]) {
      expect(enforced).not.toContain(directive);
    }
    expect(headers.get("Content-Security-Policy-Report-Only")).toContain(
      "script-src",
    );
  });

  it("allows the hosts and schemes the app actually loads from", async () => {
    const reportOnly = (await headersFor("/")).get(
      "Content-Security-Policy-Report-Only",
    )!;
    // next/image falls back to the origin for non-optimized TMDB images, the
    // claim QR code is a data: URL, and Vercel's analytics scripts are loaded
    // same-origin in production.
    expect(reportOnly).toContain("https://image.tmdb.org");
    expect(reportOnly).toMatch(/img-src [^;]*\bdata:/);
    expect(reportOnly).toMatch(/script-src [^;]*'self'/);
  });

  it("sets the remaining baseline headers on every path", async () => {
    const headers = await headersFor("/api/lists");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Strict-Transport-Security")).toMatch(
      /^max-age=\d+; includeSubDomains$/,
    );
  });
});
