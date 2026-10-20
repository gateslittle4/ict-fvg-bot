import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, summarize } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { runYearZ, overlapShare } from './comboZ_ventes.mjs';

test('overlapShare : chevauchement des intervalles [remplissage ; sortie]', () => {
  const b = [{ fillIdx: 10, exitIdx: 20 }], s = [{ fillIdx: 15, exitIdx: 30 }, { fillIdx: 21, exitIdx: 25 }, { fillIdx: 5, exitIdx: 10 }, { fillIdx: 20, exitIdx: 22 }];
  assert.equal(overlapShare(b, s), 3 / 4); assert.equal(overlapShare(b, []), 0);
});
test('summarize : R total et pire baisse dans l\'ordre donné', () => { const s = summarize([1, -1, -1, 2, -1]); assert.equal(s.n, 5); assert.ok(Math.abs(s.totalR - 0) < 1e-12); assert.ok(Math.abs(s.dd - 2) < 1e-12); });
const all = loadAll();
test('données réelles : achats = F2C ; ventes cohérentes ; série fusionnée classée par sortie et complète', () => {
  for (const Y of [2014, 2019]) {
    const z = runYearZ(all, Y), c = runYearT(all, Y, {});
    assert.deepEqual(z.buys.map((t) => `${Y}:${t.placedIdx}:${t.zCreated}`), c.map((t) => t.key));
    assert.ok(z.sells.length > 20); assert.equal(z.merged.length, z.buys.length + z.sells.length);
    for (let i = 1; i < z.merged.length; i++) assert.ok(z.merged[i].exitIdx >= z.merged[i - 1].exitIdx);
    for (const t of z.sells) { assert.ok(t.dir < 0 && t.stop > t.entry && t.tp < t.entry && t.risk > 0, 'structure de vente'); assert.ok(Math.abs(t.r - (t.entry - t.exit) / t.risk) < 1e-9, 'R = (entrée - sortie) / risque'); assert.ok(t.r >= -1.0001 && t.exitIdx >= t.fillIdx); }
    assert.ok(z.buys.every((t) => t.dir > 0 && t.stop < t.entry && t.tp > t.entry));
  }
});
