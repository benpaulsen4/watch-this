import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/help/Markdown";
import { getHelpDocBySlug, getHelpStaticSlugs } from "@/lib/help/service";

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
  try {
    const doc = await getHelpDocBySlug(slug);
    return {
      title: `${doc.meta.title} | Help Center`,
      description: doc.meta.description,
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
