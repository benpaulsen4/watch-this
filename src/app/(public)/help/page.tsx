import type { Metadata } from "next";

import { Markdown } from "@/components/help/Markdown";
import { getHelpDocBySlug } from "@/lib/help/service";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-static";
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getHelpDocBySlug([]);
  const title = doc.meta.title
    ? `${doc.meta.title} | Help Center`
    : "Help Center";
  const description = doc.meta.description;
  return {
    title,
    description,
    alternates: {
      canonical: "/help",
    },
    openGraph: {
      title,
      description,
      url: "/help",
      siteName: "WatchThis",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function HelpCenterPage() {
  const doc = await getHelpDocBySlug([]);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: doc.meta.title,
    description: doc.meta.description,
    url: getSiteUrl("/help"),
    isPartOf: {
      "@type": "WebSite",
      name: "WatchThis",
      url: getSiteUrl("/"),
    },
  };

  const lastUpdatedLabel = (() => {
    if (!doc.meta.lastUpdated) return undefined;
    const date = new Date(doc.meta.lastUpdated);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  })();

  return (
    <article className="min-w-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {doc.meta.title}
        </h1>
        {doc.meta.description && (
          <p className="mt-2 text-gray-300">{doc.meta.description}</p>
        )}
        {lastUpdatedLabel && (
          <p className="mt-2 text-sm text-gray-400">
            Last updated {lastUpdatedLabel}
          </p>
        )}
      </div>
      <Markdown markdown={doc.markdown} />
    </article>
  );
}
