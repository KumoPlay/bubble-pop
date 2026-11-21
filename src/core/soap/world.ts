/**
 * Soap bubbles: they float up gently, sway, ride the breeze, sometimes merge
 * when they touch, and pop when touched or when their time is up. Plain numbers
 * only; drawing lives in src/render/soapView.ts. Units are screen points and seconds.
 */
import { between, type Rng } from '../rng';

export interface SoapBubble {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Seconds since it was blown. */
  age: number;
  /** It pops by itself at this age. */
  life: number;
  /** Turn of the swirling film (radians). */
  spin: number;
  spinRate: number;
  /** Phase of the gentle side-to-side sway. */
  sway: number;
  swayRate: number;
  /** Wobble after merging or being blown, 0 to 1. Fades by itself. */
  jiggle: number;
  /** Only sticky bubbles merge, so merging happens "sometimes". */
  sticky: boolean;
  /** Which of the film pictures it uses. */
  film: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SoapWorld {
  bubbles: SoapBubble[];
  /** The air's movement (points per second). Set by sweeping the wand; settles by itself. */
  breeze: { x: number; y: number };
  nextId: number;
  /** Bubbles that drift well outside this box are gone. */
  box: Box;
}

export const SOAP = {
  max: 40,
  /** Upward float in still air. */
  rise: 16,
  /** How quickly bubbles take on the air's movement (per second). */
  follow: 1.4,
  /** How quickly the breeze settles back to still air (per second). */
  settle: 0.45,
  breezeMax: 240,
  /** Side-to-side sway speed. */
  sway: 10,
  life: [9, 18] as const,
  /** Share of bubbles that can merge. */
  stickyShare: 0.5,
  /** Merging never makes a bubble bigger than this. */
  maxMergedR: 46,
  /** Bubbles younger than this never merge (they are still leaving the wand). */
  mergeAge: 0.5,
  jiggleFade: 3,
  filmCount: 3,
} as const;

export type SoapEvent =
  | { kind: 'pop'; bubble: SoapBubble }
  | { kind: 'merge'; bubble: SoapBubble; size: number }
  | { kind: 'gone'; bubble: SoapBubble };

export function makeWorld(box: Box): SoapWorld {
  return { bubbles: [], breeze: { x: 0, y: 0 }, nextId: 1, box: { ...box } };
}

/**
 * Blows a new bubble at (x, y) moving at (vx, vy). If there are already as many
 * bubbles as allowed, the oldest pops first; it is returned so it can be heard.
 */
export function blowBubble(
  world: SoapWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: number,
  rng: Rng,
): { bubble: SoapBubble; popped: SoapBubble | null } {
  let popped: SoapBubble | null = null;
  if (world.bubbles.length >= SOAP.max) {
    popped = world.bubbles.reduce((oldest, b) => (b.age > oldest.age ? b : oldest));
    removeBubble(world, popped);
  }
  const bubble: SoapBubble = {
    id: world.nextId++,
    x,
    y,
    vx,
    vy,
    r,
    age: 0,
    life: between(rng, SOAP.life[0], SOAP.life[1]),
    spin: rng() * Math.PI * 2,
    spinRate: between(rng, 0.25, 0.6) * (rng() < 0.5 ? -1 : 1),
    sway: rng() * Math.PI * 2,
    swayRate: between(rng, 0.7, 1.3),
    jiggle: 0.6,
    sticky: rng() < SOAP.stickyShare,
    film: Math.floor(rng() * SOAP.filmCount),
  };
  world.bubbles.push(bubble);
  return { bubble, popped };
}

/** Blends the breeze towards `wind` (for example the wand's sweep), never stronger than allowed. */
export function pushBreeze(world: SoapWorld, wx: number, wy: number, dt: number): void {
  const k = 1 - Math.exp(-4 * dt);
  world.breeze.x += (wx - world.breeze.x) * k;
  world.breeze.y += (wy - world.breeze.y) * k;
  const speed = Math.hypot(world.breeze.x, world.breeze.y);
  if (speed > SOAP.breezeMax) {
    world.breeze.x *= SOAP.breezeMax / speed;
    world.breeze.y *= SOAP.breezeMax / speed;
  }
}

export function removeBubble(world: SoapWorld, bubble: SoapBubble): boolean {
  const index = world.bubbles.indexOf(bubble);
  if (index < 0) return false;
  world.bubbles.splice(index, 1);
  return true;
}

/** Moves time forward. Returns what happened: bubbles that popped by themselves, merged or drifted away. */
export function stepWorld(world: SoapWorld, dt: number, calm: boolean): SoapEvent[] {
  const events: SoapEvent[] = [];
  if (!(dt > 0)) return events;
  const follow = 1 - Math.exp(-SOAP.follow * dt);
  const settle = Math.exp(-SOAP.settle * dt);
  world.breeze.x *= settle;
  world.breeze.y *= settle;
  const swayAmount = calm ? SOAP.sway * 0.4 : SOAP.sway;

  for (let i = world.bubbles.length - 1; i >= 0; i -= 1) {
    const b = world.bubbles[i]!;
    b.age += dt;
    b.spin += b.spinRate * dt;
    b.sway += b.swayRate * dt;
    b.jiggle *= Math.exp(-SOAP.jiggleFade * dt);
    // Small bubbles float up a little faster than big ones.
    const airX = world.breeze.x + Math.sin(b.sway) * swayAmount;
    const airY = world.breeze.y - SOAP.rise * (0.75 + 0.25 * Math.min(2, 20 / b.r));
    b.vx += (airX - b.vx) * follow;
    b.vy += (airY - b.vy) * follow;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.age >= b.life) {
      world.bubbles.splice(i, 1);
      events.push({ kind: 'pop', bubble: b });
    } else if (isOutside(world.box, b)) {
      world.bubbles.splice(i, 1);
      events.push({ kind: 'gone', bubble: b });
    }
  }

