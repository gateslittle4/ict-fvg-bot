// fvgGaucheV2.js - version 2 de « FVG 15 min vers FVG à gauche » (data/backtest-input/preregistration-fvg-a-gauche-v2-2026-09-30.md), écrite
// à partir des 6 exemples d'Esdras. Par rapport à la v1 (fvgGauche.js) :
//   - des FVG de même sens sur des bougies CONSÉCUTIVES forment UNE seule zone (du bord le plus bas au bord le plus haut) ;
//   - le FVG « à gauche » est la partie NON REMPLIE de la zone (son bord proche recule quand le prix y est entré sans la traverser) ;
//   - il doit se former dans la bougie H4 (blocs de 4 h alignés sur l'UTC) qui porte le 4hr low (vente) / 4hr high (achat) : l'extrême le plus
//     marqué, non balayé, au-delà de l'entrée, parmi les 6 dernières bougies H4 complètes (24 h) ; un FVG appartient à la bougie où sa
//     PREMIÈRE bougie se trouve ;
//   - toute la journée (plus de fenêtre horaire).
// Sans regard vers l'avenir : la zone d'entrée n'est déclarée qu'une fois la série terminée, la bougie H4 doit être complète, et tout est
// évalué à T = clôture de la bougie k1 + 1.
import { OFF } from './m1Data.js';
import { buildOrder, simulateOrder, stats, trainVerdict, LOOKBACK } from './fvgGauche.js';

export { stats, trainVerdict };
const M15 = 900000, H4 = 4 * 3600000;
export const REF_BLOCKS = 6; // bougies H4 complètes parmi lesquelles on cherche le 4hr low / high

/** Contexte d'une série M15 : zones fusionnées, blocs H4 (UTC), extrêmes de bloc balayés ou non, zones par bloc. */
export function buildContext(bars) {
  const n = bars.length;
  // 1. FVG bruts puis fusion des séries consécutives de même sens
  const zones = [];
  let cur = null;
  for (let k = 2; k < n; k++) {
    const a = bars[k - 2], c = bars[k];
    // Les trois bougies doivent se suivre sans trou : l'écart de prix de la réouverture du week-end (ou d'un jour férié) n'est pas un FVG.
    const contigu = c.time - a.time === 2 * M15;
    const f = !contigu ? null : a.low > c.high ? { dir: -1, sup: a.low, inf: c.high } : a.high < c.low ? { dir: 1, sup: c.low, inf: a.high } : null;
    if (f && cur && cur.dir === f.dir && cur.k1 === k - 1) { cur.k1 = k; cur.inf = Math.min(cur.inf, f.inf); cur.sup = Math.max(cur.sup, f.sup); continue; }
    if (cur) zones.push(cur);
    cur = f ? { dir: f.dir, k0: k, k1: k, inf: f.inf, sup: f.sup } : null;
  }
  if (cur) zones.push(cur);
  for (const z of zones) {
    z.h = z.sup - z.inf;
    z.filled = Infinity; // première bougie après la zone qui CLÔTURE au-delà de la zone (baissier : Close >= sup ; haussier : Close <= inf) : une mèche seule ne l'invalide pas
    for (let j = z.k1 + 1, last = Math.min(n - 1, z.k1 + LOOKBACK + 2); j <= last; j++) {
      if (z.dir < 0 ? bars[j].close >= z.sup : bars[j].close <= z.inf) { z.filled = j; break; }
    }
  }
  // 2. Blocs H4 alignés sur l'UTC
  const blocks = [], blockOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const id = Math.floor((bars[i].time + OFF) / H4);
    let b = blocks[blocks.length - 1];
    if (!b || b.id !== id) { b = { id, start: i, end: i, low: bars[i].low, high: bars[i].high, zones: [] }; blocks.push(b); }
    else { b.end = i; if (bars[i].low < b.low) b.low = bars[i].low; if (bars[i].high > b.high) b.high = bars[i].high; }
    blockOf[i] = blocks.length - 1;
  }
  for (const b of blocks) {
    b.sweepLow = Infinity; b.sweepHigh = Infinity; // première bougie après le bloc qui casse son plus bas / plus haut
    for (let j = b.end + 1, last = Math.min(n - 1, b.end + LOOKBACK + 2); j <= last; j++) {
      if (b.sweepLow === Infinity && bars[j].low <= b.low) b.sweepLow = j;
      if (b.sweepHigh === Infinity && bars[j].high >= b.high) b.sweepHigh = j;
      if (b.sweepLow !== Infinity && b.sweepHigh !== Infinity) break;
    }
  }
  for (const z of zones) {
    if (z.k0 - 2 < 0) continue;
    blocks[blockOf[z.k0 - 2]].zones.push(z); // appartient à la bougie H4 de sa première bougie
  }
  return { bars, zones, blocks, blockOf };
}

