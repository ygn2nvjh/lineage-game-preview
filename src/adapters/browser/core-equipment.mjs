import { createGame, SLOTS, RULESET_ID } from '../../core/index.mjs';
import { copyData, readonlyCopy, check, has, SLOT_TYPES } from '../../core/data.mjs';
import { loadItemCatalog, loadEquipmentScenarios } from './item-catalog.mjs';

const LABELS = Object.freeze({ weapon: '武器', head: '頭盔', neck: '項鍊', earring: '耳環',
  shirt: '襯衫', body: '盔甲', shield: '盾牌', cloak: '披風', hands: '手套', feet: '長靴',
  ring1: '戒指①', ring2: '戒指②', belt: '腰帶', guarder: '臂甲' });

// Only initialization of an explicitly declared test scenario, never old-save migration.
export function createScenarioState(definition, scenarioId, catalog) {
  check(definition.catalogVersion === catalog.version, 'SCENARIO_CATALOG_MISMATCH');
  const scenario = definition.scenarios.find(s => s.id === scenarioId);
  check(scenario, 'SCENARIO_NOT_FOUND', scenarioId);
  check(has(scenario.actors, 'hero'), 'SCENARIO_HERO_REQUIRED');
  const state = { schemaVersion: 1, revision: 0, rulesetId: RULESET_ID, catalogVersion: catalog.version,
    characters: {}, itemInstances: {}, inventories: {}, equipment: {} };
  for (const [id, profile] of Object.entries(scenario.actors)) {
    check(has(definition.profiles, profile), 'SCENARIO_PROFILE_NOT_FOUND', profile);
    state.characters[id] = copyData(definition.profiles[profile]);
    state.inventories[id] = { ownedInstanceIds: [] };
    state.equipment[id] = { slots: Object.fromEntries(SLOTS.map(s => [s, null])) };
  }
  for (const item of scenario.items) {
    check(!has(state.itemInstances, item.instanceId), 'SCENARIO_DUPLICATE_INSTANCE', item.instanceId);
    check(has(state.inventories, item.owner), 'SCENARIO_OWNER_NOT_FOUND', item.owner);
    check(has(catalog.templates, String(item.templateId)), 'SCENARIO_TEMPLATE_NOT_FOUND', String(item.templateId));
    state.itemInstances[item.instanceId] = { templateId: item.templateId, quantity: 1, enchantLevel: 0, durability: 0 };
    state.inventories[item.owner].ownedInstanceIds.push(item.instanceId);
  }
  const occupied = new Set();
  for (const item of scenario.equipment) {
    const key = `${item.characterId}/${item.slot}`;
    check(!occupied.has(key), 'SCENARIO_DUPLICATE_SLOT', key); occupied.add(key);
    check(has(state.equipment, item.characterId) && SLOTS.includes(item.slot), 'SCENARIO_SLOT_NOT_FOUND', key);
    state.equipment[item.characterId].slots[item.slot] = item.instanceId;
  }
  return state;
}

