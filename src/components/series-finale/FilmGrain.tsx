/**
 * The mock's drifting film grain, laid over whatever fills the nearest
 * positioned ancestor. Decorative, and still for anyone who prefers reduced
 * motion. The recap's hero and the story both use it; a parent that must not
 * be widened by the drift clips it.
 */
export function FilmGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:3px_3px] opacity-30 motion-safe:animate-[wt-grain_7s_steps(10)_infinite]"
    />
  );
}
