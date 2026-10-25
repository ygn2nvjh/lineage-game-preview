import { createItemCatalog } from '../../core/index.mjs';
import { readonlyCopy, has } from '../../core/data.mjs';
import { CATALOG_VERSION, RESOURCE_SHA256 } from './item-catalog-pin.mjs';

export { CATALOG_VERSION } from './item-catalog-pin.mjs';
export const SCENARIOS_SHA256 = '632b8b373785ee02bbfefe61c27c9a96647b0afb86b9d68ac0fd9d82e90c4779';
const SOURCE_REPOSITORY = 'https://github.com/nonono44/l1j-tw-99nets';
const SOURCE_DIRECTORY = 'L1J-TW_3.80c/db/Taiwan';
const DIRECTORY = 'data/l1j-taiwan/items/';

export class AdapterDataError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
function requireData(condition, code, detail) {
  if (!condition) throw new AdapterDataError(code, detail);
}
export async function sha256(bytes) {
  requireData(globalThis.crypto?.subtle, 'CRYPTO_UNAVAILABLE', 'Use HTTPS or localhost with Web Crypto');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function pinnedCatalogVersion() {
  const entries = Object.entries(RESOURCE_SHA256).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `taiwan-items:sha256:${await sha256(new TextEncoder().encode(JSON.stringify(entries)))}`;
}
async function verifiedJson(url, expected, fetcher) {
  const response = await fetcher(url, { cache: 'no-store' });
  requireData(response.ok, 'RESOURCE_LOAD_FAILED', `${url} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  requireData(await sha256(bytes) === expected, 'INTEGRITY_MISMATCH', String(url));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function numericFields(row) {
  // Same explicit conversion as baseline items/catalog.js; no game formulas here.
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    typeof value === 'string' && /^-?\d+$/.test(value) &&
      !['name', 'unidentified_name_id', 'identified_name_id'].includes(key) ? Number(value) : value]));
}
export async function loadItemCatalog({ fetcher = globalThis.fetch,
  baseUrl = new URL('../../../data/l1j-taiwan/items/', import.meta.url) } = {}) {
  requireData(typeof fetcher === 'function', 'FETCH_UNAVAILABLE', 'Catalog host adapter');
  requireData(await pinnedCatalogVersion() === CATALOG_VERSION, 'PIN_VERSION_MISMATCH', 'Review the fixed trust anchor');
  const manifest = await verifiedJson(new URL('manifest.json', baseUrl), RESOURCE_SHA256['manifest.json'], fetcher);
  requireData(manifest.schemaVersion === 1 && manifest.sourceRepository === SOURCE_REPOSITORY &&
    manifest.sourceDirectory === SOURCE_DIRECTORY, 'SOURCE_MISMATCH', 'Taiwan 3.80c catalog manifest');
  const templates = [], seen = new Set(['manifest.json']), tables = new Set();
  for (const table of manifest.tables) {
    requireData(['weapon', 'armor', 'etcitem'].includes(table.table) && !tables.has(table.table), 'TABLE_MISMATCH', table.table);
    tables.add(table.table); let count = 0;
    for (const part of table.parts) {
      requireData(part.path.startsWith(DIRECTORY), 'PART_PATH_MISMATCH', part.path);
      const filename = part.path.slice(DIRECTORY.length);
      requireData(has(RESOURCE_SHA256, filename) && !seen.has(filename), 'PART_PATH_MISMATCH', filename);
      seen.add(filename);
      const data = await verifiedJson(new URL(filename, baseUrl), RESOURCE_SHA256[filename], fetcher);
      requireData(data.source === `nonono44/l1j-tw-99nets/${SOURCE_DIRECTORY}/${table.table}.sql`, 'SOURCE_MISMATCH', filename);
      requireData(data.table === table.table && data.rows.length === part.rows &&
        data.columns.length === table.columns, 'PART_SHAPE_MISMATCH', filename);
      count += data.rows.length;
      for (const row of data.rows) templates.push({ ...numericFields(row), id: Number(row.item_id), category: table.table });
    }
    requireData(count === table.rows, 'ROW_COUNT_MISMATCH', table.table);
  }
  requireData(tables.size === 3 && seen.size === Object.keys(RESOURCE_SHA256).length &&
    seen.size - 1 === manifest.totalParts && templates.length === manifest.totalRows,
  'CATALOG_COUNT_MISMATCH', 'All pinned parts must be loaded');
  return createItemCatalog({ version: CATALOG_VERSION, templates });
}

export async function loadEquipmentScenarios({ fetcher = globalThis.fetch,
  url = new URL('../../../tests/fixtures/core-equipment-scenarios.json', import.meta.url) } = {}) {
  const definition = await verifiedJson(url, SCENARIOS_SHA256, fetcher);
  requireData(definition.schemaVersion === 1 && definition.catalogVersion === CATALOG_VERSION &&
    definition.provenance.repository === SOURCE_REPOSITORY &&
    definition.provenance.sourceDirectory === SOURCE_DIRECTORY, 'SCENARIO_SOURCE_MISMATCH', 'Fixed scenarios');
  return readonlyCopy(definition);
}