// View callbacks only receive readonly snapshots/results. createCore is a test seam,
// used to verify subscription cleanup with the actual core, not an alternate state store.
export function createEquipmentController({ catalog, definition, onSnapshot = () => {}, onResult = () => {}, createCore = createGame }) {
  const fixed = readonlyCopy(definition);
  let game = null, current = null, unsubscribe = () => {}, generation = 0, disposed = false;
  function active() { check(!disposed && game, 'ADAPTER_NOT_ACTIVE'); }
  function report(result) { onResult(result); return result; }
  function loadScenario(id) {
    check(!disposed, 'ADAPTER_DISPOSED');
    const next = createCore({ state: createScenarioState(fixed, id, catalog), catalog });
    // Validate/create first; a failed scene load leaves the current scene subscribed.
    unsubscribe(); generation++; const ownGeneration = generation;
    game = next; current = fixed.scenarios.find(s => s.id === id);
    unsubscribe = game.subscribe(note => {
      if (!disposed && generation === ownGeneration) onSnapshot(note.snapshot);
    });
    onSnapshot(game.getSnapshot('hero'));
    return report(readonlyCopy({ ok: true, kind: 'scene', scenarioId: id, revision: 0 }));
  }
  function equip(instanceId, targetSlot, expectedRevision) {
    active();
    return report(game.equipItem({ characterId: 'hero', instanceId, targetSlot,
      expectedRevision: expectedRevision ?? game.getSnapshot('hero').revision }));
  }
  function unequip(targetSlot, expectedRevision) {
    active();
    return report(game.unequipItem({ characterId: 'hero', targetSlot,
      expectedRevision: expectedRevision ?? game.getSnapshot('hero').revision }));
  }
  return Object.freeze({ loadScenario, equip, unequip,
    getSnapshot() { active(); return game.getSnapshot('hero'); },
    getScenario() { active(); return current; },
    render() { active(); onSnapshot(game.getSnapshot('hero')); },
    runCheck(index) { active(); const operation = current.checks[index];
      check(operation, 'SCENARIO_CHECK_NOT_FOUND'); return equip(operation.instanceId, operation.targetSlot); },
    dispose() { if (!disposed) { disposed = true; generation++; unsubscribe(); } }
  });
}

