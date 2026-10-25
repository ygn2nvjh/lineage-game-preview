import { createEquipmentController } from './core-equipment.mjs';
import { loadItemCatalog, loadEquipmentScenarios } from './item-catalog.mjs';
import { createRenderCoordinator, renderHud, renderCharacter, renderEquipment } from './character-views.mjs';

export function createHudController(options) {
  const { views, ...rest } = options;
  return createEquipmentController({ ...rest, onSnapshot: createRenderCoordinator(views) });
}
export async function startHudIntegration(root, { fetcher = globalThis.fetch } = {}) {
  const scenario = root.querySelector('[data-scenario]'), result = root.querySelector('[data-result]');
  const controls = root.querySelector('[data-controls]');
  let controller;
  try {
    const [catalog, definition] = await Promise.all([loadItemCatalog({ fetcher }), loadEquipmentScenarios({ fetcher })]);
    const hud = root.querySelector('[data-hud]'), character = root.querySelector('[data-character]'), gear = root.querySelector('[data-equipment]');
    controller = createHudController({ catalog, definition, views: {
      renderHud: s => renderHud(hud, s), renderCharacter: s => renderCharacter(character, s),
      renderEquipment: s => renderEquipment(gear, s)
    }, onResult: r => { result.textContent = r.ok ? '操作成功' : r.error.code; } });
    for (const scene of definition.scenarios) {
      const option = root.ownerDocument.createElement('option'); option.value = scene.id; option.textContent = scene.name ?? scene.id; scenario.append(option);
    }
    const change = () => controller.loadScenario(scenario.value);
    const click = e => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.on) controller.equip(b.dataset.on, b.parentElement.querySelector('select').value);
      else if (b.dataset.off) controller.unequip(b.dataset.off);
      else if (b.hasAttribute('data-render')) controller.render();
      else if (b.dataset.panel) { const panel = root.querySelector(`[data-${b.dataset.panel}]`); panel.hidden = !panel.hidden; }
    };
    change(); scenario.addEventListener('change', change); root.addEventListener('click', click);
    controls.disabled = false; root.dataset.status = 'ready';
    return Object.freeze({ ...controller, dispose() { controller.dispose(); scenario.removeEventListener('change', change); root.removeEventListener('click', click); controls.disabled = true; } });
  } catch (error) {
    controller?.dispose(); controls.disabled = true; root.dataset.status = 'error';
    result.textContent = `初始化停止：${error.code ?? error.message}`; throw error;
  }
}