  // Touching bubbles: sticky ones merge, the rest nudge each other apart.
  for (let i = 0; i < world.bubbles.length; i += 1) {
    for (let j = i + 1; j < world.bubbles.length; j += 1) {
      const a = world.bubbles[i]!;
      const b = world.bubbles[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2) || 0.001;
      const merged = Math.sqrt(a.r * a.r + b.r * b.r);
      if (a.sticky && b.sticky && a.age > SOAP.mergeAge && b.age > SOAP.mergeAge && merged <= SOAP.maxMergedR && d < reach * 0.8) {
        const big = a.r >= b.r ? a : b;
        const small = big === a ? b : a;
        const wa = a.r * a.r;
        const wb = b.r * b.r;
        const left = Math.max(a.life - a.age, b.life - b.age);
        big.x = (a.x * wa + b.x * wb) / (wa + wb);
        big.y = (a.y * wa + b.y * wb) / (wa + wb);
        big.vx = (a.vx * wa + b.vx * wb) / (wa + wb);
        big.vy = (a.vy * wa + b.vy * wb) / (wa + wb);
        big.r = merged;
        big.life = big.age + left + 2;
        big.jiggle = 1;
        world.bubbles.splice(world.bubbles.indexOf(small), 1);
        events.push({ kind: 'merge', bubble: big, size: merged });
        j = i; // look again from this bubble
        continue;
      }
      // A soft push apart, shared by size.
      const overlap = (reach - d) * Math.min(1, 6 * dt);
      const nx = dx / d;
      const ny = dy / d;
      const share = b.r / reach;
      a.x -= nx * overlap * share;
      a.y -= ny * overlap * share;
      b.x += nx * overlap * (1 - share);
      b.y += ny * overlap * (1 - share);
    }
  }
  return events;
}

function isOutside(box: Box, b: SoapBubble): boolean {
  const margin = b.r + 30;
  return b.x < box.x - margin || b.x > box.x + box.w + margin || b.y < box.y - margin || b.y > box.y + box.h + margin;
}

/** The bubble under a finger (the nearest within `reach` radii), or null. */
export function bubbleAt(world: SoapWorld, x: number, y: number, reach = 1.15): SoapBubble | null {
  let best: SoapBubble | null = null;
  let bestScore = Infinity;
  for (const b of world.bubbles) {
    const d = Math.hypot(b.x - x, b.y - y);
    // Small bubbles get a little extra reach, so they are easy to catch.
    const limit = Math.max(b.r * reach, 18);
    if (d <= limit && d / limit < bestScore) {
      best = b;
      bestScore = d / limit;
    }
  }
  return best;
}

/** Bubbles a sliding finger passes on its way from (x0, y0) to (x1, y1). */
export function bubblesAlong(world: SoapWorld, x0: number, y0: number, x1: number, y1: number): SoapBubble[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length2 = dx * dx + dy * dy;
  return world.bubbles.filter((b) => {
    const t = length2 > 0 ? Math.min(1, Math.max(0, ((b.x - x0) * dx + (b.y - y0) * dy) / length2)) : 0;
    const limit = Math.max(b.r, 16);
    return Math.hypot(x0 + t * dx - b.x, y0 + t * dy - b.y) <= limit;
  });
}
