/**
 * Bubble wrap: fingers → popping rules (core/wrap) → sound, buzz and drawing.
 * A bubble pops the moment a finger lands on it, every finger on its own.
 * Sliding a finger pops every bubble it passes.
 */
import { content, wrapPatternById } from '../content';
import { makeRng } from '../core/rng';
import {
  bubbleAt,
  bubblesAlong,
  chooseNextLook,
  isSheetDone,
  makeSheet,
  needsNewLayout,
  popBubble,
  type Sheet,
} from '../core/wrap/sheet';
import { buzz } from '../platform/haptics';
import type { Rect, ScreenSize } from '../render/frame';
import { WrapView } from '../render/wrapView';
import { rollCrinkle, rollSheetDone, rollSheetSlide, rollWrapPop, wrapPop } from '../sound/recipes';
import { playSound } from '../sound/synth';
import type { Finger, Sample, Toy, ToyHost } from './toy';

/** The first sheet anyone sees: the familiar classic. */
const FIRST_LOOK = { pattern: 'classic', color: 'petal' };
/** After the last bubble: a short pause, a soft chime, then the next sheet slides in. */
const CHIME_AFTER_MS = 160;
const NEXT_SHEET_AFTER_MS = 700;
/** Pops within one slide are spread out a touch, like a real finger running along the wrap. */
const SWEEP_SPACING_S = 0.012;

interface FingerState {
  x: number;
  y: number;
  /** The flat bubble under the finger, so sliding onto another one crinkles once. */
  over: number;
  lastCrinkle: number;
}

export class WrapToy implements Toy {
  readonly id = 'wrap' as const;
  private sheet: Sheet | null = null;
  private serial = 0;
  private sheetAt = -Infinity;
  private doneAt = 0;
  private chimed = false;
  private area: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private readonly view: WrapView;
  private readonly rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  private readonly fingers = new Map<number, FingerState>();

  constructor(
    g: CanvasRenderingContext2D,
    private readonly host: ToyHost,
  ) {
    this.view = new WrapView(g, content.palette.plum);
  }

  setFrame(screen: ScreenSize, area: Rect, now: number): void {
    this.area = area;
    this.view.setFrame(screen, area);
    // A phone turned sideways gets a sheet that fits, rather than a shrunken one.
    if (!this.sheet || needsNewLayout(this.sheet, area)) this.newSheet(now, 'first');
  }

  invalidate(): void {
    this.view.invalidate();
  }

  leave(): void {
    this.fingers.clear();
  }

  /** A different favourite was chosen in the collection: bring in a sheet that matches. */
  looksChanged(now: number): void {
    const sheet = this.sheet;
    const looks = this.host.looks();
    if (sheet && (!looks.wrapColors.includes(sheet.color) || !looks.wrapPatterns.includes(sheet.pattern))) {
      this.newSheet(now, 'slide');
    }
  }

  refresh(now: number): void {
    if (now - this.sheetAt < 400) return;
    this.newSheet(now, 'slide');
  }

  down(finger: Finger, now: number): void {
    const state: FingerState = { x: finger.x, y: finger.y, over: -1, lastCrinkle: -Infinity };
    this.fingers.set(finger.id, state);
    const sheet = this.sheet;
    const p = this.view.toSheet(finger.x, finger.y, now);
    if (!sheet || !p) return;
    const index = bubbleAt(sheet, p.x, p.y);
    if (index < 0) return;
    if (!sheet.bubbles[index]!.popped) this.pop(index, 0, now);
    else {
      this.crinkle(index, now);
      state.lastCrinkle = now;
    }
    state.over = index;
  }

