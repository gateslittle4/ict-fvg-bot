// obEngine.js - setup « OB M15 avec FVG M5 dedans », achats (règle figée : docs/PREREG-OB-M15-FVG-M5.md).
// Mécanique identique à krysBacktestC.js pour les positions et les ordres (une position à la fois, stop d'abord, stop compté dans la bougie de remplissage,
// spread payé à l'entrée des achats, sortie au temps) ; seule la détection du setup et le prix d'entrée changent.
import { nyHour } from './krysMethod.js';

const M15 = 900000, M5 = 300000;
const lowerBound = (arr, key, v) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m][key] < v) a = m + 1; else b = m; } return a; };

/** FVG M5 haussiers stricts (c1.high < c3.low), triés par fin de formation (clôture de c3). */
export function bullFvgM5(c5) {
  const out = [];
  for (let j = 2; j < c5.length; j++) { const a = c5[j - 2], k = c5[j]; if (a.h < k.l) out.push({ lo: a.h, hi: k.l, doneMs: k.raw + M5, idx: j }); }
  return out;
}

/**
 * c : bougies M15 { t, raw, o, h, l, c } ; c5 : bougies M5 ; o : { start, spread, stopMargin, minRR, hourFrom, hourTo, sweep, wait = 12, maxHold = 96, onStage }.
 * sweep({ dir: 1, created: m }) : filtre du balayage H4 de F2 pour le FVG M15 formé à la bougie m.
 */
export function obBacktest(c, c5, opt = {}) {
  const o = { start: 0, spread: 0.6, stopMargin: 3, minRR: 3, hourFrom: 6, hourTo: 16, wait: 12, maxHold: 96, ...opt };
  const fv5 = bullFvgM5(c5), gaps = [], orders = [], trades = [], usedOB = new Set(), stage = (n, m) => { if (o.onStage) o.onStage(n, m); };
  let pos = null;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], hr = nyHour(k.t);
    // 1) position ouverte : sorties (à partir de la bougie du remplissage pour le stop, stop d'abord)
    if (pos) {
      const stopHit = k.l <= pos.stop, tpHit = m > pos.fillIdx && k.h >= pos.tp;
      let exit = null, why = null;
      if (stopHit) { exit = pos.stop; why = 'stop'; } else if (tpHit) { exit = pos.tp; why = 'tp'; } else if (m - pos.fillIdx >= o.maxHold) { exit = k.c; why = 'temps'; }
      if (exit !== null) { trades.push({ ...pos, exitIdx: m, exit, why, r: (exit - pos.entry) / pos.risk }); pos = null; }
    }
    // 2) ordres en attente : remplissage ou annulation
    for (let q = orders.length - 1; q >= 0; q--) {
      const od = orders[q]; if (od.placedIdx === m) continue;
      if (m > od.placedIdx + o.wait) { orders.splice(q, 1); continue; } // fenêtre de 3 h écoulée : plus de remplissage possible
      const fillHit = k.l + o.spread <= od.entry, killed = k.l <= od.stop || k.h >= od.tp || hr >= o.hourTo || hr < o.hourFrom;
      if (fillHit && !pos) { orders.splice(q, 1); pos = { ...od, fillIdx: m }; if (k.l <= pos.stop) { trades.push({ ...pos, exitIdx: m, exit: pos.stop, why: 'stop', r: -1 }); pos = null; } continue; }
      if (fillHit && pos) { orders.splice(q, 1); continue; }
      if (killed) orders.splice(q, 1);
    }
    // 3) FVG M15 baissiers (cibles) : remplissage puis création
    for (const g of gaps) if (!g.filled && g.created < m && k.h >= g.hi) g.filled = true;
    if ((m & 15) === 0) { let w = 0; for (let q = 0; q < gaps.length; q++) if (!gaps[q].filled) gaps[w++] = gaps[q]; gaps.length = w; }
    if (m < 2) continue;
    const a = c[m - 2];
    if (a.l > k.h) gaps.push({ lo: k.h, hi: a.l, created: m, filled: false });
    // 4) setup : FVG M15 haussier qui se forme à la clôture de m, balayage H4, OB, FVG M5 dedans, niveau non touché, cible
    if (!(a.h < k.l) || m < o.start || hr < o.hourFrom || hr >= o.hourTo) continue;
    if (o.sweep && !o.sweep({ z: { dir: 1, created: m } })) continue;
    stage('fvg_sweep', m);
    const i1 = m - 2, X = c[i1].c < c[i1].o ? i1 : (i1 >= 1 && c[i1 - 1].c < c[i1 - 1].o ? i1 - 1 : -1);
    if (X < 0 || usedOB.has(X)) continue;
    stage('ob', m);
    const ob = c[X], endMs = k.raw + M15;
    let f = null; for (let q = lowerBound(fv5, 'doneMs', ob.raw); q < fv5.length && fv5[q].doneMs <= endMs; q++) { const g = fv5[q]; if (g.lo >= ob.l && g.hi <= ob.h) { f = g; break; } }
    if (!f) continue;
    stage('m5', m);
    const entry = (f.lo + f.hi) / 2; let touched = false;
    for (let j = f.idx + 1; j < c5.length && c5[j].raw < endMs; j++) if (c5[j].l <= entry) { touched = true; break; }
    if (touched) continue;
    stage('untouched', m);
    const stop = ob.l - o.stopMargin, risk = entry - stop; if (!(risk > 0)) continue;
    let tg = null; for (const g of gaps) { if (g.filled || g.created > m || !(g.lo > entry)) continue; if (!tg || g.lo < tg.lo) tg = g; }
    if (!tg) continue;
    stage('target', m);
    const tp = Math.max((tg.lo + tg.hi) / 2, entry + o.minRR * risk);
    usedOB.add(X); stage('order', m);
    orders.push({ dir: 1, entry, stop, tp, risk, placedIdx: m, t: k.t, zCreated: m, obIdx: X, m5: [f.lo, f.hi], target: [tg.lo, tg.hi] });
  }
  return { trades, open: pos, pending: orders.length };
}
