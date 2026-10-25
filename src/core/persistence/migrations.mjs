import { check, has, keys, record, copyData, failure, readonlyCopy, SLOTS, RULESET_ID } from '../data.mjs';
import { validateCatalog } from '../catalog.mjs';
import { validateState } from '../invariants.mjs';
import { deriveStats } from '../derived-stats.mjs';
import { encodeSave } from './codec.mjs';

// Pure migration. A raw v0583 localStorage character lacks live inventory/resources;
// require explicit captured evidence rather than fabricate those missing fields.
export function migrateLegacySave(rawInput, evidenceInput, catalogInput) {
  try {
    const raw = copyData(rawInput);
    record(raw, 'legacy');
    check(!has(raw, 'saveVersion'), 'UNSUPPORTED_LEGACY_FORMAT');
    keys(raw, ['name', 'sex', 'stats', 'originalStats', 'level', 'exp', 'baseMaxHp', 'baseMaxMp',
      'coins', 'lossRecords', 'createdAt', 'equipmentBonuses'], 'legacy');
    check(has(raw, 'originalStats'), 'MISSING_ORIGINAL_STATS');
    check(evidenceInput !== undefined, 'LEGACY_EVIDENCE_REQUIRED', 'Live resources, item ownership, equipment and effects are not saved in the old character key');
    const evidence = copyData(evidenceInput);
    keys(evidence, ['characterId', 'resources', 'itemInstances', 'inventory', 'equipment', 'effects', 'adenaEvidence'], 'legacyEvidence');
    const catalog = validateCatalog(copyData(catalogInput));
    const id = evidence.characterId;
    check(typeof id === 'string' && id.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(id), 'INVALID_CHARACTER_ID');
    for (const k of ['resources', 'itemInstances', 'inventory', 'equipment', 'effects'])
      check(has(evidence, k), 'LEGACY_EVIDENCE_REQUIRED', k);
    if (has(evidence, 'adenaEvidence')) check(raw.coins === evidence.adenaEvidence, 'LEGACY_CURRENCY_CONFLICT');
    const identity = { name: raw.name, sex: raw.sex, characterClass: 'knight' };
    if (has(raw, 'createdAt')) identity.createdAt = raw.createdAt;
    const state = { schemaVersion: 1, revision: 0, rulesetId: RULESET_ID, catalogVersion: catalog.version,
      characters: { [id]: { identity, originalStats: raw.originalStats,
        base: { stats: raw.stats, level: raw.level, experience: raw.exp,
          hpCapacity: raw.baseMaxHp, mpCapacity: raw.baseMaxMp },
        resources: evidence.resources, effects: evidence.effects,
        wallet: { adena: raw.coins }, history: { lossRecords: raw.lossRecords } } },
      itemInstances: evidence.itemInstances, inventories: { [id]: evidence.inventory },
      equipment: { [id]: evidence.equipment } };
    // Slot omissions are missing evidence, not permission to invent empty slots.
    record(evidence.equipment, 'legacyEvidence.equipment');
    record(evidence.equipment.slots, 'legacyEvidence.equipment.slots');
    for (const slot of SLOTS) check(has(evidence.equipment.slots, slot), 'MISSING_SLOT', slot);
    validateState(state, catalog);
    if (has(raw, 'equipmentBonuses')) {
      const expected = deriveStats(state, catalog, id).equipmentBonuses;
      const mapping = { str: 'add_str', dex: 'add_dex', con: 'add_con', int: 'add_int', wis: 'add_wis', cha: 'add_cha',
        hp: 'add_hp', mp: 'add_mp', hpr: 'add_hpr', mpr: 'add_mpr', mr: 'm_def' };
      keys(raw.equipmentBonuses, Object.keys(mapping), 'legacy.equipmentBonuses');
      for (const [key, value] of Object.entries(raw.equipmentBonuses))
        check(value === expected[mapping[key]], 'LEGACY_BONUS_CONFLICT', key);
    }
    return readonlyCopy({ ok: true, save: encodeSave(state) });
  } catch (error) { return failure(error); }
}
