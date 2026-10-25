// Pure display: all character values and ownership come from the supplied snapshot.
export function supportText(contract) {
  return contract.status === 'not-implemented' ? '未實作' : String(contract.value);
}
function put(root, key, value) { root.querySelector(`[data-value="${key}"]`).textContent = String(value); }
function revision(root, snapshot) { root.dataset.revision = String(snapshot.revision); }
function vitals(root, s) {
  put(root, 'hp', `${s.character.resources.hp} / ${s.derived.maxHp}`);
  put(root, 'mp', `${s.character.resources.mp} / ${s.derived.maxMp}`);
  put(root, 'ac', s.derived.ac);
}
export function renderHud(root, s) {
  revision(root, s); vitals(root, s);
  put(root, 'name', s.character.identity.name); put(root, 'level', s.character.base.level);
  // Raw cumulative EXP only: no unimplemented level/progress formula or validity claim.
  put(root, 'exp', `累積 EXP ${s.character.base.experience}（等級一致性尚未驗證）`);
  put(root, 'weapon', s.derived.weapon?.template.name ?? '未穿戴武器');
}
export function renderCharacter(root, s) {
  revision(root, s); vitals(root, s);
  put(root, 'level', s.character.base.level);
  for (const key of ['mr', 'er', 'weight']) put(root, key, supportText(s.derived[key]));
  put(root, 'effects', supportText(s.derived.attributes.effects));
  for (const key of Object.keys(s.derived.attributes.base))
    put(root, key, `${s.derived.attributes.base[key]} / 裝備 ${s.derived.attributes.equipment[key]} / 合計 ${s.derived.attributes.equipmentAdjusted[key]}`);
}
export function renderEquipment(root, s) {
  revision(root, s); const doc = root.ownerDocument;
  const slots = root.querySelector('[data-slots]'), bag = root.querySelector('[data-bag]');
  slots.replaceChildren(); bag.replaceChildren();
  const node = (tag, text) => { const n = doc.createElement(tag); n.textContent = text; return n; };
  for (const [slot, id] of Object.entries(s.equipment.slots)) {
    const row = node('div', `${slot}：`); row.dataset.slotRow = slot;
    const item = s.inventory.items.find(i => i.instanceId === id);
    row.append(node('span', item ? `${item.template.name} [${id}]` : '未穿戴'));
    if (id !== null) { const b = node('button', '卸下'); b.dataset.off = slot; row.append(b); }
    slots.append(row);
  }
  for (const item of s.inventory.items) {
    const row = node('div', `${item.template.name} [${item.instanceId}]`); row.dataset.instance = item.instanceId;
    const worn = Object.entries(s.equipment.slots).find(([, id]) => id === item.instanceId);
    row.append(node('span', worn ? ` 已穿戴 ${worn[0]}` : ' 未穿戴'));
    // All slots are selectable; legality belongs exclusively to the core transaction.
    const select = doc.createElement('select');
    for (const slot of Object.keys(s.equipment.slots)) {
      const option = node('option', slot); option.value = slot; select.append(option);
    }
    if (worn) select.value = worn[0];
    const b = node('button', '穿戴／替換'); b.dataset.on = item.instanceId;
    row.append(select, b); bag.append(row);
  }
  put(root, 'count', s.inventory.ownedInstanceIds.length);
}
export function createRenderCoordinator({ renderHud, renderCharacter, renderEquipment }) {
  return snapshot => { renderHud(snapshot); renderCharacter(snapshot); renderEquipment(snapshot); };
}
