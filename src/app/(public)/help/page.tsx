import type { Metadata } from "next";

import { Markdown } from "@/components/help/Markdown";
import { getHelpDocBySlug } from "@/lib/help/service";

export const dynamic = "force-static";
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getHelpDocBySlug([]);
  return {
    title: doc.meta.title ? `${doc.meta.title} | Help Center` : "Help Center",
    description: doc.meta.description,
  };
}

export default async function HelpCenterPage() {
  const doc = await getHelpDocBySlug([]);

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
