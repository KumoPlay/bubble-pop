import type { Face, Hat, Wand } from '../content';
import type { ToyId } from '../core/progress/state';
import type { Rect, ScreenSize } from '../render/frame';

export type { ToyId } from '../core/progress/state';
export { TOY_IDS } from '../core/progress/state';

/** One finger (or the mouse), in screen points. */
export interface Finger {
  id: number;
  x: number;
  y: number;
  kind: 'touch' | 'mouse' | 'pen';
}

/** A point a finger passed through since the last event. Fast swipes deliver several at once. */
export interface Sample {
  x: number;
  y: number;
}

/** The cosmetics in use right now. */
export interface Looks {
  wand: Wand;
  face: Face;
  hat: Hat;
  /** Bubble wrap colours and patterns to pick from for the next sheet (one, if a favourite is chosen). */
  wrapColors: string[];
  wrapPatterns: string[];
}

/** What a toy can ask of the app around it. */
export interface ToyHost {
  /** True when the player prefers calmer motion. */
  calm(): boolean;
  /** Something started moving: make sure frames are being drawn. */
  wake(): void;
  /** Draw a frame in `ms` milliseconds (for a blink), without drawing any in between. */
  wakeAt(ms: number): void;
  /** Something was popped (or poked) at (x, y). Counts quietly towards surprises. */
  onPop(x: number, y: number): void;
  looks(): Looks;
}

/** A toy: it gets fingers, moves time forward and draws itself. */
export interface Toy {
  readonly id: ToyId;
  /** The screen or the play area (the screen minus the bar and safe areas) changed. */
  setFrame(screen: ScreenSize, area: Rect, now: number): void;
  down(finger: Finger, now: number): void;
  move(finger: Finger, samples: readonly Sample[], now: number): void;
  up(finger: Finger, now: number): void;
  /** Moves time forward. Returns true while anything is still moving (more frames needed). */
  update(now: number): boolean;
  draw(now: number): void;
  /** The toy was opened / put away (stop held sounds, forget fingers). */
  enter?(now: number): void;
  leave?(now: number): void;
  /** The toy's button was tapped again while it is open (bubble wrap: a fresh sheet). */
  refresh?(now: number): void;
  /** The chosen cosmetics changed in the collection. */
  looksChanged?(now: number): void;
  /** The screen may have lost what was drawn (tab hidden, graphics reset): draw everything next frame. */
  invalidate?(): void;
}
