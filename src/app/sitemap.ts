import type { MetadataRoute } from "next";

import { getHelpDocBySlug, getHelpStaticSlugs } from "@/lib/help/service";
import { getSiteUrl } from "@/lib/seo/site";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const helpSlugs = await getHelpStaticSlugs();

  const helpPages = await Promise.all(
    helpSlugs.map(async (slug) => {
      const pathname = `/help/${slug.map(encodeURIComponent).join("/")}`;

      try {
        const doc = await getHelpDocBySlug(slug);
        if (doc.meta.lastUpdated) {
          const date = new Date(doc.meta.lastUpdated);
          if (!Number.isNaN(date.getTime())) {
            return {
              url: getSiteUrl(pathname),
              lastModified: date,
              changeFrequency: "monthly" as const,
              priority: 0.6,
            };
          }
        }
      } catch {}

      return {
        url: getSiteUrl(pathname),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      };
    }),
  );

  return [
    {
      url: getSiteUrl("/"),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: getSiteUrl("/help"),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    ...helpPages,
  ];
}