/**
 * Une zone d'entrée z (série terminée en k1) : ordre posé à T = clôture de la bougie k1 + 1. Le 4hr low (vente) / high (achat) est l'extrême
 * le plus marqué, non balayé et au-delà de l'entrée, parmi les REF_BLOCKS dernières bougies H4 complètes ; le FVG « à gauche » est, dans
 * cette bougie, la partie non remplie de la zone opposée la plus proche de l'entrée (devant elle).
 * @returns {{ missed: string } | { T, order, block, left, kT }}
 */
export function evaluateTrigger(ctx, z) {
  const { bars, blocks, blockOf } = ctx;
  const kT = z.k1 + 1;
  if (kT >= bars.length) return { missed: 'fin_des_donnees' };
  const T = bars[kT].time + M15;
  const short = z.dir < 0;
  const entry = short ? z.inf : z.sup;
  let ref = null, seen = 0;
  for (let b = blockOf[kT]; b >= 0 && seen < REF_BLOCKS; b--) {
    const B = blocks[b];
    if (B.end > kT) continue; // bougie H4 encore en formation à T
    seen++;
    if (short ? !(B.low < entry && B.sweepLow > kT) : !(B.high > entry && B.sweepHigh > kT)) continue;
    if (!ref || (short ? B.low < ref.low : B.high > ref.high)) ref = B;
  }
  if (!ref) return { missed: 'sans_extreme_h4' };
  let best = null;
  for (const L of ref.zones) {
    if (L.dir !== -z.dir || L.filled <= kT || L.k1 >= z.k0 - 2) continue; // opposé, jamais entièrement rempli, formé avant la zone d'entrée
    let edge = short ? L.sup : L.inf; // bord proche de la partie non remplie à T
    for (let j = L.k1 + 1; j <= kT; j++) edge = short ? Math.min(edge, bars[j].low) : Math.max(edge, bars[j].high);
    if (short ? !(edge < entry) : !(edge > entry)) continue; // devant l'entrée
    if (!best || (short ? edge > best.edge : edge < best.edge) || (edge === best.edge && L.h > best.L.h)) best = { L, edge };
  }
  if (!best) return { missed: 'sans_cible' };
  return { T, kT, block: ref, left: best.L, order: buildOrder(z, best.edge) };
}

/** Étude d'une paire (v2) : un seul trade à la fois, déclencheurs pris à T dans [from, to). */
export function runSymbol(S, bars, { from, to, spreadAt, swapFor }) {
  const ctx = buildContext(bars);
  const trades = [];
  const counters = { triggers: 0, occupe: 0, sans_extreme_h4: 0, sans_cible: 0, rr_trop_petit: 0, ordres: 0, remplis: 0 };
  let busyUntil = -Infinity;
  for (const z of ctx.zones) {
    const kT = z.k1 + 1;
    if (kT >= bars.length) continue;
    const T = bars[kT].time + M15;
    if (T < from || T >= to) continue;
    counters.triggers++;
    if (T < busyUntil) { counters.occupe++; continue; }
    const ev = evaluateTrigger(ctx, z);
    if (ev.missed) { counters[ev.missed] = (counters[ev.missed] || 0) + 1; continue; }
    if (!ev.order.rrOk) { counters.rr_trop_petit++; continue; }
    counters.ordres++;
    const res = simulateOrder(S, ev.order, ev.T, { spread: spreadAt(ev.order.entry), swap: swapFor });
    busyUntil = res.endTime;
    if (res.missed) { counters[res.missed] = (counters[res.missed] || 0) + 1; continue; }
    counters.remplis++;
    trades.push({ time: res.fillTime, dir: z.dir, r: res.r, rControl: res.control.r, targetR: ev.order.targetR, reason: res.reason });
  }
  return { trades, counters };
}
