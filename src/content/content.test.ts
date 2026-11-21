import { describe, expect, it } from 'vitest';
import { hatPictures } from '../art';
import { isHex, lightness } from '../core/color';
import facesJson from './cloud-faces.json';
import hatsJson from './cloud-hats.json';
import {
  content,
  contentProblems,
  cosmeticKeys,
  COSMETIC_KINDS,
  minGap,
  readContent,
  splitKey,
  wrapPalette,
  type RawContent,
} from './index';
import paletteJson from './palette.json';
import shapesJson from './shapes.json';
import unlocksJson from './unlocks.json';
import wandsJson from './wands.json';
import wrapColorsJson from './wrap-colors.json';
import wrapPatternsJson from './wrap-patterns.json';

const good: RawContent = {
  palette: paletteJson,
  shapes: shapesJson,
  wrapColors: wrapColorsJson,
  wrapPatterns: wrapPatternsJson,
  wands: wandsJson,
  faces: facesJson,
  hats: hatsJson,
  unlocks: unlocksJson,
  hatFiles: Object.keys(hatPictures),
};

describe('the content files', () => {
  it('have no problems', () => {
    expect(contentProblems).toEqual([]);
  });

  it('use every entry (nothing was skipped)', () => {
    expect(content.wrapColors).toHaveLength(wrapColorsJson.length);
    expect(content.wrapPatterns).toHaveLength(wrapPatternsJson.length);
    expect(content.wands).toHaveLength(wandsJson.length);
    expect(content.faces).toHaveLength(facesJson.length);
    expect(content.hats).toHaveLength(hatsJson.length);
    expect(Object.keys(content.shapes)).toHaveLength(Object.keys(shapesJson).length);
  });

  it('use every hat picture in src/art/hats/', () => {
    const used = new Set(content.hats.map((h) => h.picture));
    for (const file of Object.keys(hatPictures)) expect(used.has(file), file).toBe(true);
  });

  it('give every bubble-wrap colour a soft, light look', () => {
    for (const color of content.wrapColors) {
      const p = wrapPalette(color);
      for (const value of [p.bubble, p.rim, p.sheet, p.flat, ...p.backdrop]) expect(isHex(value)).toBe(true);
      expect(lightness(p.bubble), color.id).toBeGreaterThan(0.6);
      expect(lightness(p.sheet), color.id).toBeGreaterThan(lightness(p.bubble) - 0.02);
    }
  });

  it('start everyone with one of each kind, and keep golden items special', () => {
    const { starters, goldenOnly } = content.unlocks;
    for (const kind of COSMETIC_KINDS) expect(starters.some((k) => k.startsWith(`${kind}/`)), kind).toBe(true);
    for (const key of goldenOnly) expect(starters).not.toContain(key);
    expect(goldenOnly.length).toBeGreaterThan(0);
  });

  it('leave something to discover for every toy', () => {
    const { starters, goldenOnly } = content.unlocks;
    const regular = cosmeticKeys.filter((k) => !starters.includes(k) && !goldenOnly.includes(k));
    for (const prefix of ['wrap-', 'wand/', 'face/', 'hat/']) {
      expect(regular.some((k) => k.startsWith(prefix)), prefix).toBe(true);
    }
    expect(regular.length).toBeGreaterThanOrEqual(20);
  });
});

describe('readContent', () => {
  it('explains a broken entry and skips only that one', () => {
    const { content: c, problems } = readContent({
      ...good,
      wrapColors: [...wrapColorsJson, { id: 'oops', bubble: 'pink' }, { id: 'petal', bubble: '#FFFFFF' }],
      wrapPatterns: [
        ...wrapPatternsJson,
        { id: 'squares', shape: 'square', size: 40, gap: 10, layout: 'offset' },
        { id: 'tight', shape: 'circle', size: 60, gap: 2, layout: 'offset' },
      ],
      wands: [...wandsJson, { id: 'odd', shape: 'circle', ring: '#FFFFFF', handle: '#FFFFFF', film: ['#FFFFFF'] }],
      faces: [...facesJson, { id: 'odd', eyes: 'square', mouth: 'smile', blush: '#FFFFFF' }],
      hats: [...hatsJson, { id: 'odd', picture: 'missing.svg', width: 0.5 }],
    });
    const text = problems.join('\n');
    expect(problems).toHaveLength(7);
    expect(text).toMatch(/"bubble" must be a colour/);
    expect(text).toMatch(/used twice/);
    expect(text).toMatch(/"shape" must be one of/);
    expect(text).toMatch(/"gap" must be from 11/);
    expect(text).toMatch(/"ring" must be a list/);
    expect(text).toMatch(/"eyes" must be one of/);
    expect(text).toMatch(/"picture" must be the name of a file/);
    expect(c.wrapColors).toHaveLength(wrapColorsJson.length);
    expect(c.wands).toHaveLength(wandsJson.length);
  });

  it('explains unlock rules that name things that do not exist', () => {
    const { problems } = readContent({
      ...good,
      unlocks: { ...unlocksJson, starters: [...unlocksJson.starters, 'wand/broom'], goldenOnly: ['hat/none'] },
    });
    expect(problems.join('\n')).toMatch(/"wand\/broom", which does not exist/);
    expect(problems.join('\n')).toMatch(/cannot be a starter and golden-only/);
  });

  it('keeps the toy working even if every entry is broken', () => {
    const { content: c, problems } = readContent({
      palette: {},
      shapes: {},
      wrapColors: [{}],
      wrapPatterns: 'x',
      wands: null,
      faces: [],
      hats: [],
      unlocks: null,
      hatFiles: [],
    });
    expect(problems.length).toBeGreaterThan(0);
    for (const list of [c.wrapColors, c.wrapPatterns, c.wands, c.faces, c.hats]) expect(list.length).toBeGreaterThan(0);
    expect(c.unlocks.starters.length).toBeGreaterThan(0);
  });

  it('asks for a bigger gap on bigger bubbles', () => {
    expect(minGap(30)).toBe(6);
    expect(minGap(70)).toBe(13);
  });

  it('splits cosmetic names', () => {
    expect(splitKey('wrap-color/mint')).toEqual({ kind: 'wrap-color', id: 'mint' });
    expect(splitKey('broom/tall')).toBeNull();
    expect(splitKey('nothing')).toBeNull();
  });
});
