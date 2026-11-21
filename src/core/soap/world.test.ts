import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import {
  blowBubble,
  bubbleAt,
  bubblesAlong,
  makeWorld,
  pushBreeze,
  removeBubble,
  SOAP,
  stepWorld,
  type SoapBubble,
  type SoapEvent,
  type SoapWorld,
} from './world';

const box = { x: 0, y: 0, w: 400, h: 700 };
const run = (world: SoapWorld, seconds: number, calm = false): SoapEvent[] => {
  const events: SoapEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...stepWorld(world, 1 / 60, calm));
  return events;
};
const finite = (b: SoapBubble) => [b.x, b.y, b.vx, b.vy, b.r].every(Number.isFinite);

describe('soap bubbles', () => {
  it('float up gently in still air', () => {
    const world = makeWorld(box);
    const { bubble } = blowBubble(world, 200, 500, 0, 0, 20, makeRng(1));
    run(world, 3);
    expect(bubble.y).toBeLessThan(500 - 25);
    expect(Math.abs(bubble.x - 200)).toBeLessThan(40);
  });

  it('ride the breeze, and the breeze settles by itself', () => {
    const world = makeWorld(box);
    const { bubble } = blowBubble(world, 100, 400, 0, 0, 20, makeRng(2));
    for (let t = 0; t < 1; t += 1 / 60) {
      pushBreeze(world, 200, 0, 1 / 60);
      stepWorld(world, 1 / 60, false);
    }
    expect(bubble.vx).toBeGreaterThan(80);
    run(world, 8);
    expect(Math.hypot(world.breeze.x, world.breeze.y)).toBeLessThan(10);
  });

  it('never blow a breeze stronger than allowed', () => {
    const world = makeWorld(box);
    for (let i = 0; i < 100; i += 1) pushBreeze(world, 5000, -5000, 1 / 60);
    expect(Math.hypot(world.breeze.x, world.breeze.y)).toBeLessThanOrEqual(SOAP.breezeMax + 1e-9);
  });

  it('pop by themselves when their time is up', () => {
    const world = makeWorld({ x: -1e4, y: -1e4, w: 2e4, h: 2e4 });
    const { bubble } = blowBubble(world, 0, 0, 0, 0, 20, makeRng(3));
    const events = run(world, SOAP.life[1] + 0.5);
    expect(events).toContainEqual({ kind: 'pop', bubble });
    expect(world.bubbles).toHaveLength(0);
  });

  it('are quietly gone when they drift far off screen', () => {
    const world = makeWorld(box);
    const { bubble } = blowBubble(world, 390, 300, 600, 0, 15, makeRng(4));
    const events = run(world, 2);
    expect(events).toContainEqual({ kind: 'gone', bubble });
  });

  it('pop the oldest first when there are already as many as allowed', () => {
    const world = makeWorld(box);
    const rng = makeRng(5);
    const first = blowBubble(world, 10, 10, 0, 0, 10, rng).bubble;
    first.age = 5;
    for (let i = 1; i < SOAP.max; i += 1) blowBubble(world, 10 + i, 10, 0, 0, 10, rng);
    const { popped } = blowBubble(world, 50, 50, 0, 0, 10, rng);
    expect(popped).toBe(first);
    expect(world.bubbles).toHaveLength(SOAP.max);
  });
});

describe('merging', () => {
  const pair = (stickyA: boolean, stickyB: boolean) => {
    const world = makeWorld({ x: -1e4, y: -1e4, w: 2e4, h: 2e4 });
    const rng = makeRng(6);
    const a = blowBubble(world, 0, 0, 0, 0, 20, rng).bubble;
    const b = blowBubble(world, 10, 0, 0, 0, 15, rng).bubble;
    Object.assign(a, { sticky: stickyA, age: 1, life: 30 });
    Object.assign(b, { sticky: stickyB, age: 1, life: 30 });
    return { world, a, b };
  };

  it('keeps all the soap: the merged bubble has the area of both', () => {
    const { world, a } = pair(true, true);
    const events = stepWorld(world, 1 / 60, false);
    expect(world.bubbles).toEqual([a]);
    expect(a.r).toBeCloseTo(Math.sqrt(20 * 20 + 15 * 15), 5);
    expect(a.jiggle).toBeGreaterThan(0.9);
    expect(events.some((e) => e.kind === 'merge')).toBe(true);
  });

  it('only sometimes: other bubbles nudge apart instead', () => {
    const { world, a, b } = pair(true, false);
    run(world, 1.5);
    expect(world.bubbles).toHaveLength(2);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.r + b.r) * 0.95);
  });

  it('never while bubbles are still leaving the wand', () => {
    const { world, a, b } = pair(true, true);
    a.age = 0.1;
    b.age = 0.1;
    stepWorld(world, 1 / 60, false);
    expect(world.bubbles).toHaveLength(2);
  });

  it('never makes giant bubbles', () => {
    const { world, a, b } = pair(true, true);
    a.r = 40;
    b.r = 40;
    b.x = 30;
    stepWorld(world, 1 / 60, false);
    expect(world.bubbles).toHaveLength(2);
  });
});

describe('touching bubbles', () => {
  it('finds the bubble under a finger, with a little extra reach for tiny ones', () => {
    const world = makeWorld(box);
    const rng = makeRng(7);
    const big = blowBubble(world, 100, 100, 0, 0, 30, rng).bubble;
    const tiny = blowBubble(world, 300, 300, 0, 0, 6, rng).bubble;
    expect(bubbleAt(world, 110, 100)).toBe(big);
    expect(bubbleAt(world, 314, 300)).toBe(tiny);
    expect(bubbleAt(world, 200, 200)).toBeNull();
  });

  it('finds every bubble a sliding finger passes', () => {
    const world = makeWorld(box);
    const rng = makeRng(8);
    const a = blowBubble(world, 100, 200, 0, 0, 20, rng).bubble;
    const b = blowBubble(world, 200, 210, 0, 0, 20, rng).bubble;
    blowBubble(world, 150, 400, 0, 0, 20, rng);
    expect(bubblesAlong(world, 50, 200, 260, 205)).toEqual([a, b]);
    expect(removeBubble(world, a)).toBe(true);
    expect(removeBubble(world, a)).toBe(false);
  });
});

describe('robustness', () => {
  it('stays calm and finite however wildly it is played', () => {
    const world = makeWorld(box);
    const rng = makeRng(9);
    for (let i = 0; i < 4000; i += 1) {
      if (rng() < 0.3) blowBubble(world, rng() * 400, rng() * 700, (rng() - 0.5) * 2000, (rng() - 0.5) * 2000, 6 + rng() * 34, rng);
      if (rng() < 0.2) pushBreeze(world, (rng() - 0.5) * 1e5, (rng() - 0.5) * 1e5, rng() * 0.1);
      stepWorld(world, rng() * 0.06, rng() < 0.5);
      expect(world.bubbles.length).toBeLessThanOrEqual(SOAP.max);
    }
    expect(world.bubbles.every(finite)).toBe(true);
    expect(world.bubbles.every((b) => b.r <= SOAP.maxMergedR)).toBe(true);
  });
});
