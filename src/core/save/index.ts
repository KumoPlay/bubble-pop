import type { SaveState } from '../progress/state';
import { migrateSave } from './migrations';
import { asSaveFile, normalizeState } from './schema';

export { migrateSave, migrations, type Migration } from './migrations';
export { asSaveFile, normalizeState, SAVE_APP, SAVE_VERSION, SaveError, toSaveFile } from './schema';
export type { SaveErrorCode, SaveFile } from './schema';

export interface OpenedSave {
  state: SaveState;
  rev: number;
}

/** Stored data → a ready SaveState: check, upgrade old versions, repair. Throws SaveError. */
export function openSave(raw: unknown): OpenedSave {
  const file = migrateSave(asSaveFile(raw));
  return { state: normalizeState(file.state), rev: file.rev };
}