  move(finger: Finger, samples: readonly Sample[], now: number): void {
    const state = this.fingers.get(finger.id);
    const sheet = this.sheet;
    if (!state || !sheet) return;
    let popped = 0;
    let x = state.x;
    let y = state.y;
    for (const sample of samples) {
      // Both ends are measured against the sheet as it is now, so a finger resting on a
      // sheet that slides in underneath it does not pop anything by itself.
      const a = this.view.toSheet(x, y, now);
      const b = this.view.toSheet(sample.x, sample.y, now);
      if (a && b) {
        for (const hit of bubblesAlong(sheet, a.x, a.y, b.x, b.y)) {
          this.pop(hit.index, Math.min(0.05, popped * SWEEP_SPACING_S), now);
          popped += 1;
        }
      }
      x = sample.x;
      y = sample.y;
    }
    state.x = x;
    state.y = y;

    const p = this.view.toSheet(x, y, now);
    const under = p ? bubbleAt(sheet, p.x, p.y, 0.9) : -1;
    if (under === state.over) return;
    state.over = under;
    // Sliding onto a bubble that was already flat: a little crinkle (not the one just popped).
    if (popped === 0 && under >= 0 && sheet.bubbles[under]!.popped && now - state.lastCrinkle > 70) {
      this.crinkle(under, now);
      state.lastCrinkle = now;
    }
  }

  up(finger: Finger): void {
    this.fingers.delete(finger.id);
  }

  update(now: number): boolean {
    if (this.doneAt > 0) {
      if (!this.chimed && now - this.doneAt >= CHIME_AFTER_MS) {
        this.chimed = true;
        playSound(rollSheetDone(this.rng));
      }
      if (now - this.doneAt >= NEXT_SHEET_AFTER_MS) this.newSheet(now, 'slide');
    }
    const moving = this.view.update(now);
    return moving || this.doneAt > 0;
  }

  draw(now: number): void {
    this.view.draw(now);
  }

  private pop(index: number, delay: number, now: number): void {
    const sheet = this.sheet;
    if (!sheet || !popBubble(sheet, index)) return;
    const dud = this.rng() < wrapPop.dud.chance;
    // Sound first: it has the longest way to go to the speaker.
    playSound(rollWrapPop(this.rng, (sheet.r * 2) / sheet.scale, dud), delay);
    buzz(dud ? 6 : 10);
    this.view.popped(index, now + delay * 1000, this.host.calm());
    const b = sheet.bubbles[index]!;
    const at = this.view.toScreen(b.x, b.y, now);
    if (at) this.host.onPop(at.x, at.y);
    if (isSheetDone(sheet) && this.doneAt === 0) this.doneAt = now;
    this.host.wake();
  }

  private crinkle(index: number, now: number): void {
    playSound(rollCrinkle(this.rng));
    buzz(4);
    this.view.crinkled(index, now, this.host.calm());
    this.host.wake();
  }

  private newSheet(now: number, how: 'first' | 'slide'): void {
    const previous = this.sheet;
    const looks = this.host.looks();
    const options = { patterns: looks.wrapPatterns, colors: looks.wrapColors };
    const firstFits = options.patterns.includes(FIRST_LOOK.pattern) && options.colors.includes(FIRST_LOOK.color);
    const look =
      previous || !firstFits
        ? chooseNextLook(options, previous ? { pattern: previous.pattern, color: previous.color } : null, this.rng)
        : FIRST_LOOK;
    const pattern = wrapPatternById(look.pattern) ?? content.wrapPatterns[0]!;
    const color = content.wrapColors.some((c) => c.id === look.color) ? look.color : content.wrapColors[0]!.id;
    this.serial += 1;
    this.sheet = makeSheet({
      area: this.area,
      pattern,
      color,
      seed: (this.rng() * 2 ** 32) >>> 0,
      serial: this.serial,
    });
    this.sheetAt = now;
    this.doneAt = 0;
    this.chimed = false;
    for (const state of this.fingers.values()) state.over = -1;
    this.view.show(this.sheet, now, how, this.host.calm());
    if (how === 'slide' && previous) playSound(rollSheetSlide(this.rng));
    this.host.wake();
  }
}