export function mountEquipmentTest(root, { catalog, definition }) {
  const doc = root.ownerDocument, select = root.querySelector('[data-role="scenario"]');
  const field = name => root.querySelector(`[data-field="${name}"]`);
  const element = (tag, text) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = String(text); return node; };
  for (const scenario of definition.scenarios) {
    const option = element('option', scenario.label); option.value = scenario.id; select.appendChild(option);
  }
  function render(snapshot) {
    root.dataset.revision = String(snapshot.revision);
    field('revision').textContent = String(snapshot.revision);
    field('identity').textContent = `${snapshot.character.identity.name}・騎士 Lv.${snapshot.character.base.level}`;
    field('hp').textContent = `${snapshot.character.resources.hp} / ${snapshot.derived.maxHp}`;
    field('mp').textContent = `${snapshot.character.resources.mp} / ${snapshot.derived.maxMp}`;
    field('ac').textContent = String(snapshot.derived.ac);
    field('dr').textContent = String(snapshot.derived.dr.value);
    for (const key of ['mr', 'er', 'weight']) {
      const contract = snapshot.derived[key];
      field(key).textContent = contract.status === 'not-implemented' || contract.value === null ? '未實作' : String(contract.value);
    }
    const attrs = snapshot.derived.attributes;
    field('attributes').textContent = Object.keys(attrs.base).map(k =>
      `${k.toUpperCase()} 原始${attrs.original[k]}／基礎${attrs.base[k]}／裝備${attrs.equipment[k]}／裝備後投影${attrs.equipmentAdjusted[k]}`).join('\n');
    const bonuses = Object.entries(snapshot.derived.equipmentBonuses).filter(([, v]) => v !== 0);
    field('bonuses').textContent = bonuses.length ? bonuses.map(([k, v]) => `${k} ${v}`).join('｜') : '無裝備加成';
    const weapon = snapshot.derived.weapon;
    field('weapon').textContent = weapon ? `${weapon.template.name}｜實例 ${weapon.instanceId}｜模板 ${weapon.templateId}｜強化 ${weapon.enchantLevel}｜損傷 ${weapon.durability}` : '未穿戴武器（無測試武器備援）';
    const slots = field('slots'); slots.replaceChildren();
    for (const [slot, instanceId] of Object.entries(snapshot.equipment.slots)) {
      const row = element('div'); row.dataset.slot = slot;
      const item = snapshot.inventory.items.find(x => x.instanceId === instanceId);
      row.appendChild(element('span', `${LABELS[slot]}：${item ? `${item.template.name} [${item.instanceId}]` : '未穿戴'} `));
      if (item) { const off = element('button', '卸下'); off.type = 'button'; off.dataset.action = 'unequip'; off.dataset.slot = slot; row.appendChild(off); }
      slots.appendChild(row);
    }
    const bag = field('inventory'); bag.replaceChildren();
    for (const item of snapshot.inventory.items) {
      const row = element('div'); row.className = 'gearBagRow'; row.dataset.instanceId = item.instanceId;
      const wearing = Object.entries(snapshot.equipment.slots).find(([, id]) => id === item.instanceId);
      row.appendChild(element('span', `${item.template.name} #${item.templateId}｜實例 ${item.instanceId}｜${wearing ? `已穿戴 ${LABELS[wearing[0]]}` : '未穿戴'}`));
      const target = element('select'); target.dataset.role = 'target-slot'; target.setAttribute('aria-label', `${item.instanceId} 目標裝備槽`);
      const placeholder = element('option', '選擇目標槽'); placeholder.value = ''; target.appendChild(placeholder);
      for (const slot of SLOTS) { const option = element('option', LABELS[slot]); option.value = slot; target.appendChild(option); }
      // Unique non-ring positions have a natural default; rings always require an explicit choice.
      if (item.template.category === 'weapon') target.value = 'weapon';
      else if (item.template.type !== 'ring') target.value = SLOT_TYPES[item.template.type]?.[0] ?? '';
      row.appendChild(target);
      const button = element('button', '穿戴／替換'); button.type = 'button'; button.dataset.action = 'equip'; row.appendChild(button);
      bag.appendChild(row);
    }
    if (!snapshot.inventory.items.length) bag.appendChild(element('p', '無持有物品'));
    field('count').textContent = String(snapshot.inventory.items.length);
  }
  function result(value) {
    const output = field('result'); output.dataset.ok = String(value.ok);
    output.textContent = value.ok ? value.kind === 'scene' ? '已載入固定測試場景（未讀寫正式角色）' : `操作成功，revision ${value.revision}`
      : `${value.error.code}：${value.error.message}`;
  }
  const controller = createEquipmentController({ catalog, definition, onSnapshot: render, onResult: result });
  function switchScene() {
    try {
      controller.loadScenario(select.value); root.dataset.scenario = select.value;
      field('description').textContent = controller.getScenario().description;
      const checks = field('checks'); checks.replaceChildren();
      controller.getScenario().checks.forEach((check, index) => {
        const b = element('button', check.label); b.type = 'button'; b.dataset.action = 'check'; b.dataset.index = String(index); checks.appendChild(b);
      });
    } catch (error) { result({ ok: false, error: { code: error.code ?? 'SCENE_LOAD_FAILED', message: error.message } }); }
  }
  function click(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.action === 'reset') return switchScene();
    if (button.dataset.action === 'unequip') return controller.unequip(button.dataset.slot);
    if (button.dataset.action === 'check') return controller.runCheck(Number(button.dataset.index));
    if (button.dataset.action === 'equip') {
      const row = button.closest('[data-instance-id]'), slot = row.querySelector('select').value;
      if (!slot) return result({ ok: false, error: { code: 'TARGET_SLOT_REQUIRED', message: '請明確選擇裝備槽；戒指不自動選槽' } });
      controller.equip(row.dataset.instanceId, slot);
    }
  }
  root.addEventListener('click', click); select.addEventListener('change', switchScene);
  select.value = definition.scenarios[0].id; switchScene();
  field('catalog').textContent = catalog.version; root.dataset.status = 'ready';
  select.disabled = false; root.querySelector('[data-action="reset"]').disabled = false;
  return Object.freeze({ ...controller, dispose() {
    controller.dispose(); root.removeEventListener('click', click); select.removeEventListener('change', switchScene);
  } });
}

export async function startEquipmentPage(root, { fetcher = globalThis.fetch } = {}) {
  root.dataset.status = 'loading';
  root.querySelector('[data-field="result"]').textContent = '正在驗證固定來源與內容指紋…';
  try {
    const [catalog, definition] = await Promise.all([loadItemCatalog({ fetcher }), loadEquipmentScenarios({ fetcher })]);
    return mountEquipmentTest(root, { catalog, definition });
  } catch (error) {
    root.dataset.status = 'error'; root.querySelector('[data-field="result"]').textContent = `${error.code ?? 'LOAD_FAILED'}：${error.message}`;
    throw error;
  }
}
