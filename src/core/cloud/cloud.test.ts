import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { MOOD, newMood, nextChange, notePoke, noteTouch, updateMood, type Shape } from './mood';
import {
  contains,
  grab,
  isResting,
  makeBody,
  moveGrab,
  placeBody,
  poke,
  release,
  SOFT,
  stepBody,
  topPointAt,
  type Body,
} from './softbody';

const run = (body: Body, seconds: number, calm = false) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepBody(body, 1 / 60, calm);
};

/** How far the farthest point is from where it would sit at rest (in points). */
function distanceFromRest(body: Body): number {
  let worst = 0;
  for (let i = 0; i < body.n; i += 1) {
    const x = body.home.x + body.rest[i * 2]! * body.size;
    const y = body.home.y + body.rest[i * 2 + 1]! * body.size;
    worst = Math.max(worst, Math.hypot(body.pos[i * 2]! - x, body.pos[i * 2 + 1]! - y));
  }
  return worst;
}

const allFinite = (body: Body) => [...body.pos, ...body.vel].every(Number.isFinite);

describe('the squishy cloud body', () => {
  it('stays perfectly still at rest', () => {
    const body = makeBody(200, 300, 110);
    run(body, 2);
    expect(distanceFromRest(body)).toBeLessThan(0.01);
    expect(isResting(body)).toBe(true);
  });

  it('springs back to its shape after a big shove', () => {
    const body = makeBody(200, 300, 110);
    const rng = makeRng(1);
    for (let i = 0; i < body.n * 2; i += 1) body.vel[i] = (rng() - 0.5) * 6000;
    run(body, 0.2);
    expect(distanceFromRest(body)).toBeGreaterThan(5);
    run(body, 6);
    expect(distanceFromRest(body)).toBeLessThan(1);
    expect(isResting(body)).toBe(true);
  });

  it('dents in where it is poked, then wobbles back', () => {
    const body = makeBody(200, 300, 110);
    const top = topPointAt(body, 0);
    const x = body.pos[top * 2]!;
    const y = body.pos[top * 2 + 1]!;
    poke(body, x, y, 300);
    run(body, 0.05);
    expect(body.pos[top * 2 + 1]!).toBeGreaterThan(y + 3); // pushed down, into the cloud
    run(body, 6);
    expect(distanceFromRest(body)).toBeLessThan(1);
  });

  it('stretches towards a pulling finger, but only so far, and settles when let go', () => {
    const body = makeBody(200, 300, 100);
    const right = body.pos.indexOf(Math.max(...body.pos.filter((_, i) => i % 2 === 0)));
    const x = body.pos[right]!;
    const y = body.pos[right + 1]!;
    grab(body, 1, x, y);
    moveGrab(body, 1, x + 80, y);
    run(body, 1);
    expect(body.fit.reach).toBeGreaterThan(1.3);
    // Pulling much farther gives little more: the rubber band.
    const reachAt80 = body.fit.reach;
    moveGrab(body, 1, x + 2000, y);
    run(body, 1);
    expect(body.fit.reach).toBeLessThan(reachAt80 + 0.9);
    expect(body.fit.reach).toBeLessThan(SOFT.maxReach);
    release(body, 1);
    run(body, 6);
    expect(distanceFromRest(body)).toBeLessThan(1);
  });

  it('squeezes smaller when pinched from both sides', () => {
    const body = makeBody(200, 300, 100);
    grab(body, 1, 100, 300);
    grab(body, 2, 300, 300);
    moveGrab(body, 1, 160, 300);
    moveGrab(body, 2, 240, 300);
    run(body, 0.8);
    expect(body.fit.area).toBeLessThan(MOOD.squishArea);
  });

  it('never breaks, however wildly it is handled', () => {
    const body = makeBody(200, 300, 110);
    const rng = makeRng(42);
    for (let i = 0; i < 3000; i += 1) {
      const id = Math.floor(rng() * 4);
      const roll = rng();
      const x = (rng() - 0.5) * 5000;
      const y = (rng() - 0.5) * 5000;
      if (roll < 0.2) grab(body, id, x, y);
      else if (roll < 0.6) moveGrab(body, id, x, y);
      else if (roll < 0.7) release(body, id);
      else if (roll < 0.8) poke(body, x, y, rng() * 1e5);
      else if (roll < 0.82) moveGrab(body, id, Number.NaN, Infinity);
      stepBody(body, rng() * 0.2, rng() < 0.3);
      expect(allFinite(body)).toBe(true);
      for (let p = 0; p < body.n; p += 1) {
        const d = Math.hypot(body.pos[p * 2]! - body.fit.cx, body.pos[p * 2 + 1]! - body.fit.cy);
        // (Clamping a point nudges the middle a hair, hence the small allowance.)
        expect(d).toBeLessThanOrEqual(SOFT.maxReach * body.size * 1.05);
      }
    }
    for (let id = 0; id < 4; id += 1) release(body, id);
    run(body, 10);
    expect(distanceFromRest(body)).toBeLessThan(1);
  });

  it('knows what is inside it', () => {
    const body = makeBody(200, 300, 100);
    expect(contains(body, 200, 300)).toBe(true);
    expect(contains(body, 200, 100)).toBe(false);
    expect(contains(body, 305, 300)).toBe(false);
    expect(contains(body, 305, 300, 12)).toBe(true);
  });

  it('moves and resizes with the screen', () => {
    const body = makeBody(200, 300, 100);
    placeBody(body, 400, 200, 60);
    run(body, 1);
    expect(body.fit.cx).toBeCloseTo(400, 0);
    expect(distanceFromRest(body)).toBeLessThan(1);
  });

  it('finds a spot on top for a hat', () => {
    const body = makeBody(0, 0, 100);
    const middle = topPointAt(body, 0);
    const right = topPointAt(body, 0.5);
    expect(body.rest[middle * 2 + 1]!).toBeLessThan(-0.7);
    expect(body.rest[right * 2]!).toBeGreaterThan(0.25);
    expect(body.rest[right * 2 + 1]!).toBeLessThan(0);
  });
});

