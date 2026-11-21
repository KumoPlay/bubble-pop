import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { newSave } from '../progress/state';
import { unlock } from '../progress/unlocks';
import { migrateSave, normalizeState, openSave, SAVE_VERSION, SaveError, toSaveFile, type Migration } from './index';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return error instanceof SaveError ? error.code : 'other error';
  }
  return 'no error';
};

describe('opening a save', () => {
  it('gives back exactly what was saved', () => {
    const state = newSave();
    state.pops = 1234;
    unlock(state, 'wand/heart');
    state.chosen.wand = 'heart';
    state.chosen.wrapColor = 'sky';
    state.settings = { sound: 0.3, ambience: 'chimes', ambienceVolume: 0.7, haptics: false, calm: true, toy: 'cloud' };
    state.seen.installHint = true;
    const opened = openSave(JSON.parse(JSON.stringify(toSaveFile(state, 7))));
    expect(opened).toEqual({ state, rev: 7 });
  });

  it('tells saves from other KumoPlay games, and things that are not saves at all, apart', () => {
    expect(codeOf(() => openSave({ app: 'peek-a-kumo', v: 1, rev: 1, state: {} }))).toBe('other-game');
    expect(codeOf(() => openSave({ hello: 'world' }))).toBe('not-a-save');
    expect(codeOf(() => openSave(null))).toBe('not-a-save');
    expect(codeOf(() => openSave({ app: 'bubble-pop', v: 1, rev: 1, state: 'scrambled' }))).toBe('corrupt');
  });

  it('refuses a save from a newer version rather than damage it', () => {
    expect(codeOf(() => openSave({ ...toSaveFile(newSave(), 1), v: SAVE_VERSION + 1 }))).toBe('too-new');
  });
});

describe('repairing a save', () => {
  it('fills in safe values for anything missing or broken', () => {
    const state = normalizeState({
      pops: -5,
      unlocked: ['wand/heart', 42, 'NOT A KEY', 'wand/heart'],
      fresh: ['wand/heart', 'face/never-found'],
      chosen: { wand: 'heart', face: 7, wrapColor: 'Bad Id' },
      settings: { sound: 3, ambience: 'thunder', ambienceVolume: -1, haptics: 'yes', toy: 'drums' },
    });
    expect(state.pops).toBe(0);
    expect(state.unlocked.filter((k) => k === 'wand/heart')).toHaveLength(1);
    expect(state.unlocked).not.toContain('NOT A KEY');
    expect(state.fresh).toEqual(['wand/heart']);
    expect(state.chosen).toMatchObject({ wand: 'heart', face: newSave().chosen.face, wrapColor: null });
    expect(state.settings).toEqual({ sound: 1, ambience: 'off', ambienceVolume: 0, haptics: true, calm: false, toy: 'wrap' });
  });

  it('always includes the starters, even ones added by an update', () => {
    const state = normalizeState({ unlocked: [] });
    for (const key of content.unlocks.starters) expect(state.unlocked).toContain(key);
  });

  it('keeps cosmetics this version does not know, in case they come back', () => {
    const state = normalizeState({ unlocked: ['hat/space-helmet'] });
    expect(state.unlocked).toContain('hat/space-helmet');
  });
});

describe('upgrading old saves', () => {
  const file = (v: number, state: Record<string, unknown>) => ({ app: 'bubble-pop' as const, v, rev: 3, state });

  it('walks an old save through every step, without changing the original', () => {
    const table: Record<number, Migration> = {
      1: (s) => ({ ...s, popCount: undefined, pops: s.popCount }),
      2: (s) => ({ ...s, seen: { installHint: true } }),
    };
    const old = file(1, { popCount: 99 });
    const upgraded = migrateSave(old, table, 3);
    expect(upgraded.v).toBe(3);
    expect(upgraded.state).toMatchObject({ pops: 99, seen: { installHint: true } });
    expect(old.state).toEqual({ popCount: 99 });
    expect(normalizeState(upgraded.state).pops).toBe(99);
  });

  it('calls a save corrupt when a step is missing or fails', () => {
    expect(codeOf(() => migrateSave(file(1, {}), {}, 2))).toBe('corrupt');
    const broken: Record<number, Migration> = {
      1: () => {
        throw new Error('oops');
      },
    };
    expect(codeOf(() => migrateSave(file(1, {}), broken, 2))).toBe('corrupt');
    expect(codeOf(() => migrateSave(file(0, {}), {}, 1))).toBe('corrupt');
  });

  it('leaves a current save as it is', () => {
    const current = file(SAVE_VERSION, { pops: 5 });
    expect(migrateSave(current)).toEqual(current);
  });
});
