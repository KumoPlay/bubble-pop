import { content } from '../../content';
import {
  AMBIENCES,
  DEFAULT_SETTINGS,
  newSave,
  TOY_IDS,
  type Ambience,
  type SaveState,
  type ToyId,
} from '../progress/state';

/**
 * The save format version. Raise it by one whenever the shape of SaveState
 * changes, and add a matching step in migrations.ts.
 */
export const SAVE_VERSION = 1;
/** Every KumoPlay game shares one website, so each save says which game it belongs to. */
export const SAVE_APP = 'bubble-pop';

/** What is written to storage. */
export interface SaveFile {
  app: typeof SAVE_APP;
  /** Save format version this file was written with. */
  v: number;
  /** Counts up with every save. The highest number is the newest save. */
  rev: number;
  state: unknown;
}

/** 'other-game' is a save from another KumoPlay game. */
export type SaveErrorCode = 'not-a-save' | 'other-game' | 'corrupt' | 'too-new';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(code: SaveErrorCode) {
    super(`Save problem: ${code}`);
    this.name = 'SaveError';
    this.code = code;
  }
}

export function toSaveFile(state: SaveState, rev: number): SaveFile {
  return { app: SAVE_APP, v: SAVE_VERSION, rev, state };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the outer wrapper of a save. Throws SaveError when it is not one of ours. */
export function asSaveFile(raw: unknown): SaveFile {
  if (isRecord(raw) && typeof raw.app === 'string' && raw.app !== SAVE_APP) throw new SaveError('other-game');
  if (!isRecord(raw) || raw.app !== SAVE_APP) throw new SaveError('not-a-save');
  if (!Number.isInteger(raw.v) || (raw.v as number) < 0 || !isRecord(raw.state)) throw new SaveError('corrupt');
  return { app: SAVE_APP, v: raw.v as number, rev: wholeNumber(raw.rev, 0), state: raw.state };
}

function wholeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

function share(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

const KEY = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const ID = /^[a-z0-9-]+$/;

const idOr = (value: unknown, fallback: string): string => (typeof value === 'string' && ID.test(value) ? value : fallback);
const idOrNull = (value: unknown): string | null => (typeof value === 'string' && ID.test(value) ? value : null);

/**
 * Turns loaded data into a SaveState the toy can trust: missing or broken values
 * get safe defaults. Found cosmetics are never thrown away, even ones this
 * version does not know (they may come back in a later update), and starters are
 * always included. Throws SaveError('corrupt') only when there is nothing to work with.
 */
export function normalizeState(raw: unknown): SaveState {
  if (!isRecord(raw)) throw new SaveError('corrupt');
  const save = newSave(content.unlocks);

  save.pops = wholeNumber(raw.pops, 0);
  if (Array.isArray(raw.unlocked)) {
    for (const key of raw.unlocked) {
      if (typeof key === 'string' && KEY.test(key) && !save.unlocked.includes(key)) save.unlocked.push(key);
    }
  }
  if (Array.isArray(raw.fresh)) {
    save.fresh = [...new Set(raw.fresh.filter((key): key is string => typeof key === 'string' && save.unlocked.includes(key)))];
  }

  const chosen = isRecord(raw.chosen) ? raw.chosen : {};
  save.chosen = {
    wrapColor: idOrNull(chosen.wrapColor),
    wrapPattern: idOrNull(chosen.wrapPattern),
    wand: idOr(chosen.wand, save.chosen.wand),
    face: idOr(chosen.face, save.chosen.face),
    hat: idOr(chosen.hat, save.chosen.hat),
  };

  const settings = isRecord(raw.settings) ? raw.settings : {};
  save.settings = {
    sound: share(settings.sound, DEFAULT_SETTINGS.sound),
    ambience: AMBIENCES.includes(settings.ambience as Ambience) ? (settings.ambience as Ambience) : DEFAULT_SETTINGS.ambience,
    ambienceVolume: share(settings.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume),
    haptics: settings.haptics !== false,
    calm: settings.calm === true,
    toy: TOY_IDS.includes(settings.toy as ToyId) ? (settings.toy as ToyId) : DEFAULT_SETTINGS.toy,
  };

  const seen = isRecord(raw.seen) ? raw.seen : {};
  save.seen = { installHint: seen.installHint === true };
  return save;
}
