import { check, freezeData } from '../data.mjs';

export const provenance = freezeData({
  rulesetId: 'legacy-v0583',
  gameCommit: 'bb4a13f0765ae12b134a3fb98088f4879fc3778d',
  gameFile: 'lineage_v0583.html',
  l1jReferenceSha: '8aa24617476a7d8f6a7072687279c77cf9f3d405',
  capacity: { source: 'updateUI, line 78', inputs: ['base.hpCapacity', 'base.mpCapacity', 'equipment.add_hp', 'equipment.add_mp'],
    notes: 'Both minima remain 1, matching HUD with equipment totals; no historical growth recomputation.' },
  ac: { source: 'updateUI, line 78', inputs: ['base.level', 'base.stats.dex', 'originalStats.dex', 'equipment.ac'],
    reference: 'utils/CalcStat.java#calcAc; model/Instance/L1PcInstance.java#resetBaseAc,#resetOriginalAc',
    notes: 'SQL AC only; no enchantment or magic AC introduced.' },
  dr: { source: 'line 185, line 189, gear sum line 724', inputs: ['equipment.damage_reduction'],
    reference: 'model/L1Attack.java#calcNpcPcDamage', notes: 'Math.max(0, Math.trunc(raw)); no Combat integration here.' }
});

export function legacyCapacities(base, equipment) {
  return { maxHp: Math.max(1, base.hpCapacity + equipment.add_hp),
    maxMp: Math.max(1, base.mpCapacity + equipment.add_mp) };
}
export function legacyAc(base, originalStats, equipment) {
  const dex = base.stats.dex;
  const divisor = dex <= 9 ? 8 : dex <= 12 ? 7 : dex <= 15 ? 6 : dex <= 17 ? 5 : 4;
  const originalBonus = originalStats.dex >= 15 ? 3 : originalStats.dex >= 13 ? 1 : 0;
  return 10 - Math.floor(base.level / divisor) - originalBonus + equipment.ac;
}
export function checkedDerived(value, label) {
  check(Number.isSafeInteger(value), 'UNSAFE_DERIVED_NUMBER', label); return value;
}
