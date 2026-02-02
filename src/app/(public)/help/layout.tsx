import { HelpNavClient } from "@/components/help/HelpNavClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { getHelpNavTree } from "@/lib/help/service";

export const dynamic = "force-static";
export const revalidate = false;

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav = await getHelpNavTree();

  return (
    <div className="min-h-screen">
      <PageHeader title="Help Center" backLinkHref="/" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8">
          <aside className="md:sticky md:top-24 h-fit rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <HelpNavClient nav={nav} />
          </aside>
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </div>
  );
}
