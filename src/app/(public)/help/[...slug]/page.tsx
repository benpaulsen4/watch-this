import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/help/Markdown";
import { getHelpDocBySlug, getHelpStaticSlugs } from "@/lib/help/service";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getHelpStaticSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pathname = `/help/${slug.map(encodeURIComponent).join("/")}`;
  try {
    const doc = await getHelpDocBySlug(slug);
    const title = `${doc.meta.title} | Help Center`;
    return {
      title,
      description: doc.meta.description,
      alternates: {
        canonical: pathname,
      },
      openGraph: {
        title,
        description: doc.meta.description,
        url: pathname,
        siteName: "WatchThis",
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: doc.meta.description,
      },
    };
  } catch {
    return {
      title: "Help Center",
    };
  }
}

export default async function HelpDocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;

  let doc;
  try {
    doc = await getHelpDocBySlug(slug);
  } catch {
    notFound();
  }

  const pathname = `/help/${slug.map(encodeURIComponent).join("/")}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: getSiteUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Help Center",
            item: getSiteUrl("/help"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: doc.meta.title,
            item: getSiteUrl(pathname),
          },
        ],
      },
      {
        "@type": "TechArticle",
        headline: doc.meta.title,
        description: doc.meta.description,
        url: getSiteUrl(pathname),
        isPartOf: {
          "@type": "WebSite",
          name: "WatchThis",
          url: getSiteUrl("/"),
        },
        dateModified: doc.meta.lastUpdated,
      },
    ],
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
