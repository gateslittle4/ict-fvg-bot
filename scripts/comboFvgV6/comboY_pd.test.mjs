import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { h4Sweeps } from './lib/krysBacktest.js';
import { h4SweepLevels, runYearYRaw, runYearY } from './comboY_pd.mjs';

const mk = (lows) => { const c = []; for (let b = 0; b < lows.length; b++) for (let q = 0; q < 16; q++) c.push({ t: 5 * 3600 + (b * 16 + q) * 900, h: lows[b] + 50, l: q === 5 ? lows[b] : lows[b] + 10, o: lows[b] + 20, c: lows[b] + 20 }); return c; };
test('h4SweepLevels : mêmes balayages que h4Sweeps ; niveau = plus bas des 6 barres complètes à l\'instant du balayage', () => {
  const lows = [100, 90, 95, 92, 93, 94, 96, 80, 85]; // barre 7 passe sous le plus bas des barres 1..6 (90)
  const c = mk(lows), a = h4SweepLevels(c, 6), b = h4Sweeps(c, 6);
  for (let i = 0; i < c.length; i++) assert.equal(a.lastLow[i], b.lastLow[i]);
  const i = 7 * 16 + 5; assert.equal(a.lastLow[i], i); assert.equal(a.lastLevel[i], 90); assert.equal(a.lastLevel[8 * 16 + 10], 90); // pas de nouveau balayage dans la barre 8 (le plus bas des 6 barres est maintenant 80) : le niveau reste 90
});
const all = loadAll();
test('identité : mode ctrl = F2C de comboT (mêmes trades, mêmes R)', () => { for (const Y of [2013, 2019]) { const a = runYearY(all, Y, 'ctrl'), b = runYearT(all, Y, {}); assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); assert.equal(typeof a[i].disc, 'boolean'); } } });
test('données réelles : tout trade de PD1 a son entrée sous l\'équilibre (vérification indépendante) ; les trades de F2C à discount restent presque tous', () => {
  for (const Y of [2015, 2021]) {
    const { c, T } = runYearYRaw(all, Y, 'pd'), ctrl = runYearY(all, Y, 'ctrl'), keep = new Set(T.map((t) => `${Y}:${t.placedIdx}:${t.zCreated}`));
    assert.ok(T.length > 0 && T.length < ctrl.length * 1.2, `${Y} ${T.length}/${ctrl.length}`);
    for (const t of T) {
      // niveau balayé : dernier balayage avant ou à la création de la zone, recalculé naïvement à partir des barres H4 complètes
      let li = -1, lvl = NaN;
      const H = []; let cur = null;
      for (let m = 0; m <= t.zCreated; m++) { const k = c[m], key = Math.floor((k.t - 5 * 3600) / 14400); if (!cur || cur.key !== key) { if (cur) H.push(cur); cur = { key, l: k.l }; } else cur.l = Math.min(cur.l, k.l); if (H.length >= 6) { const lo = Math.min(...H.slice(-6).map((x) => x.l)); if (k.l < lo) { li = m; lvl = lo; } } }
      assert.ok(li >= 0 && t.zCreated - li <= 32); assert.ok(t.entry < (lvl + t.target[0]) / 2, `${Y} ${t.placedIdx}`);
    }
    const lost = ctrl.filter((x) => x.disc && !keep.has(x.key)).length; assert.ok(lost <= ctrl.length * 0.1, `trades à discount manquants : ${lost}`);
  }
});
