/**
 * A tiny buzz on each pop, where the browser can do it (most Android browsers).
 * iPhone browsers have no vibration for web pages, so there it quietly does nothing.
 */
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Buzzes closer together than this blur into one long drone, so the extras are skipped. */
const MIN_GAP_MS = 30;

let enabled = true;
let tapped = false;
let last = -Infinity;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Browsers allow vibration only after the first tap. Call this from a tap. */
export function noteTap(): void {
  tapped = true;
}

function hasBeenTapped(): boolean {
  const activation = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : tapped;
}

/** A buzz of `ms` milliseconds. */
export function buzz(ms: number): void {
  if (!enabled || !canVibrate || !hasBeenTapped()) return;
  const now = performance.now();
  if (now - last < MIN_GAP_MS) return;
  last = now;
  try {
    navigator.vibrate(ms);
  } catch {
    // Not allowed right now; never mind.
  }
}
