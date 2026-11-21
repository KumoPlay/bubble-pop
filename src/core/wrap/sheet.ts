/**
 * A sheet of bubble wrap: where the bubbles are, which are popped, and which
 * bubble a finger is touching. Plain numbers only; drawing lives in src/render/.
 *
 * Sheet units are screen points (CSS pixels) at the moment the sheet was made.
 * If the screen changes size, the drawing code scales the whole sheet.
 */
import type { WrapLayout } from '../../content';
import { pickOne, type Rng } from '../rng';

export interface Area {
  w: number;
  h: number;
}

/** What a sheet needs from a pattern. */
export interface SheetPattern {
  id: string;
  shape: string;
  size: number;
  gap: number;
  layout: WrapLayout;
}

export interface Bubble {
  x: number;
  y: number;
  popped: boolean;
}

export interface Sheet {
  /** Counts up with every new sheet. */
  serial: number;
  pattern: string;
  color: string;
  shape: string;
  /** Decides the little random details, like the creases of popped bubbles. */
  seed: number;
  width: number;
  height: number;
  /** Bubble radius. */
  r: number;
  /** Room around each bubble that belongs to it when drawn (shadow, creases). Never reaches a neighbour. */
  pad: number;
  /** How much bigger than the pattern's size the bubbles were made (bigger screens get bigger bubbles). */
  scale: number;
  cols: number;
  rows: number;
  bubbles: Bubble[];
  /** Bubbles not popped yet. */
  left: number;
}

export const SHEET_LIMITS = { minCols: 3, minRows: 3, maxCols: 16, maxRows: 18 } as const;

/** Bubbles may be spread up to this much further apart than the pattern says, to fill the screen. */
const STRETCH = 1.15;

/** Taps this far from a bubble's centre (in radii) still pop it. A little forgiving. */
export const TAP_REACH = 1.15;
/** A sliding finger pops bubbles whose centre it passes within this distance (in radii). */
export const SWEEP_REACH = 0.85;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Phones get the pattern's size; tablets and computers get bubbles up to 1.5 times bigger. */
export function bubbleScale(area: Area): number {
  return clamp(Math.min(area.w, area.h) / 380, 1, 1.5);
}

/** Lays out a new sheet that fills `area` as well as whole bubbles allow. */
export function makeSheet(options: {
  area: Area;
  pattern: SheetPattern;
  color: string;
  seed: number;
  serial: number;
}): Sheet {
  const { area, pattern } = options;
  const scale = bubbleScale(area);
  const size = pattern.size * scale;
  const gap = pattern.gap * scale;
  const pitch = size + gap;
  const offset = pattern.layout === 'offset';
  // Offset rows sit closer together, like real bubble wrap (hexagonal packing).
  const rowPitch = offset ? pitch * Math.sqrt(3) / 2 : pitch;
  const margin = gap / 2 + size / 4;

  const fitCols = Math.floor((area.w - 2 * margin - size) / pitch) + 1;
  const fitRows = Math.floor((area.h - 2 * margin - size) / rowPitch) + 1;
  const cols = clamp(fitCols, SHEET_LIMITS.minCols, SHEET_LIMITS.maxCols);
  const rows = clamp(fitRows, SHEET_LIMITS.minRows, SHEET_LIMITS.maxRows);
  // Spread the bubbles a little (up to STRETCH) so the sheet fills the screen instead of
  // leaving a wide empty border. Spacing only ever grows, so bubbles never get closer.
  const spreadX = cols > 1 ? clamp((area.w - 2 * margin - size) / (cols - 1), pitch, pitch * STRETCH) : pitch;
  const spreadY = rows > 1 ? clamp((area.h - 2 * margin - size) / (rows - 1), rowPitch, rowPitch * STRETCH) : rowPitch;

  const bubbles: Bubble[] = [];
  for (let row = 0; row < rows; row += 1) {
    // In offset sheets every other row has one bubble fewer, shifted half a bubble, so the sheet stays tidy.
    const shifted = offset && row % 2 === 1;
    const count = shifted ? cols - 1 : cols;
    for (let col = 0; col < count; col += 1) {
      bubbles.push({
        x: margin + size / 2 + col * spreadX + (shifted ? spreadX / 2 : 0),
        y: margin + size / 2 + row * spreadY,
        popped: false,
      });
    }
  }

  return {
    serial: options.serial,
    pattern: pattern.id,
    color: options.color,
    shape: pattern.shape,
    seed: options.seed >>> 0,
    width: 2 * margin + size + (cols - 1) * spreadX,
    height: 2 * margin + size + (rows - 1) * spreadY,
    r: size / 2,
    pad: gap * 0.45,
    scale,
    cols,
    rows,
    bubbles,
    left: bubbles.length,
  };
}

