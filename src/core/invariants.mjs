import { check, keys, record, has, integer, text, STATS, SLOTS, RULESET_ID } from './data.mjs';
import { assertWearable } from './equipment.mjs';
import { deriveStats } from './derived-stats.mjs';

function stats(value, label) {
  keys(value, STATS, label);
  for (const key of STATS) integer(value[key], `${label}.${key}`, 1);
}
export function validateState(state, catalog) {
  keys(state, ['schemaVersion', 'revision', 'rulesetId', 'catalogVersion',
    'characters', 'itemInstances', 'inventories', 'equipment'], 'state');
  check(state.schemaVersion === 1, 'UNSUPPORTED_STATE_VERSION');
  check(state.rulesetId === RULESET_ID, 'UNSUPPORTED_RULESET');
  check(state.catalogVersion === catalog.version, 'CATALOG_VERSION_MISMATCH');
  integer(state.revision, 'revision');
  for (const key of ['characters', 'itemInstances', 'inventories', 'equipment']) record(state[key], key);
  // Validate instance records before dereferencing them from inventory/equipment.
  for (const [id, item] of Object.entries(state.itemInstances)) {
    text(id, 'instanceId');
    keys(item, ['templateId', 'quantity', 'enchantLevel', 'durability'], `item.${id}`);
    integer(item.templateId, 'templateId', 1); integer(item.quantity, 'quantity', 1);
    integer(item.enchantLevel, 'enchantLevel'); integer(item.durability, 'durability');
    check(has(catalog.templates, String(item.templateId)), 'TEMPLATE_NOT_FOUND', String(item.templateId));
  }
  const owners = new Map();
  for (const [id, c] of Object.entries(state.characters)) {
    text(id, 'characterId');
    keys(c, ['identity', 'originalStats', 'base', 'resources', 'effects', 'wallet', 'history'], id);
    keys(c.identity, ['name', 'characterClass', 'sex', 'createdAt'], `${id}.identity`);
    text(c.identity.name, 'name'); text(c.identity.sex, 'sex');
    if (has(c.identity, 'createdAt')) integer(c.identity.createdAt, 'createdAt');
    check(c.identity.characterClass === 'knight', 'UNSUPPORTED_CLASS');
    check(has(c, 'originalStats'), 'MISSING_ORIGINAL_STATS', id);
    stats(c.originalStats, 'originalStats');
    keys(c.base, ['stats', 'level', 'experience', 'hpCapacity', 'mpCapacity'], `${id}.base`);
    stats(c.base.stats, 'base.stats'); integer(c.base.level, 'level', 1, 99);
    integer(c.base.experience, 'experience'); integer(c.base.hpCapacity, 'hpCapacity', 1);
    integer(c.base.mpCapacity, 'mpCapacity');
    keys(c.resources, ['hp', 'mp'], 'resources');
    integer(c.resources.hp, 'hp'); integer(c.resources.mp, 'mp');
    check(Array.isArray(c.effects), 'INVALID_EFFECTS');
    const effectIds = new Set();
    for (const effect of c.effects) {
      keys(effect, ['effectId', 'kind', 'data'], 'effect');
      text(effect.effectId, 'effectId'); text(effect.kind, 'effect.kind'); record(effect.data, 'effect.data');
      check(!effectIds.has(effect.effectId), 'DUPLICATE_EFFECT'); effectIds.add(effect.effectId);
    }
    keys(c.wallet, ['adena'], 'wallet'); integer(c.wallet.adena, 'wallet.adena');
    keys(c.history, ['lossRecords'], 'history');
    check(Array.isArray(c.history.lossRecords), 'INVALID_HISTORY');
    check(has(state.inventories, id) && has(state.equipment, id), 'MISSING_CHARACTER_COLLECTION', id);
    keys(state.inventories[id], ['ownedInstanceIds'], 'inventory');
    const owned = state.inventories[id].ownedInstanceIds;
    check(Array.isArray(owned), 'INVALID_INVENTORY');
    for (const instanceId of owned) {
      text(instanceId, 'ownedInstanceId');
      check(!owners.has(instanceId), 'DUPLICATE_OWNERSHIP', instanceId);
      check(has(state.itemInstances, instanceId), 'ITEM_NOT_FOUND', instanceId);
      owners.set(instanceId, id);
    }
    keys(state.equipment[id], ['slots'], 'equipment');
    keys(state.equipment[id].slots, SLOTS, 'slots');
    const equipped = new Set();
    for (const slot of SLOTS) {
      check(has(state.equipment[id].slots, slot), 'MISSING_SLOT', slot);
      const instanceId = state.equipment[id].slots[slot];
      if (instanceId === null) continue;
      text(instanceId, 'equippedInstanceId');
      check(owned.includes(instanceId), 'ITEM_NOT_OWNED', instanceId);
      check(!equipped.has(instanceId), 'DUPLICATE_EQUIPMENT', instanceId); equipped.add(instanceId);
      const item = state.itemInstances[instanceId];
      check(has(catalog.templates, String(item.templateId)), 'TEMPLATE_NOT_FOUND');
      assertWearable(c, item, catalog.templates[item.templateId], slot);
    }
  }
  for (const key of ['inventories', 'equipment']) for (const id of Object.keys(state[key]))
    check(has(state.characters, id), 'ORPHAN_CHARACTER_COLLECTION', id);
  for (const [id, item] of Object.entries(state.itemInstances)) {
    check(owners.has(id), 'MISSING_OWNERSHIP', id);
    // Preserve the legacy spendable coins ledger; do not double-count a second currency representation.
    check(item.templateId !== 40308, 'CURRENCY_REPRESENTATION_CONFLICT', 'Use wallet.adena; reconcile legacy evidence explicitly');
  }
  for (const [id, c] of Object.entries(state.characters)) {
    const d = deriveStats(state, catalog, id);
    check(c.resources.hp <= d.maxHp && c.resources.mp <= d.maxMp, 'RESOURCE_OUT_OF_RANGE', id);
  }
  return state;
}
