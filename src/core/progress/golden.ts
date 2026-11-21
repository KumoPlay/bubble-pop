/**
 * The golden bubble with a tiny Kumo inside. It is rare and never planned:
 * never in the first minute and a half of play, about once every six minutes
 * of play after that, and never twice within three minutes. Only time spent
 * actually playing counts; a toy left open on the table does not.
 */
import type { UnlockRules } from '../../content';

export interface GoldenClock {
  /** Seconds of play so far in this visit. */
  played: number;
  /** `played` when the last golden bubble came by. */
  lastShown: number;
}

/** A pause longer than this between touches is a break, not play. */
export const MAX_COUNTED_GAP_S = 3;

export function newGoldenClock(): GoldenClock {
  return { played: 0, lastShown: Number.NEGATIVE_INFINITY };
}

/**
 * Counts play time on a touch, `sinceLastTouch` seconds after the one before.
 * Returns the seconds added.
 */
export function notePlay(clock: GoldenClock, sinceLastTouch: number): number {
  const added = Math.min(Math.max(0, sinceLastTouch), MAX_COUNTED_GAP_S);
  clock.played += added;
  return added;
}

/**
 * Should a golden bubble come by now? `added` is the play time just counted and
 * `roll` a random number in [0, 1). When everything golden has been found it still
 * comes, half as often, just for the smile.
 */
export function goldenNow(
  clock: GoldenClock,
  rules: UnlockRules['golden'],
  added: number,
  roll: number,
  allFound: boolean,
): boolean {
  if (clock.played < rules.notBefore) return false;
  if (clock.played - clock.lastShown < rules.gap) return false;
  // After the quiet gap it is equally likely at any moment, so on average it comes every `every` seconds.
  const wait = Math.max(1, rules.every - rules.gap) * (allFound ? 2 : 1);
  if (roll >= added / wait) return false;
  clock.lastShown = clock.played;
  return true;
}
