/**
 * The squishy cloud's face: it giggles when poked, looks surprised when
 * stretched far, scrunches up when squeezed, blinks now and then, and dozes
 * off when nobody has touched it for a while.
 */
import { between, type Rng } from '../rng';

export type Expression = 'calm' | 'blink' | 'giggle' | 'surprised' | 'squish' | 'sleepy';

export interface Mood {
  expression: Expression;
  lastTouch: number;
  giggleUntil: number;
  surprisedUntil: number;
  nextBlink: number;
  blinkUntil: number;
}

export const MOOD = {
  /** Farther than this (1 = at rest) looks surprised. */
  surprisedReach: 1.4,
  surprisedAspect: 1.9,
  /** Surprise lingers this long after letting go. */
  surprisedHoldMs: 450,
  /** Squeezed smaller than this share of its area scrunches up. */
  squishArea: 0.84,
  giggleMs: 900,
  sleepyAfterMs: 20_000,
  blinkMs: 130,
  blinkEvery: [2500, 6000] as const,
} as const;

/** The cloud's shape right now, from the soft body. */
export interface Shape {
  reach: number;
  aspect: number;
  area: number;
  /** Two fingers pressing towards each other. */
  squeezed?: boolean;
}

export function newMood(now: number, rng: Rng): Mood {
  return {
    expression: 'calm',
    lastTouch: now,
    giggleUntil: 0,
    surprisedUntil: 0,
    nextBlink: now + between(rng, MOOD.blinkEvery[0], MOOD.blinkEvery[1]),
    blinkUntil: 0,
  };
}

export function noteTouch(mood: Mood, now: number): void {
  mood.lastTouch = now;
}

/** A poke. True when it starts a new giggle (so the giggle sound plays once, not on every poke). */
export function notePoke(mood: Mood, now: number): boolean {
  const fresh = now >= mood.giggleUntil;
  mood.giggleUntil = now + MOOD.giggleMs;
  mood.lastTouch = now;
  return fresh;
}

/** Works out the expression for now. Returns true when it changed. */
export function updateMood(mood: Mood, now: number, shape: Shape, rng: Rng): boolean {
  const before = mood.expression;
  if (shape.reach > MOOD.surprisedReach || shape.aspect > MOOD.surprisedAspect) {
    mood.surprisedUntil = now + MOOD.surprisedHoldMs;
  }
  if (now >= mood.nextBlink) {
    mood.blinkUntil = now + MOOD.blinkMs;
    mood.nextBlink = now + between(rng, MOOD.blinkEvery[0], MOOD.blinkEvery[1]);
  }
  let next: Expression;
  // A squeeze wins over surprise: squeezing also makes it bulge out far.
  if (shape.squeezed || shape.area < MOOD.squishArea) next = 'squish';
  else if (now < mood.surprisedUntil) next = 'surprised';
  else if (now < mood.giggleUntil) next = 'giggle';
  else if (now - mood.lastTouch > MOOD.sleepyAfterMs) next = 'sleepy';
  else if (now < mood.blinkUntil) next = 'blink';
  else next = 'calm';
  mood.expression = next;
  return next !== before;
}

/**
 * When the face will next change by itself (a blink, the end of a giggle,
 * dozing off), so the toy can wake up just then instead of drawing frames
 * while nothing happens. Null when it is asleep and nothing is planned.
 */
export function nextChange(mood: Mood, now: number): number | null {
  const times = [mood.giggleUntil, mood.surprisedUntil, mood.blinkUntil, mood.lastTouch + MOOD.sleepyAfterMs];
  if (mood.expression !== 'sleepy') times.push(mood.nextBlink);
  const future = times.filter((t) => t > now);
  return future.length > 0 ? Math.min(...future) : null;
}
