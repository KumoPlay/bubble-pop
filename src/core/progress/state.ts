/**
 * Everything the toy remembers between visits: settings, the cosmetics found and
 * chosen, and how many pops so far. Nothing else is saved (not even the sheet of
 * bubble wrap you were popping).
 */
import { content, splitKey, type CosmeticKind, type UnlockRules } from '../../content';

export type ToyId = 'wrap' | 'soap' | 'cloud';
export const TOY_IDS: readonly ToyId[] = ['wrap', 'soap', 'cloud'];

export type Ambience = 'off' | 'breeze' | 'chimes';
export const AMBIENCES: readonly Ambience[] = ['off', 'breeze', 'chimes'];

export interface Settings {
  /** Effects volume, 0 to 1. */
  sound: number;
  /** Calm background sound, off unless chosen. */
  ambience: Ambience;
  ambienceVolume: number;
  /** Little buzzes on pops (where the phone can). */
  haptics: boolean;
  /** Always calm motion, even if the device does not ask for it. */
  calm: boolean;
  /** The toy that was open last time. */
  toy: ToyId;
}

/** The cosmetics in use. For bubble wrap, null means "mix them all". */
export interface Chosen {
  wrapColor: string | null;
  wrapPattern: string | null;
  wand: string;
  face: string;
  hat: string;
}

export interface SaveState {
  pops: number;
  /** Cosmetics found, as "kind/id". */
  unlocked: string[];
  /** Found but not looked at in the collection yet (they get a little dot). */
  fresh: string[];
  chosen: Chosen;
  settings: Settings;
  seen: { installHint: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  sound: 0.8,
  ambience: 'off',
  ambienceVolume: 0.5,
  haptics: true,
  calm: false,
  toy: 'wrap',
};

/** The first starter of a kind (for example the round wand). */
export function starterOf(kind: CosmeticKind, rules: UnlockRules = content.unlocks): string {
  const key = rules.starters.find((k) => k.startsWith(`${kind}/`));
  return key ? key.slice(kind.length + 1) : '';
}

export function newSave(rules: UnlockRules = content.unlocks): SaveState {
  return {
    pops: 0,
    unlocked: [...rules.starters],
    fresh: [],
    chosen: {
      wrapColor: null,
      wrapPattern: null,
      wand: starterOf('wand', rules),
      face: starterOf('face', rules),
      hat: starterOf('hat', rules),
    },
    settings: { ...DEFAULT_SETTINGS },
    seen: { installHint: false },
  };
}

const CHOSEN_KIND: Record<keyof Chosen, CosmeticKind> = {
  wrapColor: 'wrap-color',
  wrapPattern: 'wrap-pattern',
  wand: 'wand',
  face: 'face',
  hat: 'hat',
};

/** The kind of cosmetic each choice is about. */
export function kindOfChoice(choice: keyof Chosen): CosmeticKind {
  return CHOSEN_KIND[choice];
}

export function choiceOfKind(kind: CosmeticKind): keyof Chosen {
  return (Object.keys(CHOSEN_KIND) as (keyof Chosen)[]).find((key) => CHOSEN_KIND[key] === kind)!;
}

/**
 * The cosmetics to actually use: a choice that is not found yet, or no longer
 * exists after an update, falls back to the starter.
 */
export function usableChoices(state: SaveState, existing: ReadonlySet<string>): Chosen {
  const ok = (kind: CosmeticKind, id: string | null) =>
    id !== null && state.unlocked.includes(`${kind}/${id}`) && existing.has(`${kind}/${id}`);
  const pick = (choice: keyof Chosen): string => {
    const kind = kindOfChoice(choice);
    const id = state.chosen[choice];
    return ok(kind, id) ? id! : starterOf(kind);
  };
  return {
    wrapColor: ok('wrap-color', state.chosen.wrapColor) ? state.chosen.wrapColor : null,
    wrapPattern: ok('wrap-pattern', state.chosen.wrapPattern) ? state.chosen.wrapPattern : null,
    wand: pick('wand'),
    face: pick('face'),
    hat: pick('hat'),
  };
}

/** Found cosmetic ids of one kind that exist in this version, in content order. */
export function unlockedOfKind(state: SaveState, kind: CosmeticKind, existing: readonly string[]): string[] {
  return existing
    .filter((key) => key.startsWith(`${kind}/`) && state.unlocked.includes(key))
    .map((key) => splitKey(key)!.id);
}
