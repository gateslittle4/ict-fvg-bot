import test from 'node:test';
import assert from 'node:assert/strict';
import { nyParts, keeps, spec, split, welch, judge, HYP } from './comboI.mjs';

// t moteur = UTC + 3600*dst ; heure NY réelle = t - 5 h. 2024-03-04 (lundi) 14:30 UTC = 09:30 NY (hiver, dst = 0)
test('nyParts : lundi 09h NY en hiver', () => { const t = Date.UTC(2024, 2, 4, 14, 30) / 1000; assert.deepEqual(nyParts(t), { dow: 1, hour: 9 }); });
test('nyParts : été (dst = 1), 13:30 UTC = 09:30 NY, vendredi', () => { const t = Date.UTC(2024, 6, 5, 13, 30) / 1000 + 3600; assert.deepEqual(nyParts(t), { dow: 5, hour: 9 }); });
test('keeps : fenêtre [6 ; 9[ et exclusion du vendredi', () => {
  const s = spec('H-A'); assert.ok(keeps(s, { dow: 2, hour: 6 })); assert.ok(keeps(s, { dow: 2, hour: 8 })); assert.ok(!keeps(s, { dow: 2, hour: 9 })); assert.ok(!keeps(s, { dow: 2, hour: 5 }));
  const j = spec('J-ven'); assert.ok(keeps(j, { dow: 4, hour: 10 })); assert.ok(!keeps(j, { dow: 5, hour: 10 })); assert.equal(j.from, 6); assert.equal(j.to, 16);
});
test('split : sépare gardés et exclus sans perte', () => {
  const tr = [{ r: 1, dow: 1, hour: 7 }, { r: -1, dow: 5, hour: 7 }, { r: 3, dow: 2, hour: 12 }];
  const { kept, out } = split(tr, spec('H-A')); assert.deepEqual(kept, [1, -1]); assert.deepEqual(out, [3]);
});
test('welch : deux groupes séparés > 0, groupes égaux = 0, cas dégénérés = 0', () => {
  assert.ok(welch([1, 2, 3, 2, 2], [-1, 0, -1, 0, -2]) > 4);
  assert.equal(welch([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(welch([1], [1, 2]), 0);
  assert.equal(welch([1, 1], [1, 1]), 0);
});
test('HYP : 10 hypothèses élémentaires, aucune ne dépasse la fenêtre de base 6-16', () => {
  assert.equal(Object.keys(HYP).length, 10);
  for (const s of Object.keys(HYP).map(spec)) { assert.ok(s.from >= 6 && s.to <= 16); }
});
test('judge : un filtre sans effet ne passe pas', () => {
  const rows = []; for (let Y = 2011; Y <= 2022; Y++) { rows.push({ r: 0.1, dow: 1, hour: 7 }, { r: -0.1, dow: 5, hour: 7 }, { r: 0.1, dow: 3, hour: 10 }, { r: -0.1, dow: 3, hour: 10 }); }
  const base = {}; let Y = 2011; for (let i = 0; i < rows.length; i += 4, Y++) base[Y] = rows.slice(i, i + 4);
  assert.equal(judge(base, spec('H-A'), 2).pass, false);
});
