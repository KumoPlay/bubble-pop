/** Shared drawing types and easing curves. */

/** A rectangle in screen points (CSS pixels). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The screen in screen points, and how many device pixels each point is drawn with. */
export interface ScreenSize {
  w: number;
  h: number;
  rs: number;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Overshoots a little and settles back: a plump, springy arrival. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
