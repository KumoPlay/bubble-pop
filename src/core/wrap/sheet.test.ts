import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { makeRng } from '../rng';
import {
  bubbleAt,
  bubblesAlong,
  chooseNextLook,
  isSheetDone,
  makeSheet,
  needsNewLayout,
  placeSheet,
  popBubble,
  SHEET_LIMITS,
  type Area,
  type SheetPattern,
} from './sheet';

const classic: SheetPattern = { id: 'classic', shape: 'circle', size: 48, gap: 12, layout: 'offset' };
const phone: Area = { w: 362, h: 640 };
const sheetFor = (area: Area, pattern: SheetPattern = classic, seed = 1) =>
  makeSheet({ area, pattern, color: 'petal', seed, serial: 1 });

const AREAS: Area[] = [
  { w: 292, h: 470 }, // small phone, upright
  phone,
  { w: 760, h: 280 }, // phone on its side
  { w: 740, h: 900 }, // tablet
  { w: 1400, h: 760 }, // computer
];

describe('makeSheet', () => {
  it('fits every pattern on every screen, with no bubbles touching when drawn', () => {
    for (const area of AREAS) {
      for (const pattern of content.wrapPatterns) {
        const sheet = sheetFor(area, pattern);
        const where = `${pattern.id} on ${area.w}×${area.h}`;
        // On screen it fits, and is never shrunk enough to make the bubbles noticeably smaller.
        const place = placeSheet(sheet, area);
        expect(place.scale, where).toBeGreaterThan(0.95);
        expect(sheet.width * place.scale, where).toBeLessThanOrEqual(area.w + 1e-9);
        expect(sheet.height * place.scale, where).toBeLessThanOrEqual(area.h + 1e-9);
        expect(sheet.left).toBe(sheet.bubbles.length);
        const cell = sheet.r + sheet.pad;
        for (const [i, a] of sheet.bubbles.entries()) {
          // Inside the sheet, with room for its shadow and creases.
          expect(a.x - cell, where).toBeGreaterThanOrEqual(0);
          expect(a.y - cell, where).toBeGreaterThanOrEqual(0);
          expect(a.x + cell, where).toBeLessThanOrEqual(sheet.width + 1e-9);
          expect(a.y + cell, where).toBeLessThanOrEqual(sheet.height + 1e-9);
          for (const b of sheet.bubbles.slice(i + 1)) {
            expect(Math.hypot(a.x - b.x, a.y - b.y), where).toBeGreaterThanOrEqual(2 * cell - 1e-9);
          }
        }
      }
    }
  });

  it('makes finger-sized bubbles and a satisfying number of them on a phone', () => {
    const sheet = sheetFor(phone);
    expect(sheet.r * 2).toBe(48);
    expect(sheet.bubbles.length).toBeGreaterThanOrEqual(50);
    expect(sheet.bubbles.length).toBeLessThanOrEqual(120);
  });

  it('makes bubbles a little bigger on big screens, and keeps sheets a sensible size', () => {
    const sheet = sheetFor({ w: 1400, h: 760 });
    expect(sheet.scale).toBe(1.5);
    expect(sheet.cols).toBeLessThanOrEqual(SHEET_LIMITS.maxCols);
    expect(sheet.rows).toBeLessThanOrEqual(SHEET_LIMITS.maxRows);
  });

  it('still makes a small sheet on a tiny screen, to be shrunk to fit', () => {
    const area = { w: 120, h: 120 };
    const sheet = sheetFor(area);
    expect(sheet.cols).toBe(SHEET_LIMITS.minCols);
    expect(sheet.rows).toBe(SHEET_LIMITS.minRows);
    const place = placeSheet(sheet, area);
    expect(place.scale).toBeLessThan(1);
    expect(sheet.width * place.scale).toBeLessThanOrEqual(area.w + 1e-9);
    expect(sheet.height * place.scale).toBeLessThanOrEqual(area.h + 1e-9);
  });

  it('shifts every other row half a bubble in offset patterns', () => {
    const sheet = sheetFor(phone);
    const rowY = [...new Set(sheet.bubbles.map((b) => b.y))];
    const first = sheet.bubbles.filter((b) => b.y === rowY[0]);
    const second = sheet.bubbles.filter((b) => b.y === rowY[1]);
    expect(second).toHaveLength(first.length - 1);
    expect(second[0]!.x - first[0]!.x).toBeCloseTo((first[1]!.x - first[0]!.x) / 2);
  });

  it('spreads bubbles a little to fill the screen, but never more than 15%', () => {
    for (const area of AREAS) {
      const sheet = sheetFor(area);
      const pitch = (classic.size + classic.gap) * sheet.scale;
      const spread = sheet.bubbles[1]!.x - sheet.bubbles[0]!.x;
      expect(spread).toBeGreaterThanOrEqual(pitch - 1e-9);
      expect(spread).toBeLessThanOrEqual(pitch * 1.15 + 1e-9);
    }
    // On a standard phone the sheet now reaches close to both sides.
    const sheet = sheetFor(phone);
    expect(phone.w - sheet.width).toBeLessThan(20);
  });
});

