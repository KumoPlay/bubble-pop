/**
 * Gentle surprises. Pops are counted quietly; every so often a new cosmetic is
 * found. The gaps between surprises grow (first after about 30 pops, later a
 * few hundred), with a little randomness so they never feel like a schedule.
 * There are no numbers on screen, no streaks and no daily rewards.
 */
import { splitKey, type CosmeticKind, type UnlockRules } from '../../content';
import { mixSeed, pickOne, type Rng } from '../rng';
import type { SaveState, ToyId } from './state';

/** Pops between surprise number k and the one before it (k = 0 is the first surprise). */
export function popsBetween(k: number, pace: UnlockRules['pace']): number {
  const base = Math.min(pace.most, pace.first + pace.step * k);
  // The same little wobble for everyone, so a reload never changes when the next surprise comes.
  const u = mixSeed(k, 0xb0bb1e) / 2 ** 32;
  return Math.max(1, Math.round(base * (1 + pace.jitter * (2 * u - 1))));
}

/** Total pops needed for the first `n` surprises. */
export function popsFor(n: number, pace: UnlockRules['pace']): number {
  let total = 0;
  for (let k = 0; k < n; k += 1) total += popsBetween(k, pace);
  return total;
}

/** Cosmetics that come as surprises (not starters, not golden-only). */
export function surprisePool(rules: UnlockRules, existing: readonly string[]): string[] {
  return existing.filter((key) => !rules.starters.includes(key) && !rules.goldenOnly.includes(key));
}

/** How many surprises the player has had (found cosmetics from the surprise pool). */
export function surprisesFound(state: SaveState, rules: UnlockRules, existing: readonly string[]): number {
  return surprisePool(rules, existing).filter((key) => state.unlocked.includes(key)).length;
}

/** Surprise cosmetics still to find. */
export function surprisesLeft(state: SaveState, rules: UnlockRules, existing: readonly string[]): string[] {
  return surprisePool(rules, existing).filter((key) => !state.unlocked.includes(key));
}

/** True when enough pops have been counted for the next surprise. */
export function surpriseDue(state: SaveState, rules: UnlockRules, existing: readonly string[]): boolean {
  if (surprisesLeft(state, rules, existing).length === 0) return false;
  return state.pops >= popsFor(surprisesFound(state, rules, existing) + 1, rules.pace);
}

const TOY_KINDS: Record<ToyId, readonly CosmeticKind[]> = {
  wrap: ['wrap-color', 'wrap-pattern'],
  soap: ['wand'],
  cloud: ['face', 'hat'],
};

export function toyOfKind(kind: CosmeticKind): ToyId {
  return (Object.keys(TOY_KINDS) as ToyId[]).find((toy) => TOY_KINDS[toy].includes(kind))!;
}

/** Picks a surprise, preferring one for the toy being played. Null when there is nothing left. */
export function pickSurprise(left: readonly string[], toy: ToyId, rng: Rng): string | null {
  if (left.length === 0) return null;
  const forToy = left.filter((key) => {
    const parts = splitKey(key);
    return parts !== null && TOY_KINDS[toy].includes(parts.kind);
  });
  return pickOne(rng, forToy.length > 0 ? forToy : left);
}

/** Golden-only cosmetics still to find. */
export function goldenLeft(state: SaveState, rules: UnlockRules, existing: readonly string[]): string[] {
  return rules.goldenOnly.filter((key) => existing.includes(key) && !state.unlocked.includes(key));
}

/** Adds a cosmetic to the collection (with a "new" dot). False if it was already there. */
export function unlock(state: SaveState, key: string): boolean {
  if (state.unlocked.includes(key)) return false;
  state.unlocked.push(key);
  if (!state.fresh.includes(key)) state.fresh.push(key);
  return true;
}
