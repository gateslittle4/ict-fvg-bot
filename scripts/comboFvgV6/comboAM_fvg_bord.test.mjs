import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest as backtestE } from './lib/krysBacktestE.js';
import { backtest as backtestC } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { loadAll, RULES } from './comboF.mjs';
import { runYearFM3Raw, formedC1, MARGIN_PTS, RR } from './comboAM_fvg_bord.mjs';

// ---------- séries synthétiques ----------
// 100 bougies plates (89-91) puis une structure d'indices F..F+k. Les heures sont fixées : la bougie F+i s'ouvre à (H0 + 0,25 i) h NY.
const F = 100, DAY = 1.4e9 - (1.4e9 % 86400); // minuit UTC d'un jour quelconque ; heure moteur = UTC + 5 h - 5 h, donc nyHour(DAY + 5 h + h x 3600) = h
const bar = (o, h, l, c) => ({ o, h, l, c, t: 0, raw: 0 });
const flat = () => Array.from({ length: F }, () => bar(90, 91, 89, 90));
const withT = (x, h0 = 6.5) => x.map((k, i) => { const t = DAY + 5 * 3600 + (h0 + 0.25 * (i - F)) * 3600; return { ...k, t, raw: t * 1000 }; });
const OPT = { spread: 0, stopMargin: 0.5, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 0, hourTo: 24, entryFraction: 0, buyOnly: false };
const fm3 = (c, extra = {}) => ({
  ...OPT, ...extra, stopFn: ({ z }) => (z.dir < 0 ? c[z.created - 1].o + 0.5 : c[z.created - 1].o - 0.5), tpFn: ({ z, entry, risk }) => entry + z.dir * 5 * risk,
  reentry2: { max: 2, from: 7, to: 9.75, rr: 5, margin: 0.5, ...(extra.re || {}) }, filter: ({ z }) => z.created === F + 2,
});
// Vente : c1 = F (l 118), c2 = F+1 (ouverture 119, grosse bougie baissière), c3 = F+2 (h 108) -> FVG de vente [108, 118] ; c4 = F+3 ne touche pas -> ordre posé à 108 ; stop 119,5 ; risque 11,5 ; TP 50,5.
const sellBase = (c2 = bar(119, 119, 104, 105)) => [...flat(), bar(120, 122, 118, 119), c2, bar(105, 108, 103, 104), bar(104, 106, 102, 103)];
// Achat : c1 = F (h 62), c2 = F+1 (ouverture 61), c3 = F+2 (l 75) -> FVG d'achat [62, 75] ; ordre posé à 75 ; stop 60,5 ; risque 14,5.
const buyBase = () => [...flat(), bar(60, 62, 58, 61), bar(61, 80, 60, 79), bar(79, 84, 75, 83), bar(83, 86, 80, 85)];
const run = (x, extra = {}, h0 = 6.5) => { const c = withT(x, h0); return backtestE(c, fm3(c, extra)); };

