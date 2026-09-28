#!/usr/bin/env node
// runEsdrasMagnet.js - le FVG 15 min à gauche est-il un aimant ? (preregistration-esdras-magnet-2026-09-28.md)
// Usage : node --max-old-space-size=12000 scripts/runEsdrasMagnet.js explore      |  NIGHT_PHASE=validation node ... validation
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, dayKey, MIN } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { bmsIdx } from './lib/esdrasMethod.js';

const phase = process.argv[2] || 'explore', SYM = process.argv[3] || 'US100', MODE = process.argv[4] || 'all', P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), { b15, atr15 } = X;
const f15 = X.fvg[0].slice().sort((a, c) => a.k - c.k);
const firstK = (k) => { let lo = 0, hi = f15.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f15[m].k < k) lo = m + 1; else hi = m; } return lo; };
const HOURS = [24, 8];
const ev = [];
for (const { q, dir } of bmsIdx(b15)) {
  const atr = atr15[q]; if (!atr || !(atr > 0) || q < 300) continue;
  const bar = b15[q], t0 = S.t[bar.i1] + MIN, start = bar.c;
  if (!inBlocks(t0, P.count)) continue;
  // FVG à gauche : le plus proche, même définition que LX / LY (remplissage mesuré sur les bougies M15 jusqu'à q)
  let level = null;
  for (let x = firstK(q - 288); x < f15.length && f15[x].k < q; x++) {
    const y = f15[x]; if (y.dir !== -dir || y.top - y.bot < 0.001 * start) continue;
    let m = dir > 0 ? -Infinity : Infinity;
    for (let j = y.k + 1; j <= q; j++) m = dir > 0 ? Math.max(m, b15[j].h) : Math.min(m, b15[j].l);
    if (dir > 0 ? m >= y.top : m <= y.bot) continue;
    const lvl = dir > 0 ? Math.max(y.bot, m) : Math.min(y.top, m);
    if (dir > 0 ? lvl > start : lvl < start) if (level === null || (dir > 0 ? lvl < level : lvl > level)) level = lvl;
  }
  // excursion dans le sens du BMS sur 24 h et 8 h (minutes)
  const mfe = {};
  for (const H of HOURS) {
    const tEnd = t0 + H * 3600000; let best = 0;
    for (let i = bar.i1 + 1; i < S.n && S.t[i] < tEnd; i++) best = Math.max(best, dir > 0 ? S.h[i] - start : start - S.l[i]);
    mfe[H] = best / atr;
  }
  // mouvement récent (far) : écart à l'extrême opposé des 96 bougies précédentes, en ATR
  let ext = dir > 0 ? -Infinity : Infinity;
  for (let j = Math.max(0, q - 95); j <= q; j++) ext = dir > 0 ? Math.max(ext, b15[j].h) : Math.min(ext, b15[j].l);
  ev.push({ t0, day: dayKey(t0), dir, r: level === null ? null : Math.abs(level - start) / atr, mfe, D: Math.abs(ext - start) / atr });
}
if (MODE === 'far') {
  // preregistration-esdras-magnet-far-2026-09-28.md : FVG à ≥ 4 ATR, référence contrôlée par la tranche (quintile) du mouvement récent
  const H = 24, lines = [`# Aimant des FVG lointains (≥ 4 ATR) : ${SYM} ${phase}`, ''];
  const log = (s) => { console.log(s); lines.push(s); };
  const cuts = {}; for (const d of [1, -1]) { const a = ev.filter((e) => e.dir === d).map((e) => e.D).sort((x, y) => x - y); cuts[d] = [0.2, 0.4, 0.6, 0.8].map((f) => a[Math.floor(f * a.length)]); }
  const band = (e) => { let b = 0; while (b < 4 && e.D >= cuts[e.dir][b]) b++; return b; };
  const pools = new Map(); for (const e of ev) { const k = `${e.dir}|${band(e)}`; (pools.get(k) || pools.set(k, []).get(k)).push(e.mfe[H]); }
  for (const a of pools.values()) a.sort((x, y) => x - y);
  const all = { 1: ev.filter((e) => e.dir === 1).map((e) => e.mfe[H]).sort((a, c) => a - c), '-1': ev.filter((e) => e.dir === -1).map((e) => e.mfe[H]).sort((a, c) => a - c) };
  const frac = (a, r) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < r) lo = m + 1; else hi = m; } return (a.length - lo) / a.length; };
  const g = ev.filter((e) => e.r !== null && e.r >= 4).map((e) => ({ ...e, hit: e.mfe[H] >= e.r ? 1 : 0, raw: frac(all[e.dir], e.r), ctl: frac(pools.get(`${e.dir}|${band(e)}`), e.r) }));
  const dayT = (key) => { const m = new Map(); for (const e of g) { const v = m.get(e.day) || []; v.push(e.hit - e[key]); m.set(e.day, v); } const dm = [...m.values()].map((v) => v.reduce((a, x) => a + x, 0) / v.length); const mean = dm.reduce((a, x) => a + x, 0) / dm.length, sd = Math.sqrt(dm.reduce((a, x) => a + (x - mean) ** 2, 0) / (dm.length - 1)); return { mean, t: mean / (sd / Math.sqrt(dm.length)), days: dm.length }; };
  const raw = dayT('raw'), ctl = dayT('ctl');
  const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(2)} points`;
  log(`${g.length} BMS avec un FVG à gauche à ≥ 4 ATR (${raw.days} jours). Atteints en 24 h : ${(100 * g.reduce((a, e) => a + e.hit, 0) / g.length).toFixed(1)} %.`);
  log(`Référence brute (tous les BMS du même sens) : ${(100 * g.reduce((a, e) => a + e.raw, 0) / g.length).toFixed(1)} % ; écart ${pct(raw.mean)}, t ${raw.t.toFixed(2)}`);
  log(`Référence contrôlée (même tranche de mouvement récent) : ${(100 * g.reduce((a, e) => a + e.ctl, 0) / g.length).toFixed(1)} % ; écart ${pct(ctl.mean)}, t ${ctl.t.toFixed(2)}`);
  for (const [a, b] of [[4, 8], [8, Infinity]]) { const s2 = g.filter((e) => e.r >= a && e.r < b); log(`  ${a}-${b === Infinity ? '…' : b} ATR : ${s2.length} cas, atteint ${(100 * s2.reduce((x, e) => x + e.hit, 0) / s2.length).toFixed(1)} %, brut ${(100 * s2.reduce((x, e) => x + e.raw, 0) / s2.length).toFixed(1)} %, contrôlé ${(100 * s2.reduce((x, e) => x + e.ctl, 0) / s2.length).toFixed(1)} %`); }
  if (phase === 'explore') log(`SUITE : ${ctl.mean > 0 ? 'écart contrôlé positif, lecture unique de 2019-2022 autorisée' : 'écart contrôlé ≤ 0, la piste s\'arrête (pas de lecture de 2019-2022)'}`);
  else log(`VERDICT ${phase.toUpperCase()} : ${ctl.mean > 0 && ctl.t >= 2 && raw.mean > 0 ? 'CONFIRMÉ' : 'NON CONFIRMÉ'} (écart contrôlé > 0 avec t ≥ 2, et écart brut > 0)`);
  fs.writeFileSync(`data/backtest-input/esdras-magnet-far-${SYM}-${phase}.md`, lines.join('\n') + '\n');
  process.exit(0);
}
const lines = [`# Le FVG à gauche est-il un aimant ? ${SYM} ${phase}`, ''];
const log = (s) => { console.log(s); lines.push(s); };
log(`${ev.length} BMS, dont ${ev.filter((e) => e.r !== null).length} avec un FVG à gauche.`);
const out = {};
for (const H of HOURS) {
  // p(r) : part des BMS du même sens dont l'excursion atteint r ATR
  const sorted = { 1: ev.filter((e) => e.dir === 1).map((e) => e.mfe[H]).sort((a, c) => a - c), '-1': ev.filter((e) => e.dir === -1).map((e) => e.mfe[H]).sort((a, c) => a - c) };
  const p = (dir, r) => { const a = sorted[dir]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < r) lo = m + 1; else hi = m; } return (a.length - lo) / a.length; };
  const g = ev.filter((e) => e.r !== null).map((e) => ({ ...e, hit: e.mfe[H] >= e.r ? 1 : 0, base: p(e.dir, e.r) }));
  const byDay = new Map(); for (const e of g) { const d = byDay.get(e.day) || []; d.push(e.hit - e.base); byDay.set(e.day, d); }
  const dm = [...byDay.values()].map((v) => v.reduce((a, x) => a + x, 0) / v.length);
  const mean = dm.reduce((a, x) => a + x, 0) / dm.length, sd = Math.sqrt(dm.reduce((a, x) => a + (x - mean) ** 2, 0) / (dm.length - 1)), t = mean / (sd / Math.sqrt(dm.length));
  const hr = g.reduce((a, e) => a + e.hit, 0) / g.length, br = g.reduce((a, e) => a + e.base, 0) / g.length;
  log(`## Horizon ${H} h`);
  log(`FVG à gauche atteint : ${(100 * hr).toFixed(1)} % ; niveau quelconque à la même distance : ${(100 * br).toFixed(1)} % ; écart ${(100 * mean >= 0 ? '+' : '')}${(100 * mean).toFixed(2)} points (moyenne par jour, ${dm.length} jours), t ${t.toFixed(2)}`);
  for (const [a, b] of [[0, 2], [2, 4], [4, 8], [8, Infinity]]) {
    const s = g.filter((e) => e.r >= a && e.r < b); if (!s.length) continue;
    log(`  distance ${a}-${b === Infinity ? '…' : b} ATR : ${s.length} cas, atteint ${(100 * s.reduce((x, e) => x + e.hit, 0) / s.length).toFixed(1)} % contre ${(100 * s.reduce((x, e) => x + e.base, 0) / s.length).toFixed(1)} %`);
  }
  const none = ev.filter((e) => e.r === null);
  if (H === 24) {
    const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    log(`  excursion médiane sur 24 h : avec FVG à gauche ${med(g.map((e) => e.mfe[H])).toFixed(2)} ATR, sans ${med(none.map((e) => e.mfe[H])).toFixed(2)} ATR`);
    const ok = mean >= 0.03 && t >= 2.5;
    if (phase === 'explore') log(`VERDICT EXPLORATION : aimant ${ok ? 'RETENU' : 'NON RETENU'} (seuil : écart ≥ +3 points et t ≥ 2,5)`);
    else log(`VERDICT ${phase.toUpperCase()} : ${mean > 0 && t >= 2 ? 'PASSE' : 'ÉCHOUE'} (écart > 0 et t ≥ 2)`);
  }
  out[H] = { n: g.length, days: dm.length, hitRate: hr, baseRate: br, excess: mean, t };
}
fs.writeFileSync(`data/backtest-input/esdras-magnet-${SYM}-${phase}.md`, lines.join('\n') + '\n');
fs.writeFileSync(`data/backtest-input/esdras-magnet-${SYM}-${phase}.json`, JSON.stringify(out, null, 1));
