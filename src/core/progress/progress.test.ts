import { describe, expect, it } from 'vitest';
import { content, cosmeticKeys, type UnlockRules } from '../../content';
import { makeRng } from '../rng';
import { goldenNow, newGoldenClock, notePlay } from './golden';
import { newSave, starterOf, usableChoices, unlockedOfKind } from './state';
import {
  goldenLeft,
  pickSurprise,
  popsBetween,
  popsFor,
  surpriseDue,
  surprisePool,
  surprisesFound,
  surprisesLeft,
  toyOfKind,
  unlock,
} from './unlocks';

const rules = content.unlocks;
const existing = cosmeticKeys;

describe('surprise pacing', () => {
  it('comes quickly at first, then further apart, never more than the most', () => {
    const { pace } = rules;
    expect(popsBetween(0, pace)).toBeGreaterThanOrEqual(Math.round(pace.first * (1 - pace.jitter)));
    expect(popsBetween(0, pace)).toBeLessThanOrEqual(Math.round(pace.first * (1 + pace.jitter)));
    for (let k = 0; k < 40; k += 1) expect(popsBetween(k, pace)).toBeLessThanOrEqual(pace.most * (1 + pace.jitter) + 1);
    // On average the gaps grow.
    const early = popsFor(5, pace) / 5;
    const late = (popsFor(25, pace) - popsFor(20, pace)) / 5;
    expect(late).toBeGreaterThan(early * 2);
  });

  it('is the same on every reload (no hidden state)', () => {
    expect(popsFor(12, rules.pace)).toBe(popsFor(12, rules.pace));
  });

  it('finds every surprise after a few thousand pops, not in the first session', () => {
    const all = popsFor(surprisePool(rules, existing).length, rules.pace);
    expect(all).toBeGreaterThan(3000);
    expect(all).toBeLessThan(9000);
  });

  it('says a surprise is due once enough pops are counted', () => {
    const state = newSave();
    state.pops = popsFor(1, rules.pace) - 1;
    expect(surpriseDue(state, rules, existing)).toBe(false);
    state.pops += 1;
    expect(surpriseDue(state, rules, existing)).toBe(true);
    // After finding one, the next needs more pops.
    unlock(state, surprisesLeft(state, rules, existing)[0]!);
    expect(surprisesFound(state, rules, existing)).toBe(1);
    expect(surpriseDue(state, rules, existing)).toBe(false);
  });

  it('stops when everything has been found', () => {
    const state = newSave();
    for (const key of surprisePool(rules, existing)) unlock(state, key);
    state.pops = 1_000_000;
    expect(surpriseDue(state, rules, existing)).toBe(false);
  });
});

describe('pickSurprise', () => {
  const left = surprisesLeft(newSave(), rules, existing);

  it('prefers something for the toy being played', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 50; i += 1) {
      expect(pickSurprise(left, 'soap', rng)).toMatch(/^wand\//);
      expect(pickSurprise(left, 'cloud', rng)).toMatch(/^(face|hat)\//);
      expect(pickSurprise(left, 'wrap', rng)).toMatch(/^wrap-/);
    }
  });

  it('falls back to anything when that toy has nothing left, and to nothing at the very end', () => {
    expect(pickSurprise(['hat/bow'], 'soap', makeRng(1))).toBe('hat/bow');
    expect(pickSurprise([], 'soap', makeRng(1))).toBeNull();
  });

  it('never gives a starter or a golden-only item', () => {
    const pool = surprisePool(rules, existing);
    for (const key of [...rules.starters, ...rules.goldenOnly]) expect(pool).not.toContain(key);
  });

  it('knows which toy each kind belongs to', () => {
    expect(toyOfKind('wrap-pattern')).toBe('wrap');
    expect(toyOfKind('wand')).toBe('soap');
    expect(toyOfKind('hat')).toBe('cloud');
  });
});

describe('unlocking and choosing', () => {
  it('adds a found cosmetic once, with a "new" dot', () => {
    const state = newSave();
    expect(unlock(state, 'wand/heart')).toBe(true);
    expect(unlock(state, 'wand/heart')).toBe(false);
    expect(state.unlocked.filter((k) => k === 'wand/heart')).toHaveLength(1);
    expect(state.fresh).toEqual(['wand/heart']);
  });

  it('uses starters for anything not found yet or gone after an update', () => {
    const state = newSave();
    state.chosen = { wrapColor: 'mint', wrapPattern: 'gone', wand: 'heart', face: 'nope', hat: 'beret' };
    unlock(state, 'hat/beret');
    unlock(state, 'wrap-pattern/gone');
    const usable = usableChoices(state, new Set(existing));
    expect(usable).toEqual({
      wrapColor: null,
      wrapPattern: null,
      wand: starterOf('wand'),
      face: starterOf('face'),
      hat: 'beret',
    });
  });

  it('lists found cosmetics of a kind in content order', () => {
    const state = newSave();
    unlock(state, 'wrap-color/mint');
    expect(unlockedOfKind(state, 'wrap-color', existing)).toEqual(['petal', 'sky', 'mint']);
  });

  it('starts golden items locked', () => {
    expect(goldenLeft(newSave(), rules, existing)).toEqual(rules.goldenOnly);
  });
});

describe('the golden bubble', () => {
  const golden: UnlockRules['golden'] = rules.golden;

  /** Plays for `seconds` with a touch every `every` seconds; returns when golden bubbles came. */
  function play(seconds: number, every: number, seed: number, allFound = false): number[] {
    const clock = newGoldenClock();
    const rng = makeRng(seed);
    const times: number[] = [];
    for (let t = 0; t < seconds; t += every) {
      const added = notePlay(clock, every);
      if (goldenNow(clock, golden, added, rng(), allFound)) times.push(clock.played);
    }
    return times;
  }

  it('never comes in the first minute and a half, and never twice within three minutes', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const times = play(4 * 3600, 0.4, seed);
      expect(times[0]!).toBeGreaterThanOrEqual(golden.notBefore);
      for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(golden.gap);
    }
  });

  it('comes about every six minutes of play on average', () => {
    const times = play(40 * 3600, 0.5, 7);
    const average = (times.at(-1)! - times[0]!) / (times.length - 1);
    expect(average).toBeGreaterThan(golden.every * 0.85);
    expect(average).toBeLessThan(golden.every * 1.15);
  });

  it('comes half as often once everything golden is found', () => {
    const normal = play(40 * 3600, 0.5, 3).length;
    const later = play(40 * 3600, 0.5, 3, true).length;
    expect(later).toBeLessThan(normal * 0.75);
  });

  it('only counts time spent playing', () => {
    const clock = newGoldenClock();
    expect(notePlay(clock, 600)).toBe(3); // a long break counts as a few seconds at most
    expect(notePlay(clock, 0.5)).toBe(0.5);
    expect(clock.played).toBe(3.5);
  });
});
