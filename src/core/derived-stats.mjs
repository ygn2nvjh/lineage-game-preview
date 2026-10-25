import { check, has, readonlyCopy, STATS, SUM_FIELDS } from './data.mjs';
import { legacyCapacities, legacyAc, checkedDerived } from './rules/legacy-v0583.mjs';

function character(state, characterId) {
  check(has(state.characters, characterId), 'CHARACTER_NOT_FOUND', characterId);
  return state.characters[characterId];
}
export function resolveWeapon(state, catalog, characterId) {
  character(state, characterId);
  const instanceId = state.equipment[characterId].slots.weapon;
  if (instanceId === null) return null;
  check(has(state.itemInstances, instanceId), 'ITEM_NOT_FOUND', instanceId);
  const instance = state.itemInstances[instanceId];
  check(has(catalog.templates, String(instance.templateId)), 'TEMPLATE_NOT_FOUND');
  const template = catalog.templates[instance.templateId];
  check(template.category === 'weapon', 'NOT_A_WEAPON');
  return readonlyCopy({ instanceId, ...instance, template });
}

export function deriveStats(state, catalog, characterId) {
  const c = character(state, characterId);
  const equipment = Object.fromEntries(SUM_FIELDS.map(k => [k, 0]));
  for (const id of Object.values(state.equipment[characterId].slots)) {
    if (id === null) continue;
    check(has(state.itemInstances, id), 'ITEM_NOT_FOUND', id);
    const instance = state.itemInstances[id];
    check(has(catalog.templates, String(instance.templateId)), 'TEMPLATE_NOT_FOUND');
    const template = catalog.templates[instance.templateId];
    for (const key of SUM_FIELDS)
      equipment[key] = checkedDerived(equipment[key] + (template[key] ?? 0), key);
  }
  const equipmentStats = Object.fromEntries(STATS.map(k => [k, equipment[`add_${k}`]]));
  const equipmentAdjusted = Object.fromEntries(STATS.map(k => [k,
    checkedDerived(c.base.stats[k] + equipmentStats[k], `equipmentAdjusted.${k}`)]));
  const capacities = legacyCapacities(c.base, equipment);
  for (const [key, value] of Object.entries(capacities)) checkedDerived(value, key);
  const pending = (reason, inputs) => ({ status: 'not-implemented', value: null, reason, inputs });
  return readonlyCopy({
    attributes: { original: c.originalStats, base: c.base.stats, equipment: equipmentStats,
      equipmentAdjusted, effects: pending('Effect evaluation/stacking rules are not adopted in 0B-2', c.effects) },
    equipmentBonuses: equipment,
    ...capacities,
    ac: checkedDerived(legacyAc(c.base, c.originalStats, equipment), 'ac'),
    dr: { status: 'implemented-legacy', raw: equipment.damage_reduction,
      value: Math.max(0, Math.trunc(equipment.damage_reduction)) },
    mr: pending('Legacy HUD differs from L1J; no formula replacement in 0B-2', {
      baseWis: c.base.stats.wis, originalWis: c.originalStats.wis, level: c.base.level,
      equipmentDirectMr: equipment.m_def, equipmentWis: equipment.add_wis, effects: c.effects }),
    er: pending('ER effect inputs require an explicit adapter; no implicit effect evaluation', {
      level: c.base.level, originalDex: c.originalStats.dex, baseDex: c.base.stats.dex,
      equipmentDex: equipment.add_dex, effects: c.effects }),
    weight: pending('Full inventory/currency mapping differs from legacy partial weight; contract only', {
      baseStr: c.base.stats.str, baseCon: c.base.stats.con, equipmentStr: equipment.add_str,
      equipmentCon: equipment.add_con, equipmentWeightReduction: equipment.weight_reduction,
      wallet: c.wallet, effects: c.effects,
      items: state.inventories[characterId].ownedInstanceIds.map(instanceId => {
        const item = state.itemInstances[instanceId];
        return { instanceId, quantity: item.quantity, sqlWeight: catalog.templates[item.templateId].weight };
      }) }),
    weapon: resolveWeapon(state, catalog, characterId)
  });
}
