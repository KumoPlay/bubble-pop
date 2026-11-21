/**
 * The toy's content, read from the JSON files in this folder. To add a colour,
 * a pattern, a wand, a face or a hat, add an entry to the matching JSON file;
 * no code changes. See README.md, "Adding things".
 *
 * Every entry is checked when the toy starts. A broken entry is skipped (with a
 * warning in the browser console) instead of breaking the toy, and
 * content.test.ts fails on it, so mistakes are caught before they go live.
 */
import { hatPictures } from '../art';
import { isHex, mix } from '../core/color';
import facesJson from './cloud-faces.json';
import hatsJson from './cloud-hats.json';
import paletteJson from './palette.json';
import shapesJson from './shapes.json';
import unlocksJson from './unlocks.json';
import wandsJson from './wands.json';
import wrapColorsJson from './wrap-colors.json';
import wrapPatternsJson from './wrap-patterns.json';

export interface Palette {
  lavender: string;
  lilac: string;
  petal: string;
  candy: string;
  sky: string;
  violet: string;
  plum: string;
  night: string;
  cream: string;
}

/** A bubble-wrap colour. Only `bubble` is needed; the rest is worked out from it. */
export interface WrapColor {
  id: string;
  bubble: string;
  /** Bubble edges and creases. Default: the bubble colour, a little darker. */
  rim?: string;
  /** The flat plastic between the bubbles. Default: the bubble colour, very light. */
  sheet?: string;
  /** The background behind the sheet, top and bottom. Default: two light tints of the bubble colour. */
  backdrop?: [string, string];
}

export type WrapLayout = 'offset' | 'grid';

/** A bubble-wrap pattern. */
export interface WrapPattern {
  id: string;
  /** A shape name from shapes.json. */
  shape: string;
  /** Bubble width in screen points on a phone (bigger screens scale it up a little). */
  size: number;
  /** Space between bubbles, in the same units. */
  gap: number;
  /** "offset": every other row is shifted half a bubble, like real bubble wrap. "grid": straight rows. */
  layout: WrapLayout;
  /** A tiny Kumo face on every bubble. */
  face: boolean;
}

/** A bubble wand. */
export interface Wand {
  id: string;
  /** The ring's shape, a name from shapes.json. */
  shape: string;
  /** The ring's colour; several colours make a rainbow ring. */
  ring: string[];
  handle: string;
  /** The colours swirling in the soap film of its bubbles. */
  film: string[];
}

export const EYE_STYLES = ['oval', 'round', 'sparkle', 'happy', 'star'] as const;
export const MOUTH_STYLES = ['smile', 'cat', 'tiny', 'grin'] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];
export type MouthStyle = (typeof MOUTH_STYLES)[number];

/** A face for the squishy cloud. Expressions (giggling, surprised…) are drawn on top of these. */
export interface Face {
  id: string;
  eyes: EyeStyle;
  mouth: MouthStyle;
  blush: string;
  lashes: boolean;
  freckles: boolean;
  whiskers: boolean;
}

/** A hat for the squishy cloud. "none" has no picture. */
export interface Hat {
  id: string;
  /** A file in src/art/hats/, or null for no hat. */
  picture: string | null;
  /** Width, as a share of the cloud's width. */
  width: number;
  /** Where along the top it sits: -1 far left, 0 middle, 1 far right. */
  x: number;
  /** Tilt in degrees (positive leans right). */
  tilt: number;
  /** How far it sinks into the cloud, as a share of its own height. */
  sink: number;
}

export type CosmeticKind = 'wrap-color' | 'wrap-pattern' | 'wand' | 'face' | 'hat';
export const COSMETIC_KINDS: readonly CosmeticKind[] = ['wrap-color', 'wrap-pattern', 'wand', 'face', 'hat'];