/** How a sheet sits in an area: its scale and its top-left corner (relative to the area). */
export interface Placement {
  scale: number;
  x: number;
  y: number;
}

/** Centres the sheet in the area, shrinking it if it does not fit. Never enlarges it. */
export function placeSheet(sheet: Sheet, area: Area): Placement {
  const scale = Math.min(1, area.w / sheet.width, area.h / sheet.height);
  return {
    scale,
    x: (area.w - sheet.width * scale) / 2,
    y: (area.h - sheet.height * scale) / 2,
  };
}

/**
 * After the screen changes (for example the phone turns sideways), is it better to
 * lay out a new sheet than to shrink this one? True when the bubbles would get much smaller.
 */
export function needsNewLayout(sheet: Sheet, area: Area): boolean {
  return placeSheet(sheet, area).scale < 0.8;
}

/**
 * The bubble a finger at (x, y) is touching: the nearest one within `reach`
 * radii, popped or not. -1 when the finger is between bubbles or off the sheet.
 */
export function bubbleAt(sheet: Sheet, x: number, y: number, reach = TAP_REACH): number {
  const limit = (sheet.r * reach) ** 2;
  let best = -1;
  let bestDistance = limit;
  for (let i = 0; i < sheet.bubbles.length; i += 1) {
    const b = sheet.bubbles[i]!;
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

export interface SweepHit {
  index: number;
  /** Where along the slide the bubble was passed, 0 (start) to 1 (end). */
  t: number;
}

/**
 * Unpopped bubbles a finger passes when it slides from (x0, y0) to (x1, y1), in the
 * order it reaches them. Checking the whole line means a fast swipe never skips one.
 */
export function bubblesAlong(
  sheet: Sheet,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach = SWEEP_REACH,
): SweepHit[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length2 = dx * dx + dy * dy;
  const limit = (sheet.r * reach) ** 2;
  const hits: SweepHit[] = [];
  for (let i = 0; i < sheet.bubbles.length; i += 1) {
    const b = sheet.bubbles[i]!;
    if (b.popped) continue;
    const t = length2 > 0 ? clamp(((b.x - x0) * dx + (b.y - y0) * dy) / length2, 0, 1) : 0;
    const px = x0 + t * dx - b.x;
    const py = y0 + t * dy - b.y;
    if (px * px + py * py <= limit) hits.push({ index: i, t });
  }
  return hits.sort((a, b) => a.t - b.t);
}

/** Pops bubble `index`. False if it was already popped (or does not exist). */
export function popBubble(sheet: Sheet, index: number): boolean {
  const b = sheet.bubbles[index];
  if (!b || b.popped) return false;
  b.popped = true;
  sheet.left -= 1;
  return true;
}

export function isSheetDone(sheet: Sheet): boolean {
  return sheet.left <= 0;
}

/**
 * Picks the pattern and colour of the next sheet from those on offer. It avoids the
 * same pattern and the same colour as the sheet before, whenever there is another choice.
 */
export function chooseNextLook(
  options: { patterns: readonly string[]; colors: readonly string[] },
  previous: { pattern: string; color: string } | null,
  rng: Rng,
): { pattern: string; color: string } {
  const freshPatterns = options.patterns.filter((p) => p !== previous?.pattern);
  const freshColors = options.colors.filter((c) => c !== previous?.color);
  return {
    pattern: pickOne(rng, freshPatterns.length > 0 ? freshPatterns : options.patterns),
    color: pickOne(rng, freshColors.length > 0 ? freshColors : options.colors),
  };
}
