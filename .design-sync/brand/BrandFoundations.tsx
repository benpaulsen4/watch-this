const RADII = [
  ["rounded-md", "Small controls, inline code", "0.375rem"],
  ["rounded-lg", "Buttons, inputs, cards, poster art", "0.5rem"],
  ["rounded-xl", "Card, modal", "0.75rem"],
  ["rounded-full", "Badges, avatars, switch tracks", "9999px"],
] as const;

const SPACING = [
  ["gap-2 / p-2", "0.5rem", "Between badges and inline chips"],
  ["gap-3 / p-3", "0.75rem", "Between buttons in a row"],
  ["gap-4 / p-4", "1rem", "Card size=\"sm\", grid gutters"],
  ["gap-6 / p-6", "1.5rem", "Card default padding"],
  ["gap-8 / p-8", "2rem", "Card size=\"lg\", page padding"],
] as const;

/**
 * Shape, spacing and elevation — the structural half of the design language.
 *
 * Radii and spacing both come from Tailwind's default scale; what matters is
 * which steps this system actually uses. Elevation is expressed as tinted
 * shadows rather than lighter surfaces, because everything sits on a dark
 * background.
 *
 * Reference card.
 *
 * @category Brand
 */
export function BrandFoundations() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Radius</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {RADII.map(([cls, role, px]) => (
            <div key={cls} className="flex items-center gap-3">
              <div
                className={`h-12 w-12 shrink-0 border border-gray-600 bg-gray-800 ${cls}`}
              />
              <div>
                <div className="font-mono text-xs text-gray-300">{cls}</div>
                <div className="text-xs text-gray-500">{px}</div>
                <div className="text-xs text-gray-400">{role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Spacing</h3>
        <div className="space-y-3">
          {SPACING.map(([cls, px, role]) => (
            <div key={cls} className="flex items-center gap-4">
              <div className="flex h-6 w-24 shrink-0 items-center">
                <div
                  className="h-3 rounded-sm bg-red-600"
                  style={{ width: px }}
                />
              </div>
              <div className="font-mono text-xs text-gray-300">{cls}</div>
              <div className="text-xs text-gray-400">{role}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Elevation</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 shadow-lg shadow-black/20">
            <div className="font-mono text-xs text-gray-300">shadow-lg</div>
            <div className="text-xs text-gray-400">Solid card</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 shadow-xl shadow-black/25 backdrop-blur-sm">
            <div className="font-mono text-xs text-gray-300">shadow-xl</div>
            <div className="text-xs text-gray-400">Default card</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 shadow-lg shadow-red-500/25">
            <div className="font-mono text-xs text-gray-300">
              shadow-red-500/25
            </div>
            <div className="text-xs text-gray-400">Accent glow</div>
          </div>
        </div>
      </section>
    </div>
  );
}
