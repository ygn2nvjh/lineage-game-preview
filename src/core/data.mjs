// Environment-independent JSON data boundary. No browser or Node APIs.
export class CoreError extends Error {
  constructor(code, details = '') { super(`${code}${details ? `: ${details}` : ''}`); this.code = code; }
}
export function check(condition, code, details = '') {
  if (!condition) throw new CoreError(code, details);
}
export const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export function record(value, label) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label);
}
export function keys(value, allowed, label) {
  record(value, label);
  for (const key of Object.keys(value)) check(allowed.includes(key), 'UNEXPECTED_FIELD', `${label}.${key}`);
}
export function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, 'INVALID_INTEGER', label);
}
export function text(value, label) {
  check(typeof value === 'string' && value.length > 0, 'INVALID_STRING', label);
}
export function copyData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value), 'INVALID_NUMBER'); return value; }
  check(typeof value === 'object', 'NON_DATA_VALUE');
  check(!ancestors.has(value), 'CYCLIC_DATA');
  const proto = Object.getPrototypeOf(value);
  check(Array.isArray(value) || proto === Object.prototype || proto === null, 'NON_PLAIN_DATA');
  check(Object.getOwnPropertySymbols(value).length === 0, 'NON_DATA_KEY');
  ancestors.add(value);
  let out;
  if (Array.isArray(value)) {
    check(Object.keys(value).length === value.length, 'NON_DATA_ARRAY');
    out = Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      check(descriptor && has(descriptor, 'value'), 'NON_DATA_ACCESSOR');
      return copyData(descriptor.value, ancestors);
    });
  } else {
    out = Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key, descriptor]) => {
      check(descriptor.enumerable && has(descriptor, 'value'), 'NON_DATA_ACCESSOR', key);
      check(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_KEY', key);
      return [key, copyData(descriptor.value, ancestors)];
    }));
  }
  ancestors.delete(value);
  return out;
}
export function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
export const readonlyCopy = value => freezeData(copyData(value));
export function failure(error, revision) {
  if (!(error instanceof CoreError)) throw error;
  return readonlyCopy({ ok: false, ...(revision === undefined ? {} : { revision }),
    error: { code: error.code, message: error.message } });
}

export const STATS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export const SLOTS = Object.freeze(['weapon', 'head', 'neck', 'earring', 'shirt', 'body',
  'shield', 'cloak', 'hands', 'feet', 'ring1', 'ring2', 'belt', 'guarder']);
export const SLOT_TYPES = freezeData({ helm: ['head'], amulet: ['neck'], earring: ['earring'],
  T: ['shirt'], armor: ['body'], shield: ['shield'], cloak: ['cloak'], glove: ['hands'],
  boots: ['feet'], ring: ['ring1', 'ring2'], belt: ['belt'], guarder: ['guarder'] });
export const SUM_FIELDS = Object.freeze(['ac', 'm_def', 'damage_reduction', 'add_str', 'add_dex',
  'add_con', 'add_int', 'add_wis', 'add_cha', 'add_hp', 'add_mp', 'add_hpr', 'add_mpr',
  'add_sp', 'weight_reduction', 'hit_modifier', 'dmg_modifier', 'bow_hit_modifier',
  'bow_dmg_modifier', 'defense_water', 'defense_wind', 'defense_fire', 'defense_earth']);
export const RULESET_ID = 'legacy-v0583';
