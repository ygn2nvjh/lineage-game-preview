import { check, keys, has, copyData, readonlyCopy, freezeData, failure, CoreError } from './data.mjs';
import { validateCatalog } from './catalog.mjs';
import { validateState } from './invariants.mjs';
import { deriveStats, resolveWeapon } from './derived-stats.mjs';
import { assertRevision, planEquipment } from './equipment.mjs';
import { encodeSave } from './persistence/codec.mjs';

export function createGame({ state: input, catalog: inputCatalog }) {
  const catalog = validateCatalog(copyData(inputCatalog));
  let state = freezeData(validateState(copyData(input), catalog));
  const listeners = new Set();
  let executing = false;
  function getSnapshot(characterId) {
    check(has(state.characters, characterId), 'CHARACTER_NOT_FOUND', String(characterId));
    const ids = state.inventories[characterId].ownedInstanceIds;
    return readonlyCopy({ revision: state.revision, rulesetId: state.rulesetId,
      catalogVersion: state.catalogVersion, characterId,
      character: state.characters[characterId],
      inventory: { ownedInstanceIds: ids, items: ids.map(instanceId => ({ instanceId,
        ...state.itemInstances[instanceId], template: catalog.templates[state.itemInstances[instanceId].templateId] })) },
      equipment: state.equipment[characterId], derived: deriveStats(state, catalog, characterId) });
  }
  function transact(inputCommand, unequip) {
    if (executing) return failure(new CoreError('REENTRANT_COMMAND'), state.revision);
    executing = true;
    try {
      const command = copyData(inputCommand);
      keys(command, unequip ? ['characterId', 'targetSlot', 'expectedRevision']
        : ['characterId', 'instanceId', 'targetSlot', 'expectedRevision'], 'command');
      assertRevision(command, state.revision);
      const candidate = copyData(state);
      const event = planEquipment(candidate, catalog, command, unequip);
      const derived = deriveStats(candidate, catalog, command.characterId);
      const resources = candidate.characters[command.characterId].resources;
      const before = copyData(resources);
      resources.hp = Math.min(resources.hp, derived.maxHp);
      resources.mp = Math.min(resources.mp, derived.maxMp);
      candidate.revision++;
      validateState(candidate, catalog);
      const events = [event];
      if (before.hp !== resources.hp || before.mp !== resources.mp)
        events.push({ type: 'ResourcesClamped', characterId: command.characterId, before, after: copyData(resources) });
      // All calculations and fallible data validation precede the sole assignment.
      state = freezeData(candidate);
      const notification = readonlyCopy({ revision: state.revision, events, snapshot: getSnapshot(command.characterId) });
      const notificationErrors = [];
      for (const listener of [...listeners]) {
        try {
          const returned = listener(notification);
          if (returned && typeof returned.then === 'function') {
            // Notifications are synchronous. The host must own async persistence.
            notificationErrors.push('ASYNC_SUBSCRIBER_UNSUPPORTED');
            Promise.resolve(returned).catch(() => {});
          }
        }
        catch { notificationErrors.push('SUBSCRIBER_ERROR'); }
      }
      return readonlyCopy({ ok: true, revision: state.revision, events, notificationErrors });
    } catch (error) { return failure(error, state.revision); }
    finally { executing = false; }
  }
  return Object.freeze({
    getSnapshot,
    equipItem: command => transact(command, false),
    unequipItem: command => transact(command, true),
    resolveWeapon: characterId => resolveWeapon(state, catalog, characterId),
    exportSave: () => encodeSave(state),
    subscribe(listener) {
      check(typeof listener === 'function', 'INVALID_SUBSCRIBER');
      listeners.add(listener); return () => { listeners.delete(listener); };
    }
  });
}