/** How unlocking works. Numbers are tuned in unlocks.json. */
export interface UnlockRules {
  /** Cosmetics everyone starts with, as "kind/id". */
  starters: string[];
  /** Cosmetics that only the golden Kumo bubble gives. */
  goldenOnly: string[];
  /** Pops between surprises: `first`, then `step` more each time, never more than `most`; ± `jitter` (share). */
  pace: { first: number; step: number; most: number; jitter: number };
  /** The golden bubble: never in the first `notBefore` seconds of play, about once every `every` seconds, never twice within `gap`. */
  golden: { notBefore: number; every: number; gap: number; floatSeconds: number };
  /** At least this many seconds between two surprises. */
  surpriseGap: number;
}

export interface Content {
  palette: Palette;
  /** SVG path data in a 100 × 100 box, centred on (50, 50), about 46 units from the centre to the edge. */
  shapes: Record<string, string>;
  wrapColors: WrapColor[];
  wrapPatterns: WrapPattern[];
  wands: Wand[];
  faces: Face[];
  hats: Hat[];
  unlocks: UnlockRules;
}

/** Everything a sheet needs to be drawn, with the defaults filled in. */
export interface WrapPalette {
  bubble: string;
  rim: string;
  sheet: string;
  flat: string;
  backdrop: [string, string];
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^\s*[Mm][MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;
const LAYOUTS: readonly WrapLayout[] = ['offset', 'grid'];
const PALETTE_KEYS: readonly (keyof Palette)[] = [
  'lavender',
  'lilac',
  'petal',
  'candy',
  'sky',
  'violet',
  'plum',
  'night',
  'cream',
];

export const SIZE_LIMITS = { min: 28, max: 96 } as const;

/** The smallest gap a pattern may use, so neighbouring bubbles never overlap when drawn. */
export function minGap(size: number): number {
  return Math.max(6, Math.ceil(size * 0.18));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const colorList = (value: unknown, min: number): value is string[] =>
  Array.isArray(value) && value.length >= min && value.every(isHex);

export const STARTER_FALLBACK: UnlockRules = {
  starters: ['wrap-color/petal', 'wrap-pattern/classic', 'wand/round', 'face/classic', 'hat/none'],
  goldenOnly: [],
  pace: { first: 30, step: 20, most: 250, jitter: 0.25 },
  golden: { notBefore: 90, every: 360, gap: 180, floatSeconds: 12 },
  surpriseGap: 15,
};

export interface RawContent {
  palette: unknown;
  shapes: unknown;
  wrapColors: unknown;
  wrapPatterns: unknown;
  wands: unknown;
  faces: unknown;
  hats: unknown;
  unlocks: unknown;
  /** File names in src/art/hats/. */
  hatFiles: readonly string[];
}

/**
 * Reads a list of entries, each with an id. `read` returns the checked entry or a
 * problem in plain words. Broken and repeated entries are skipped.
 */
function readList<T extends { id: string }>(
  file: string,
  raw: unknown,
  problems: string[],
  read: (entry: Record<string, unknown> & { id: string }) => T | string,
): T[] {
  const out: T[] = [];
  const ids = new Set<string>();
  if (!Array.isArray(raw)) {
    problems.push(`${file} must be a list ([ … ]).`);
    return out;
  }
  raw.forEach((entry, index) => {
    const where = `${file}, entry ${index + 1}`;
    if (!isRecord(entry) || typeof entry.id !== 'string' || !ID.test(entry.id)) {
      problems.push(`${where}: needs an "id" (lowercase letters, numbers and dashes).`);
      return;
    }
    if (ids.has(entry.id)) {
      problems.push(`${where}: the id "${entry.id}" is used twice.`);
      return;
    }
    const result = read(entry as Record<string, unknown> & { id: string });
    if (typeof result === 'string') {
      problems.push(`${where} ("${entry.id}"): ${result}`);
      return;
    }
    ids.add(entry.id);
    out.push(result);
  });
  return out;
}

/** Checks raw content. Returns the usable entries and a list of problems in plain words. */
export function readContent(raw: RawContent): { content: Content; problems: string[] } {
  const problems: string[] = [];

  const palette = {} as Palette;
  const rawPalette = isRecord(raw.palette) ? raw.palette : {};
  for (const key of PALETTE_KEYS) {
    const value = rawPalette[key];
    if (isHex(value)) palette[key] = value;
    else {
      problems.push(`palette.json: "${key}" must be a colour like "#3D3566".`);
      palette[key] = '#888888';
    }
  }

  const shapes: Record<string, string> = {};
  if (isRecord(raw.shapes)) {
    for (const [id, path] of Object.entries(raw.shapes)) {
      if (!ID.test(id)) problems.push(`shapes.json: "${id}" is not a good name (lowercase letters, numbers and dashes).`);
      else if (typeof path !== 'string' || !PATH.test(path)) problems.push(`shapes.json: "${id}" is not SVG path data.`);
      else shapes[id] = path;
    }
  } else problems.push('shapes.json must be an object of name → SVG path.');
  if (!shapes.circle) shapes.circle = 'M4 50A46 46 0 1 0 96 50A46 46 0 1 0 4 50Z';

  const wrapColors = readList<WrapColor>('wrap-colors.json', raw.wrapColors, problems, (e) => {
    if (!isHex(e.bubble)) return '"bubble" must be a colour like "#A9D3F7".';
    const color: WrapColor = { id: e.id, bubble: e.bubble };
    for (const key of ['rim', 'sheet'] as const) {
      if (e[key] === undefined) continue;
      if (!isHex(e[key])) return `"${key}" must be a colour like "#A9D3F7".`;
      color[key] = e[key];
    }
    if (e.backdrop !== undefined) {
      if (!colorList(e.backdrop, 2) || e.backdrop.length !== 2) return '"backdrop" must be two colours, top and bottom.';
      color.backdrop = [e.backdrop[0]!, e.backdrop[1]!];
    }
    return color;
  });

  const wrapPatterns = readList<WrapPattern>('wrap-patterns.json', raw.wrapPatterns, problems, (e) => {
    if (typeof e.shape !== 'string' || !(e.shape in shapes)) return '"shape" must be one of the names in shapes.json.';
    if (!isNumber(e.size, SIZE_LIMITS.min, SIZE_LIMITS.max))
      return `"size" must be a number from ${SIZE_LIMITS.min} to ${SIZE_LIMITS.max}.`;
    if (!isNumber(e.gap, minGap(e.size), e.size)) return `"gap" must be from ${minGap(e.size)} to ${e.size} for this size.`;
    if (!LAYOUTS.includes(e.layout as WrapLayout)) return '"layout" must be "offset" or "grid".';
    if (e.face !== undefined && typeof e.face !== 'boolean') return '"face" must be true or false.';
    return { id: e.id, shape: e.shape, size: e.size, gap: e.gap, layout: e.layout as WrapLayout, face: e.face === true };
  });

  const wands = readList<Wand>('wands.json', raw.wands, problems, (e) => {
    if (typeof e.shape !== 'string' || !(e.shape in shapes)) return '"shape" must be one of the names in shapes.json.';
    if (!colorList(e.ring, 1)) return '"ring" must be a list of one or more colours.';
    if (!isHex(e.handle)) return '"handle" must be a colour like "#C8B8F0".';
    if (!colorList(e.film, 2)) return '"film" must be a list of two or more colours.';
    return { id: e.id, shape: e.shape, ring: e.ring, handle: e.handle, film: e.film };
  });

  const faces = readList<Face>('cloud-faces.json', raw.faces, problems, (e) => {
    if (!EYE_STYLES.includes(e.eyes as EyeStyle)) return `"eyes" must be one of: ${EYE_STYLES.join(', ')}.`;
    if (!MOUTH_STYLES.includes(e.mouth as MouthStyle)) return `"mouth" must be one of: ${MOUTH_STYLES.join(', ')}.`;
    if (!isHex(e.blush)) return '"blush" must be a colour like "#F8A9C6".';
    for (const key of ['lashes', 'freckles', 'whiskers'] as const) {
      if (e[key] !== undefined && typeof e[key] !== 'boolean') return `"${key}" must be true or false.`;
    }
    return {
      id: e.id,
      eyes: e.eyes as EyeStyle,
      mouth: e.mouth as MouthStyle,
      blush: e.blush,
      lashes: e.lashes === true,
      freckles: e.freckles === true,
      whiskers: e.whiskers === true,
    };
  });

  const hats = readList<Hat>('cloud-hats.json', raw.hats, problems, (e) => {
    if (e.picture === undefined) return { id: e.id, picture: null, width: 0, x: 0, tilt: 0, sink: 0 };
    if (typeof e.picture !== 'string' || !raw.hatFiles.includes(e.picture))
      return `"picture" must be the name of a file in src/art/hats/ (${raw.hatFiles.join(', ')}).`;
    if (!isNumber(e.width, 0.1, 1)) return '"width" must be a number from 0.1 to 1.';
    if (!isNumber(e.x ?? 0, -1, 1)) return '"x" must be a number from -1 to 1.';
    if (!isNumber(e.tilt ?? 0, -45, 45)) return '"tilt" must be a number from -45 to 45.';
    if (!isNumber(e.sink ?? 0, 0, 0.6)) return '"sink" must be a number from 0 to 0.6.';
    return {
      id: e.id,
      picture: e.picture,
      width: e.width,
      x: (e.x as number | undefined) ?? 0,
      tilt: (e.tilt as number | undefined) ?? 0,
      sink: (e.sink as number | undefined) ?? 0,
    };
  });

  // The toy always needs at least one of each, even if every entry was broken.
  if (wrapColors.length === 0) wrapColors.push({ id: 'petal', bubble: '#F9B8D0' });
  if (wrapPatterns.length === 0)
    wrapPatterns.push({ id: 'classic', shape: 'circle', size: 48, gap: 12, layout: 'offset', face: false });
  if (wands.length === 0)
    wands.push({ id: 'round', shape: 'circle', ring: ['#9F88E6'], handle: '#C8B8F0', film: ['#F9A8C8', '#A9D3F7'] });
  if (faces.length === 0)
    faces.push({ id: 'classic', eyes: 'oval', mouth: 'smile', blush: '#F8A9C6', lashes: false, freckles: false, whiskers: false });
  if (!hats.some((h) => h.picture === null)) hats.unshift({ id: 'none', picture: null, width: 0, x: 0, tilt: 0, sink: 0 });

  const partial = { palette, shapes, wrapColors, wrapPatterns, wands, faces, hats };
  const unlocks = readUnlocks(raw.unlocks, partial, problems);
  return { content: { ...partial, unlocks }, problems };
}

function readUnlocks(raw: unknown, content: Omit<Content, 'unlocks'>, problems: string[]): UnlockRules {
  const where = 'unlocks.json';
  if (!isRecord(raw)) {
    problems.push(`${where} must be an object.`);
    return STARTER_FALLBACK;
  }
  const exists = new Set(allCosmeticKeys(content));
  const keyList = (name: string): string[] => {
    const value = raw[name];
    if (!Array.isArray(value)) {
      problems.push(`${where}: "${name}" must be a list of "kind/id" names.`);
      return [];
    }
    return value.filter((key): key is string => {
      const ok = typeof key === 'string' && exists.has(key);
      if (!ok) problems.push(`${where}: "${name}" names "${String(key)}", which does not exist.`);
      return ok;
    });
  };
  const starters = keyList('starters');
  const goldenOnly = keyList('goldenOnly');
  for (const key of goldenOnly) {
    if (starters.includes(key)) problems.push(`${where}: "${key}" cannot be a starter and golden-only at once.`);
  }
  for (const kind of COSMETIC_KINDS) {
    if (!starters.some((key) => key.startsWith(`${kind}/`))) {
      problems.push(`${where}: "starters" needs at least one "${kind}".`);
      const first = allCosmeticKeys(content).find((key) => key.startsWith(`${kind}/`) && !goldenOnly.includes(key));
      if (first) starters.push(first);
    }
  }
  const numbers = <T extends Record<string, number>>(name: string, fallback: T): T => {
    const value = raw[name];
    const out = { ...fallback };
    if (!isRecord(value)) {
      problems.push(`${where}: "${name}" is missing.`);
      return out;
    }
    for (const key of Object.keys(fallback) as (keyof T & string)[]) {
      const n = value[key];
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) (out as Record<string, number>)[key] = n;
      else problems.push(`${where}: "${name}.${key}" must be a number, 0 or more.`);
    }
    return out;
  };
  const pace = numbers('pace', STARTER_FALLBACK.pace);
  if (pace.first < 1 || pace.most < pace.first || pace.jitter >= 1)
    problems.push(`${where}: "pace" needs first ≥ 1, most ≥ first and jitter below 1.`);
  const golden = numbers('golden', STARTER_FALLBACK.golden);
  if (golden.every < 1) problems.push(`${where}: "golden.every" must be at least 1.`);
  const surpriseGap = typeof raw.surpriseGap === 'number' && raw.surpriseGap >= 0 ? raw.surpriseGap : STARTER_FALLBACK.surpriseGap;
  return { starters, goldenOnly, pace, golden, surpriseGap };
}

/** Every cosmetic as "kind/id", in a fixed order. */
export function allCosmeticKeys(c: Omit<Content, 'unlocks'>): string[] {
  return [
    ...c.wrapColors.map((x) => `wrap-color/${x.id}`),
    ...c.wrapPatterns.map((x) => `wrap-pattern/${x.id}`),
    ...c.wands.map((x) => `wand/${x.id}`),
    ...c.faces.map((x) => `face/${x.id}`),
    ...c.hats.map((x) => `hat/${x.id}`),
  ];
}

export function splitKey(key: string): { kind: CosmeticKind; id: string } | null {
  const slash = key.indexOf('/');
  const kind = key.slice(0, slash) as CosmeticKind;
  if (slash < 0 || !COSMETIC_KINDS.includes(kind)) return null;
  return { kind, id: key.slice(slash + 1) };
}

const loaded = readContent({
  palette: paletteJson,
  shapes: shapesJson,
  wrapColors: wrapColorsJson,
  wrapPatterns: wrapPatternsJson,
  wands: wandsJson,
  faces: facesJson,
  hats: hatsJson,
  unlocks: unlocksJson,
  hatFiles: Object.keys(hatPictures),
});

if (loaded.problems.length > 0 && typeof console !== 'undefined') {
  for (const problem of loaded.problems) console.warn(`[content] ${problem}`);
}

export const content: Content = loaded.content;
export const contentProblems: readonly string[] = loaded.problems;
export const cosmeticKeys: readonly string[] = allCosmeticKeys(content);

export const wrapColorById = (id: string) => content.wrapColors.find((c) => c.id === id);
export const wrapPatternById = (id: string) => content.wrapPatterns.find((p) => p.id === id);
export const wandById = (id: string) => content.wands.find((w) => w.id === id);
export const faceById = (id: string) => content.faces.find((f) => f.id === id);
export const hatById = (id: string) => content.hats.find((h) => h.id === id);

/** Fills in the colours a wrap colour leaves out. */
export function wrapPalette(color: WrapColor, palette: Palette = content.palette): WrapPalette {
  const rim = color.rim ?? mix(color.bubble, palette.plum, 0.3);
  const sheet = color.sheet ?? mix(color.bubble, '#FFFFFF', 0.8);
  return {
    bubble: color.bubble,
    rim,
    sheet,
    flat: mix(color.bubble, sheet, 0.45),
    backdrop: color.backdrop ?? [mix(color.bubble, '#FFFFFF', 0.74), mix(color.bubble, '#FFFFFF', 0.56)],
  };
}
