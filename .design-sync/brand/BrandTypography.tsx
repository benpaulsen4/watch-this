const SCALE = [
  ["text-3xl", "font-bold", "Page title", "1.875rem / 30px"],
  ["text-2xl", "font-semibold", "Modal + section heading", "1.5rem / 24px"],
  ["text-xl", "font-bold", "Card heading, PageHeader title", "1.25rem / 20px"],
  ["text-lg", "font-semibold", "Sub-heading, large button", "1.125rem / 18px"],
  ["text-base", "font-normal", "Input text, long-form body", "1rem / 16px"],
  ["text-sm", "font-medium", "Default UI text — the workhorse", "0.875rem / 14px"],
  ["text-xs", "font-medium", "Badges, metadata, helper text", "0.75rem / 12px"],
] as const;

/**
 * Typography: Geist across the board, in a deliberately narrow scale.
 *
 * Geist ships with the design system as five woff2 subsets (variable weight
 * 100–900) with a metric-matched Arial fallback, so text does not reflow while
 * it loads. `--font-geist-sans` is the family variable.
 *
 * Reference card. In product screens use the Tailwind classes shown.
 *
 * @category Brand
 */
export function BrandTypography() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-white">Geist</h3>
        <p className="text-xs text-gray-400">
          --font-geist-sans · variable 100–900 · fallback &quot;Geist Fallback&quot;
          (metric-matched Arial)
        </p>
        <p className="mt-3 text-2xl text-gray-100">
          ABCDEFGHIJKLM abcdefghijklm 0123456789
        </p>
      </div>

      <div className="space-y-5">
        {SCALE.map(([size, weight, role, px]) => (
          <div
            key={size}
            className="flex flex-col gap-1 border-b border-gray-800 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <span className={`${size} ${weight} text-gray-100`}>
              Never argue about what to watch
            </span>
            <span className="shrink-0 text-right">
              <span className="font-mono text-xs text-gray-300">
                {size} {weight}
              </span>
              <span className="block text-xs text-gray-500">{px}</span>
              <span className="block text-xs text-gray-400">{role}</span>
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">Weights in use</h3>
        <div className="flex flex-wrap gap-6">
          <span className="font-normal text-gray-100">font-normal</span>
          <span className="font-medium text-gray-100">font-medium</span>
          <span className="font-semibold text-gray-100">font-semibold</span>
          <span className="font-bold text-gray-100">font-bold</span>
        </div>
      </div>
    </div>
  );
}
