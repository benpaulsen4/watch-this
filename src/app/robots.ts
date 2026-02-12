import type { MetadataRoute } from "next";

import { getSiteOrigin, getSiteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/help/"],
        disallow: [
          "/api/",
          "/auth",
          "/auth/",
          "/dashboard",
          "/lists",
          "/profile",
        ],
      },
    ],
    sitemap: getSiteUrl("/sitemap.xml"),
    host: getSiteOrigin(),
  };
}
