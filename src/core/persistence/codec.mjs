import { check, keys, copyData, readonlyCopy, RULESET_ID } from '../data.mjs';
import { validateState } from '../invariants.mjs';

export function encodeSave(state) {
  return readonlyCopy({ saveVersion: 1, rulesetId: state.rulesetId,
    catalogVersion: state.catalogVersion, state });
}
export function decodeSave(input, catalog) {
  const envelope = copyData(input);
  keys(envelope, ['saveVersion', 'rulesetId', 'catalogVersion', 'state'], 'save');
  check(envelope.saveVersion === 1, 'UNSUPPORTED_SAVE_VERSION');
  check(envelope.rulesetId === RULESET_ID && envelope.rulesetId === envelope.state?.rulesetId,
    'SAVE_RULESET_MISMATCH');
  check(envelope.catalogVersion === catalog.version && envelope.catalogVersion === envelope.state?.catalogVersion,
    'SAVE_CATALOG_MISMATCH');
  return validateState(envelope.state, catalog);
}
