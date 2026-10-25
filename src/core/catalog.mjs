import { check, keys, record, integer, text, copyData, freezeData, has, SUM_FIELDS } from './data.mjs';

// Takes already-normalized SQL records. Loading/converting JSON remains a host concern.
export function createItemCatalog({ version, templates }) {
  text(version, 'catalog.version');
  check(Array.isArray(templates), 'INVALID_CATALOG');
  const byId = {};
  for (const original of templates) {
    const item = copyData(original);
    record(item, 'template');
    integer(item.id, 'template.id', 1); text(item.name, 'template.name');
    check(['weapon', 'armor', 'etcitem'].includes(item.category), 'INVALID_CATEGORY');
    // Taiwan etcitem uses item_type; armor/weapon use type. Preserve raw fields.
    text(item.category === 'etcitem' ? item.item_type ?? item.type : item.type, 'template.type');
    integer(item.weight, 'template.weight');
    check(!has(byId, String(item.id)), 'DUPLICATE_TEMPLATE', String(item.id));
    for (const field of [...SUM_FIELDS, 'min_lvl', 'max_lvl']) {
      if (has(item, field)) integer(item[field], `template.${field}`,
        field === 'min_lvl' || field === 'max_lvl' ? 0 : -Number.MAX_SAFE_INTEGER);
    }
    if (item.category !== 'etcitem') {
      integer(item.use_knight, 'template.use_knight', 0, 1);
      check(!(item.max_lvl > 0 && (item.min_lvl ?? 0) > item.max_lvl), 'INVALID_LEVEL_LIMIT');
    }
    byId[item.id] = item;
  }
  return freezeData({ version, templates: byId });
}

export function validateCatalog(catalog) {
  keys(catalog, ['version', 'templates'], 'catalog');
  record(catalog.templates, 'catalog.templates');
  const normalized = createItemCatalog({ version: catalog.version, templates: Object.values(catalog.templates) });
  check(JSON.stringify(Object.keys(catalog.templates).sort()) ===
    JSON.stringify(Object.keys(normalized.templates).sort()), 'CATALOG_KEY_MISMATCH');
  for (const [key, template] of Object.entries(catalog.templates))
    check(String(template.id) === key, 'CATALOG_KEY_MISMATCH', key);
  return normalized;
}