test('moteur E sans options : identique au moteur C (série synthétique)', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 123, 108, 120)], c = withT(x), o = { ...OPT, tpFn: ({ z, entry, risk }) => entry + z.dir * 5 * risk, filter: ({ z }) => z.created === F + 2 }; // stop de c1 : 122,5 (touché à F+5)
  const e = backtestE(c, o), cc = backtestC(c, o);
  assert.equal(cc.trades.length, 1); assert.equal(JSON.stringify(e.trades), JSON.stringify(cc.trades)); assert.equal(e.pending, cc.pending);
});
test('vente : entrée au bord proche (108), stop = ouverture de c2 + 0,5 (119,5), TP = 5 R, risque 11,5', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 110, 50, 52)], r = run(x).trades;
  assert.equal(r.length, 1); const t = r[0];
  assert.equal(t.entry, 108); assert.equal(t.stop, 119.5); assert.equal(t.risk, 11.5); assert.equal(t.tp, 108 - 57.5); assert.equal(t.why, 'tp'); assert.equal(t.r, 5); assert.equal(t.fillIdx, F + 4); assert.equal(t.exitIdx, F + 5);
});
test('tp : aucune ré-entrée après une sortie sur la cible', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 110, 50, 52), bar(52, 53, 50, 51)];
  assert.equal(run(x).trades.length, 1); assert.equal(run(x).reStats.armed, 0);
});
test('stop puis ré-entrée au marché : ouverture suivante, même sens, stop = plus haut de la bougie du stop + 0,5, TP = 5 R du nouveau risque', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(118, 119, 112, 113), bar(113, 114, 100, 101)]; // F+5 : stop (h 121) ; F+6 : ré-entrée à 118 ; F+7 : TP 100,5
  const r = run(x).trades; assert.equal(r.length, 2);
  assert.equal(r[0].why, 'stop'); assert.equal(r[0].r, -1);
  const t = r[1]; assert.equal(t.reentry, true); assert.equal(t.dir, -1); assert.equal(t.fillIdx, F + 6); assert.equal(t.entry, 118); assert.equal(t.stop, 121.5); assert.equal(t.risk, 3.5); assert.equal(t.tp, 118 - 17.5); assert.equal(t.rn, 1);
  assert.equal(t.why, 'tp'); assert.equal(t.r, 5); assert.equal(t.exitIdx, F + 7);
});
test('ré-entrée : la cible n\'est pas comptée dans la bougie d\'entrée (stop et cible : à partir de la bougie suivante)', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(118, 119, 100, 101), bar(101, 102, 100, 101)]; // F+6 touche 100 <= 100,5 mais c'est la bougie d'entrée
  const t = run(x).trades[1]; assert.equal(t.fillIdx, F + 6); assert.equal(t.exitIdx, F + 7); assert.equal(t.why, 'tp');
});
test('stop dans la bougie de remplissage : compté (stop d\'abord) et déclenche la ré-entrée', () => {
  const x = [...sellBase(), bar(104, 121, 103, 120), bar(118, 119, 112, 113), bar(113, 114, 100, 101)]; // F+4 : rempli et stoppé
  const r = run(x).trades; assert.equal(r.length, 2); assert.equal(r[0].fillIdx, F + 4); assert.equal(r[0].exitIdx, F + 4); assert.equal(r[0].r, -1); assert.equal(r[1].fillIdx, F + 5); assert.equal(r[1].entry, 118);
});
test('au plus deux ré-entrées : trois trades, tous stoppés, puis plus rien', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(118, 123, 117, 122), bar(121, 125, 119, 124), bar(124, 126, 120, 121), bar(121, 130, 118, 129)];
  const r = run(x).trades; assert.equal(r.length, 3); assert.deepEqual(r.map((t) => t.why), ['stop', 'stop', 'stop']); assert.deepEqual(r.map((t) => t.rn || 0), [0, 1, 2]);
  assert.equal(r[1].stop, 121.5); assert.equal(r[2].entry, 121); assert.equal(r[2].stop, 123.5); assert.equal(run(x).reStats.taken, 2);
  assert.equal(run(x, { re: { max: 1 } }).trades.length, 2);
});
test('ré-entrée prise si la bougie suivante s\'ouvre à 9 h 45, sautée si elle s\'ouvre à 10 h 00', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(118, 119, 112, 113), bar(113, 114, 100, 101)]; // F+5 = stop, F+6 = bougie de ré-entrée = h0 + 1,5
  assert.equal(nyHour(withT(x, 8.25)[F + 6].t), 9.75); assert.equal(nyHour(withT(x, 8.5)[F + 6].t), 10);
  const p = run(x, {}, 8.25), q = run(x, {}, 8.5);
  assert.equal(p.trades.length, 2); assert.equal(p.reStats.taken, 1);
  assert.equal(q.trades.length, 1); assert.equal(q.reStats.skipHour, 1);
});
test('ré-entrée sautée avant 7 h 00', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(118, 119, 112, 113)]; // F+6 à 6 h 45 si h0 = 5,25
  const r = run(x, { hourFrom: 0 }, 5.25); assert.equal(r.trades.length, 1); assert.equal(r.reStats.skipHour, 1);
});
test('stop non du bon côté de l\'entrée : pas d\'ordre (c2 s\'ouvre sous le bord proche d\'une vente)', () => {
  const x = [...sellBase(bar(107, 119, 104, 105)), bar(104, 109, 103, 108), bar(109, 121, 108, 120)]; // stop 107,5 < entrée 108
  const r = run(x); assert.equal(r.trades.length, 0); assert.equal(r.pending, 0);
});
test('ré-entrée sautée si le stop n\'est pas du bon côté (ouverture au-dessus du plus haut + marge)', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108), bar(109, 121, 108, 120), bar(125, 126, 120, 121)]; // ouverture 125 > 121,5
  const r = run(x); assert.equal(r.trades.length, 1); assert.equal(r.reStats.skipSide, 1);
});
test('achat : ordre au bord proche (75), stop = ouverture de c2 - 0,5, ré-entrée à l\'ouverture + spread, stop = plus bas - 0,5, TP 5 R', () => {
  const x = [...buyBase(), bar(84, 85, 74, 76), bar(75, 76, 59, 60), bar(62, 70, 61, 69), bar(69, 81, 68, 80)]; // F+4 rempli à 75 ; F+5 stop (l 59) ; F+6 ré-entrée 62 + 0,2 ; F+7 TP
  const r = run(x, { spread: 0.2 }).trades; assert.equal(r.length, 2);
  assert.equal(r[0].entry, 75); assert.equal(r[0].stop, 60.5); assert.equal(r[0].r, -1);
  const t = r[1]; assert.equal(t.dir, 1); assert.equal(t.fillIdx, F + 6); assert.ok(Math.abs(t.entry - 62.2) < 1e-9); assert.equal(t.stop, 58.5); assert.ok(Math.abs(t.risk - 3.7) < 1e-9); assert.ok(Math.abs(t.tp - (62.2 + 18.5)) < 1e-9);
  assert.equal(t.why, 'tp'); assert.ok(Math.abs(t.r - 5) < 1e-9);
});
test('formedC1 : filtre sur l\'heure d\'ouverture de c1 (4 h 00 incluse, 7 h 00 exclue)', () => {
  const x = [...sellBase(), bar(104, 109, 103, 108)];
  for (const [h1, ok] of [[3.75, false], [4, true], [6.75, true], [7, false]]) { const c = withT(x, h1); assert.equal(formedC1(c)({ z: { created: F + 2 } }), ok, `c1 à ${h1}`); }
});