describe('placeSheet and needsNewLayout', () => {
  it('centres a sheet without enlarging it', () => {
    const sheet = sheetFor(phone);
    const place = placeSheet(sheet, { w: 1000, h: 1000 });
    expect(place.scale).toBe(1);
    expect(place.x).toBeCloseTo((1000 - sheet.width) / 2);
  });

  it('keeps the sheet for small changes, but lays out a new one when the phone turns', () => {
    const sheet = sheetFor(phone);
    expect(needsNewLayout(sheet, { w: phone.w, h: phone.h - 40 })).toBe(false);
    expect(needsNewLayout(sheet, { w: 760, h: 280 })).toBe(true);
  });
});

describe('bubbleAt', () => {
  const sheet = sheetFor(phone);
  const b0 = sheet.bubbles[0]!;
  const b1 = sheet.bubbles[1]!;

  it('finds the bubble under a finger, a little beyond its edge too', () => {
    expect(bubbleAt(sheet, b0.x, b0.y)).toBe(0);
    expect(bubbleAt(sheet, b0.x + sheet.r * 1.1, b0.y)).toBe(0);
    expect(bubbleAt(sheet, b1.x - 2, b1.y + 3)).toBe(1);
  });

  it('finds nothing off the sheet or exactly between two bubbles', () => {
    expect(bubbleAt(sheet, -50, -50)).toBe(-1);
    expect(bubbleAt(sheet, (b0.x + b1.x) / 2, b0.y)).toBe(-1);
  });

  it('also finds popped bubbles (for the crinkle)', () => {
    const s = sheetFor(phone);
    popBubble(s, 3);
    expect(bubbleAt(s, s.bubbles[3]!.x, s.bubbles[3]!.y)).toBe(3);
  });
});

describe('bubblesAlong', () => {
  it('pops a whole row when a finger slides along it, in order, and nothing else', () => {
    const sheet = sheetFor(phone);
    const rowY = sheet.bubbles[0]!.y;
    const row = sheet.bubbles.flatMap((b, i) => (b.y === rowY ? [i] : []));
    const hits = bubblesAlong(sheet, 0, rowY, sheet.width, rowY);
    expect(hits.map((h) => h.index)).toEqual(row);
    expect(hits.map((h) => h.t)).toEqual([...hits.map((h) => h.t)].sort((a, b) => a - b));
  });

  it('runs the other way too', () => {
    const sheet = sheetFor(phone);
    const rowY = sheet.bubbles[0]!.y;
    const hits = bubblesAlong(sheet, sheet.width, rowY, 0, rowY);
    expect(hits[0]!.index).toBeGreaterThan(hits[hits.length - 1]!.index);
  });

  it('skips popped bubbles and catches every bubble on a fast swipe', () => {
    const sheet = sheetFor(phone);
    popBubble(sheet, 1);
    const rowY = sheet.bubbles[0]!.y;
    // One giant jump, as a fast swipe between two frames would give.
    const hits = bubblesAlong(sheet, -10, rowY, sheet.width + 10, rowY).map((h) => h.index);
    expect(hits).not.toContain(1);
    expect(hits).toContain(0);
    expect(hits).toContain(2);
  });

  it('pops nothing when a finger slides through the gap between two rows', () => {
    const sheet = sheetFor(phone, { ...classic, layout: 'grid' });
    const y = (sheet.bubbles[0]!.y + sheet.bubbles[sheet.cols]!.y) / 2;
    expect(bubblesAlong(sheet, 0, y, sheet.width, y)).toEqual([]);
  });

  it('pops the bubble under a finger that does not move', () => {
    const sheet = sheetFor(phone);
    const b = sheet.bubbles[5]!;
    expect(bubblesAlong(sheet, b.x, b.y, b.x, b.y).map((h) => h.index)).toEqual([5]);
  });
});

describe('popping', () => {
  it('counts down to a finished sheet, and a bubble pops only once', () => {
    const sheet = sheetFor({ w: 200, h: 200 });
    expect(popBubble(sheet, 0)).toBe(true);
    expect(popBubble(sheet, 0)).toBe(false);
    expect(popBubble(sheet, 999)).toBe(false);
    expect(sheet.left).toBe(sheet.bubbles.length - 1);
    for (let i = 0; i < sheet.bubbles.length; i += 1) popBubble(sheet, i);
    expect(sheet.left).toBe(0);
    expect(isSheetDone(sheet)).toBe(true);
  });
});

describe('chooseNextLook', () => {
  it('never repeats the pattern or the colour of the sheet before, when there is a choice', () => {
    const rng = makeRng(7);
    let previous = { pattern: 'a', color: 'x' };
    for (let i = 0; i < 200; i += 1) {
      const next = chooseNextLook({ patterns: ['a', 'b', 'c'], colors: ['x', 'y'] }, previous, rng);
      expect(next.pattern).not.toBe(previous.pattern);
      expect(next.color).not.toBe(previous.color);
      previous = next;
    }
  });

  it('repeats when there is only one choice', () => {
    const next = chooseNextLook({ patterns: ['a'], colors: ['x'] }, { pattern: 'a', color: 'x' }, makeRng(1));
    expect(next).toEqual({ pattern: 'a', color: 'x' });
  });
});
