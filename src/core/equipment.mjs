import { check, has, integer, text, SLOTS, SLOT_TYPES } from './data.mjs';

export function assertSlot(slot) { check(SLOTS.includes(slot), 'INVALID_SLOT', String(slot)); }
export function assertWearable(character, instance, template, slot) {
  const allowed = template.category === 'weapon' ? ['weapon']
    : template.category === 'armor' ? SLOT_TYPES[template.type] ?? [] : [];
  check(allowed.includes(slot), 'INCOMPATIBLE_SLOT', slot);
  check(template.use_knight === 1, 'CLASS_RESTRICTED');
  check(character.base.level >= (template.min_lvl ?? 0) &&
    (!(template.max_lvl > 0) || character.base.level <= template.max_lvl), 'LEVEL_RESTRICTED');
  check(instance.quantity === 1, 'STACK_EQUIP_UNSUPPORTED', 'Explicit individual instances required');
  // Do not silently introduce L1J two-hand/shield, curses or set rules absent in legacy transact().
}

export function planEquipment(state, catalog, command, unequip = false) {
  text(command.characterId, 'command.characterId');
  check(has(state.characters, command.characterId), 'CHARACTER_NOT_FOUND');
  assertSlot(command.targetSlot);
  const c = state.characters[command.characterId], slots = state.equipment[command.characterId].slots;
  const previous = slots[command.targetSlot];
  if (unequip) {
    check(previous !== null, 'SLOT_EMPTY');
    slots[command.targetSlot] = null;
    return { type: 'ItemUnequipped', characterId: command.characterId,
      slot: command.targetSlot, instanceId: previous };
  }
  text(command.instanceId, 'command.instanceId');
  check(has(state.itemInstances, command.instanceId), 'ITEM_NOT_FOUND');
  check(state.inventories[command.characterId].ownedInstanceIds.includes(command.instanceId), 'ITEM_NOT_OWNED');
  check(!Object.values(slots).includes(command.instanceId), 'ITEM_ALREADY_EQUIPPED');
  const instance = state.itemInstances[command.instanceId];
  assertWearable(c, instance, catalog.templates[instance.templateId], command.targetSlot);
  slots[command.targetSlot] = command.instanceId;
  return { type: previous === null ? 'ItemEquipped' : 'ItemReplaced',
    characterId: command.characterId, slot: command.targetSlot,
    instanceId: command.instanceId, previousInstanceId: previous };
}

export function assertRevision(command, revision) {
  integer(command.expectedRevision, 'command.expectedRevision');
  check(command.expectedRevision === revision, 'STALE_REVISION', `expected ${revision}`);
}
