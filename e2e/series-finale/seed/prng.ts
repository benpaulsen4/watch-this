// Seeded randomness for the history generator. `Math.random` is never used:
// the same persona must produce the same rows on every run, so the oracle and
// the screenshots describe the same data.

/** mulberry32: a small, fast 32-bit PRNG. Returns draws in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit seed per persona and year (FNV-1a over "username:year"). */
export function seedFrom(username: string, year: number): number {
  let hash = 0x811c9dc5;
  for (const char of `${username}:${year}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