describe('the cloud mood', () => {
  const rest: Shape = { reach: 1, aspect: 1, area: 1 };

  it('giggles when poked, once per giggle', () => {
    const rng = makeRng(1);
    const mood = newMood(0, rng);
    expect(notePoke(mood, 100)).toBe(true);
    expect(notePoke(mood, 300)).toBe(false);
    updateMood(mood, 400, rest, rng);
    expect(mood.expression).toBe('giggle');
    updateMood(mood, 300 + MOOD.giggleMs + 1, rest, rng);
    expect(mood.expression).not.toBe('giggle');
  });

  it('looks surprised when stretched far, and a moment after', () => {
    const rng = makeRng(2);
    const mood = newMood(0, rng);
    updateMood(mood, 1000, { reach: 1.6, aspect: 1.2, area: 1 }, rng);
    expect(mood.expression).toBe('surprised');
    updateMood(mood, 1200, rest, rng);
    expect(mood.expression).toBe('surprised');
    updateMood(mood, 1000 + MOOD.surprisedHoldMs + 10, rest, rng);
    expect(mood.expression).not.toBe('surprised');
  });

  it('scrunches up when squeezed, even while it bulges out far', () => {
    const rng = makeRng(3);
    const mood = newMood(0, rng);
    updateMood(mood, 10, { reach: 1, aspect: 1.3, area: 0.7 }, rng);
    expect(mood.expression).toBe('squish');
    updateMood(mood, 20, { reach: 1.6, aspect: 2, area: 1, squeezed: true }, rng);
    expect(mood.expression).toBe('squish');
  });

  it('blinks now and then, and dozes off when left alone', () => {
    const rng = makeRng(4);
    const mood = newMood(0, rng);
    const seen = new Set<string>();
    for (let t = 0; t < 15_000; t += 16) {
      updateMood(mood, t, rest, rng);
      seen.add(mood.expression);
    }
    expect(seen).toContain('blink');
    updateMood(mood, MOOD.sleepyAfterMs + 100, rest, rng);
    expect(mood.expression).toBe('sleepy');
    noteTouch(mood, MOOD.sleepyAfterMs + 200);
    updateMood(mood, MOOD.sleepyAfterMs + 250, rest, rng);
    expect(mood.expression).not.toBe('sleepy');
  });

  it('says when the face will next change, and nothing once asleep', () => {
    const rng = makeRng(5);
    const mood = newMood(0, rng);
    const next = nextChange(mood, 0)!;
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(MOOD.blinkEvery[1]);
    updateMood(mood, MOOD.sleepyAfterMs + 1, rest, rng);
    expect(nextChange(mood, MOOD.sleepyAfterMs + 1 + MOOD.blinkMs)).toBeNull();
  });
});
