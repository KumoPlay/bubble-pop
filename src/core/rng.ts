/** A random number in [0, 1). Seeded generators make tests and sheets repeatable. */
export type Rng = () => number;

/** Small, fast seeded generator (mulberry32). The same seed always gives the same numbers. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between min and max. */
export function between(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** A number from a [min, max] range. */
export function inRange(rng: Rng, range: readonly [number, number]): number {
  return between(rng, range[0], range[1]);
}

/** One item from a list. The list must not be empty. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickOne: empty list');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Mixes two whole numbers into a new seed, for things like "bubble 12 of sheet 3". */
export function mixSeed(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}