// ---------- données réelles ----------
const all = loadAll();
const YEARS = [2014, 2019, 2024];

test('données réelles : E sans options = C (mêmes trades, F2C et FM1), 2014 et 2019', () => {
  const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
  for (const Y of [2014, 2019]) {
    const c = all.slice(0, lowerRaw(all, Date.UTC(Y + 1, 0, 1))), start = lowerRaw(c, Date.UTC(Y, 0, 1)), px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
    const base = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode };
    const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
    const f2 = { ...base, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true, filter: (a) => a.z.dir > 0 && sw(a) };
    const fm1 = { ...base, maxAge: 24, hourFrom: 6.75, hourTo: 9.75, entryFraction: 0.5, buyOnly: false, filter: formedC1(c) };
    for (const o of [f2, fm1]) { const e = backtestE(c, o), cc = backtestC(c, o); assert.ok(cc.trades.length > 20, `${Y} : ${cc.trades.length}`); assert.equal(JSON.stringify(e.trades), JSON.stringify(cc.trades)); }
  }
});
test('données réelles : trades d\'origine FM3 — c1 formé 4-7 h, remplissage 7 h-9 h 45, stop = ouverture de c2 ∓ marge, bord proche, cible 5 R', () => {
  let nB = 0, nS = 0;
  for (const Y of YEARS) {
    const { c, T, k } = runYearFM3Raw(all, Y), margin = MARGIN_PTS * k; assert.ok(T.length > 40, `${Y} : ${T.length} trades`);
    for (const t of T.filter((x) => !x.reentry)) {
      const h1 = nyHour(c[t.zCreated - 2].t), hf = nyHour(c[t.fillIdx].t), c2o = c[t.zCreated - 1].o;
      assert.ok(h1 >= 4 && h1 < 7, `${Y} c1 ${h1}`); assert.ok(hf >= 7 && hf <= 9.75, `${Y} remplissage ${hf}`);
      assert.ok(Math.abs(t.stop - (c2o + t.dir * -1 * margin)) < 1e-9, `${Y} stop`);
      assert.ok(Math.abs(t.entry - (t.dir < 0 ? t.zoneNow[0] : t.zoneNow[1])) < 1e-9, `${Y} bord proche`);
      assert.ok(Math.abs(t.tp - (t.entry + t.dir * RR * t.risk)) < 1e-9, `${Y} tp`);
      assert.ok(t.dir > 0 ? t.stop < t.entry : t.stop > t.entry, `${Y} côté du stop`);
      if (t.dir > 0) nB++; else nS++;
    }
  }
  assert.ok(nB > 0 && nS > 0, `achats ${nB}, ventes ${nS}`);
});
test('données réelles : ré-entrées FM3 — à l\'ouverture qui suit un stop de même sens, 7 h-9 h 45, stop = extrême ± marge, TP 5 R, au plus 2 par origine, une position à la fois', () => {
  let nRe = 0;
  for (const Y of YEARS) {
    const { c, T, k, reStats } = runYearFM3Raw(all, Y), margin = MARGIN_PTS * k, sp = RULES.spread * k;
    assert.ok(reStats.armed >= reStats.taken && reStats.taken > 0, `${Y} ${JSON.stringify(reStats)}`);
    for (let i = 0; i < T.length; i++) {
      const t = T[i]; if (i > 0) assert.ok(t.fillIdx >= T[i - 1].exitIdx, `${Y} chevauchement`);
      assert.ok((t.rn || 0) <= 2, `${Y} rn`);
      if (!t.reentry) continue; nRe++;
      const p = T[i - 1]; assert.ok(p, `${Y} précédent`); assert.equal(p.why, 'stop'); assert.equal(p.dir, t.dir); assert.equal(p.exitIdx + 1, t.fillIdx); assert.equal(t.rn, (p.rn || 0) + 1);
      const hf = nyHour(c[t.fillIdx].t); assert.ok(hf >= 7 && hf <= 9.75, `${Y} ré-entrée à ${hf}`);
      const kk = c[t.fillIdx], ext = t.dir > 0 ? c[p.exitIdx].l : c[p.exitIdx].h;
      assert.ok(Math.abs(t.entry - (t.dir > 0 ? kk.o + sp : kk.o)) < 1e-9, `${Y} entrée`); assert.ok(Math.abs(t.stop - (ext - t.dir * margin)) < 1e-9, `${Y} stop`);
      assert.ok(Math.abs(t.tp - (t.entry + t.dir * RR * t.risk)) < 1e-9, `${Y} tp`);
    }
  }
  assert.ok(nRe > 10, `ré-entrées ${nRe}`);
});

