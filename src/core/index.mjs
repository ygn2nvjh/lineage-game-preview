export { createGame } from './game.mjs';
export { createItemCatalog } from './catalog.mjs';
export { deriveStats, resolveWeapon } from './derived-stats.mjs';
export { migrateLegacySave } from './persistence/migrations.mjs';
export { SLOTS, STATS, RULESET_ID, CoreError } from './data.mjs';
export { provenance } from './rules/legacy-v0583.mjs';

import { copyData, failure } from './data.mjs';
import { validateCatalog } from './catalog.mjs';
import { decodeSave } from './persistence/codec.mjs';
import { createGame } from './game.mjs';

export function createGameFromSave(envelope, { catalog }) {
  try {
    const normalized = validateCatalog(copyData(catalog));
    return Object.freeze({ ok: true, game: createGame({ state: decodeSave(envelope, normalized), catalog: normalized }) });
  } catch (error) { return failure(error); }
}
