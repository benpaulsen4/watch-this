const SURFACES = [
  ["--wt-surface-page", "bg-gray-950", "Page background"],
  ["--wt-surface-raised", "bg-gray-900", "Header, modal, raised panel"],
  ["--wt-surface-card", "bg-gray-800", "Card, popover"],
  ["--wt-surface-input", "bg-gray-700", "Input, switch track"],
] as const;

const TEXT = [
  ["--wt-text-heading", "text-white", "Headings"],
  ["--wt-text-body", "text-gray-100", "Body copy"],
  ["--wt-text-secondary", "text-gray-300", "Secondary copy"],
  ["--wt-text-muted", "text-gray-400", "Metadata, captions"],
  ["--wt-text-placeholder", "text-gray-500", "Placeholders"],
] as const;

const SEMANTIC = [
  ["--wt-accent", "bg-red-600", "Brand accent, primary action"],
  ["--wt-success", "bg-green-600", "Success · Watching"],
  ["--wt-info", "bg-blue-600", "Info · Completed"],
  ["--wt-warning", "bg-yellow-600", "Warning · Plan to watch"],
  ["--wt-paused", "bg-orange-600", "Paused"],
  ["--wt-danger", "bg-red-600", "Destructive · Dropped"],
] as const;

function Swatch({
  token,
  cls,
  role,
  text,
}: {
  token: string;
  cls: string;
  role: string;
  text?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-10 w-10 shrink-0 rounded-lg border border-gray-700 ${
          text ? "bg-gray-900 flex items-center justify-center" : cls
        }`}
      >
        {text && <span className={`text-base font-semibold ${cls}`}>Aa</span>}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-xs text-gray-300">{token}</div>
        <div className="font-mono text-xs text-gray-500">{cls}</div>
        <div className="text-xs text-gray-400">{role}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * The WatchThis colour system: dark surfaces, a red brand accent, and a
 * semantic set that maps 1:1 onto watch statuses.
 *
 * Reference card — read it, don't compose with it. Style product screens with
 * the Tailwind classes shown, or the `var(--wt-*)` tokens beside them.
 *
 * @category Brand
 */
export function BrandColors() {
  return (
    <div className="space-y-8">
      <Section title="Surfaces — darkest to lightest">
        {SURFACES.map(([t, c, r]) => (
          <Swatch key={t} token={t} cls={c} role={r} />
        ))}
      </Section>
      <Section title="Text">
        {TEXT.map(([t, c, r]) => (
          <Swatch key={t} token={t} cls={c} role={r} text />
        ))}
      </Section>
      <Section title="Accent & semantic">
        {SEMANTIC.map(([t, c, r]) => (
          <Swatch key={`${t}${r}`} token={t} cls={c} role={r} />
        ))}
      </Section>
      <Section title="Gradients">
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 shrink-0 rounded-lg bg-gradient-to-r from-red-600 to-orange-500" />
          <div>
            <div className="font-mono text-xs text-gray-300">
              --wt-gradient-primary
            </div>
            <div className="text-xs text-gray-400">Button variant=&quot;gradient&quot;</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 shrink-0 rounded-lg bg-gradient-to-r from-purple-600 via-red-500 to-orange-500" />
          <div>
            <div className="font-mono text-xs text-gray-300">
              --wt-gradient-entertainment
            </div>
            <div className="text-xs text-gray-400">
              Button variant=&quot;entertainment&quot;
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
