#!/usr/bin/env node
// checkFvgContext.js - descriptif, ENTRAÎNEMENT 2010-2022 seulement : la direction du FVG valide le plus récent devient-elle prédictive dans le contexte d'Esdras ?
// Trois contextes fixés AVANT de regarder les chiffres (ses propres mots), seuil de signal fixé d'avance : |t| >= 3 dans les DEUX moitiés, même signe.
//   1. alignement H4 : la zone M15 va dans le sens du dernier FVG H4 complet ;
//   2. proximité : un 4hr high (achat) / low (vente) non balayé est à moins d'une amplitude H4 moyenne (14 bougies) de l'entrée ;
//   3. le 4hr le plus proche est sur une bougie H4 qui « ouvre » un FVG H4 (bougie du milieu du FVG H4, sens opposé au trade).
// Mesure : rendement signé (dans le sens du FVG) de la clôture de la bougie de confirmation jusqu'à +1 h, +4 h, +1 jour, moins ce que donnerait une direction
// tirée au hasard (tendance de fond des indices comprise). Usage : node scripts/checkFvgContext.js
import { eng, loadM1, toM15 } from './lib/m1Data.js';
import { buildZones } from './lib/fvgFollow.js';
import { buildContext } from './lib/fvgGaucheV2.js';

const M15 = 900000, HZ = [4, 16, 96], HZL = ['+1 h', '+4 h', '+1 j'];
const HALVES = [['2010-2016', eng(2010), eng(2017)], ['2017-2022', eng(2017), eng(2023)]];
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const opensH4Fvg = (blocks, b, short, kT) => { // bougie du milieu d'un FVG H4 : extrême bas -> FVG haussier ; extrême haut -> FVG baissier
  const a = b - 1;
  if (a < 0 || a + 2 >= blocks.length) return false;
  const [x, y, w] = [blocks[a], blocks[a + 1], blocks[a + 2]];
  if (y.id !== x.id + 1 || w.id !== y.id + 1 || w.end > kT) return false;
  return short ? x.high < w.low : x.low > w.high;
};
const rows = []; // { half, ctx1, ctx2, ctx3, ex: [..3 horizons] }
for (const sym of ['US100', 'US500']) {
  const S = loadM1('hist', sym); const bars = toM15(S);
  const zones = buildZones(bars); const ctx = buildContext(bars); const { blocks, blockOf } = ctx;
  const fwd = (k, h) => { const j = k + h; if (j >= bars.length || bars[j].time - bars[k].time > h * M15 * 1.6) return null; return (bars[j].close - bars[k].close) / bars[k].close * 1e4; };
  const base = {}; // tendance de fond : rendement moyen inconditionnel par moitié et horizon
  for (const [lab, a, b] of HALVES) for (let hi = 0; hi < HZ.length; hi++) { const r = []; for (let k = 0; k < bars.length - HZ[hi]; k += 4) { if (bars[k].time < a || bars[k].time >= b) continue; const v = fwd(k, HZ[hi]); if (v !== null) r.push(v); } base[lab + hi] = mean(r); }
  for (const z of zones) {
    const half = HALVES.find(([, a, b]) => z.T >= a && z.T < b); if (!half) continue;
    const kT = z.kT, short = z.dir < 0;
    let top = blockOf[kT]; while (top >= 0 && blocks[top].end > kT) top--;
    if (top < 14) continue;
    let atr = 0; for (let i = top - 13; i <= top; i++) atr += blocks[i].high - blocks[i].low; atr /= 14;
    // 1. dernier FVG H4 complet (12 bougies en arrière au plus)
    let h4dir = 0;
    for (let b = top; b >= 2 && b > top - 12; b--) {
      const [x, y, w] = [blocks[b - 2], blocks[b - 1], blocks[b]];
      if (y.id !== x.id + 1 || w.id !== y.id + 1) continue;
      if (x.high < w.low) { h4dir = 1; break; }
      if (x.low > w.high) { h4dir = -1; break; }
    }
    // 2-3. 4hr non balayé le plus proche dans le sens du trade (30 bougies H4 au plus)
    let near = null; let seen = 0;
    for (let b = top; b >= 0 && seen < 30; b--) {
      const B = blocks[b]; if (B.end > kT) continue; seen++;
      const ext = short ? B.low : B.high;
      if (short ? !(ext < z.entry && B.sweepLow > kT) : !(ext > z.entry && B.sweepHigh > kT)) continue;
      const dist = Math.abs(ext - z.entry);
      if (!near || dist < near.dist) near = { b, dist };
    }
    const c1 = h4dir === z.dir, c2 = !!near && near.dist <= atr, c3 = !!near && opensH4Fvg(blocks, near.b, short, kT);
    const ex = HZ.map((h, hi) => { const r = fwd(kT, h); return r === null ? null : z.dir * (r - base[half[0] + hi]); });
    rows.push({ half: half[0], c1, c2, c3, ex });
  }
}
const NAMES = { c1: 'FVG H4 dans le même sens', c2: '4hr non balayé proche', c3: 'le 4hr proche ouvre un FVG H4' };
console.log(`Zones analysées : ${rows.length}. Excès de rendement signé sur le hasard, en points de base (t entre parenthèses) ; signal = |t| >= 3 dans les deux moitiés, même signe.\n`);
console.log('Contexte | valeur | zones (2010-16 / 2017-22) | ' + HZL.map((h) => `${h} : 2010-16 | 2017-22`).join(' || '));
let signals = 0;
for (const c of ['c1', 'c2', 'c3']) for (const v of [true, false]) {
  const cells = [], n = [];
  for (const [lab] of HALVES) n.push(rows.filter((r) => r.half === lab && r[c] === v).length);
  HZ.forEach((_, hi) => {
    const t = HALVES.map(([lab]) => { const a = rows.filter((r) => r.half === lab && r[c] === v && r.ex[hi] !== null).map((r) => r.ex[hi]); return { m: mean(a), t: mean(a) / (sd(a) / Math.sqrt(a.length || 1)) }; });
    if (t.every((x) => Math.abs(x.t) >= 3) && Math.sign(t[0].t) === Math.sign(t[1].t)) signals++;
    cells.push(t.map((x) => `${x.m.toFixed(2)} (${x.t.toFixed(1)})`).join(' | '));
  });
  console.log(`${NAMES[c]} | ${v ? 'oui' : 'non'} | ${n.join(' / ')} | ${cells.join(' || ')}`);
}
console.log(`\nSignaux (|t| >= 3 dans les deux moitiés, même signe) : ${signals} sur 18 cases.`);