test('données réelles : chaque sortie FM3 recalculée bougie par bougie (stop d\'abord, cible seulement après la bougie d\'entrée, temps à 96 bougies, R exact)', () => {
  let n = 0;
  for (const Y of YEARS) {
    const { c, T, k } = runYearFM3Raw(all, Y), sp = RULES.spread * k;
    for (const t of T) {
      const buy = t.dir > 0; let first = null;
      for (let m = t.fillIdx; m <= t.exitIdx; m++) {
        const x = c[m], stopHit = buy ? x.l <= t.stop : x.h + sp >= t.stop, tpHit = m > t.fillIdx && (buy ? x.h >= t.tp : x.l + sp <= t.tp);
        if (stopHit) { first = [m, 'stop']; break; } if (tpHit) { first = [m, 'tp']; break; }
        if (m - t.fillIdx >= 96) { first = [m, 'temps']; break; }
      }
      assert.deepEqual(first, [t.exitIdx, t.why], `${Y} trade ${t.fillIdx}`);
      const exit = t.why === 'stop' ? t.stop : t.why === 'tp' ? t.tp : (buy ? c[t.exitIdx].c : c[t.exitIdx].c + sp);
      assert.ok(Math.abs(t.r - (buy ? exit - t.entry : t.entry - exit) / t.risk) < 1e-9, `${Y} R`);
      if (t.why === 'stop') assert.ok(Math.abs(t.r + 1) < 1e-9); if (t.why === 'tp') assert.ok(Math.abs(t.r - 5) < 1e-9); n++;
    }
  }
  assert.ok(n > 400, `${n} trades vérifiés`);
});
