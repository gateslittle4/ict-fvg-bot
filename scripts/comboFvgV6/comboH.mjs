// comboH.mjs - critères de contexte (1 : dernier PD array H4 touché ; 2 : FVG M15 cible intact) et leurs combinaisons. Voir docs/PREREG-COMBO-FVG-CRITERES.md. Règles FIGÉES.
import fs from 'node:fs';
import { loadAll, RULES, summarize, fmt } from './comboG.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktest.js';

export const LOOKBACK = 96; // 24 h de bougies M15 : « PD array H4 touché récemment » (interrupteur)

/**
 * Événements H4 par bougie M15 : +1 = « bas » (low des N dernières barres H4 balayé, ou FVG H4 haussier non rempli touché par le dessus),
 * -1 = « haut » (high de la plage balayé, ou FVG H4 baissier non rempli touché par le dessous). Une bougie qui produit les deux types : ignorée.
 * Renvoie state[m] (dernier type, 0 = aucun) et last[m] (indice de la dernière bougie qui a mis l'état à jour, -1 = aucune).
 */
export function h4Events(c, N = 6) {
  const state = new Int8Array(c.length), last = new Int32Array(c.length).fill(-1), H = [], gaps = [];
  let cur = null, st = 0, li = -1;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = Math.floor((k.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) {
      if (cur) { H.push(cur); const n = H.length; if (n >= 3) { const a = H[n - 3], b = H[n - 1]; if (a.l > b.h) gaps.push({ dir: -1, lo: b.h, hi: a.l, dead: false }); else if (a.h < b.l) gaps.push({ dir: 1, lo: a.h, hi: b.l, dead: false }); } }
      cur = { key, h: k.h, l: k.l };
    } else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); }
    let low = false, high = false;
    if (H.length >= N) { let lo = Infinity, hi = -Infinity; for (let q = H.length - N; q < H.length; q++) { if (H[q].l < lo) lo = H[q].l; if (H[q].h > hi) hi = H[q].h; } if (k.l < lo) low = true; if (k.h > hi) high = true; }
    for (const g of gaps) {
      if (g.dead) continue;
      if (g.dir > 0) { if (k.l <= g.hi) { low = true; if (k.l <= g.lo) g.dead = true; } }
      else if (k.h >= g.lo) { high = true; if (k.h >= g.hi) g.dead = true; }
    }
    if (low && !high) { st = 1; li = m; } else if (high && !low) { st = -1; li = m; }
    state[m] = st; last[m] = li;
  }
  return { state, last };
}

/** Décision pure d'un combo. c1 : dernier PD array H4 touché = « bas » ; c2 : FVG M15 cible jamais pénétré ; recent : un PD array H4 touché dans les LOOKBACK dernières bougies. */
export function decide(comb, { c1, c2, recent }) {
  switch (comb) {
    case 'none': return true;
    case 'c1': return c1;
    case 'c2': return c2;
    case 'and': return c1 && c2;
    case 'or': return c1 || c2;
    case 'sw': return recent ? c1 : c2;
    default: throw new Error('combo inconnu ' + comb);
  }
}

export const BASES = ['b0', 'b2'], COMBS = ['none', 'c1', 'c2', 'and', 'or', 'sw'];
export const VARIANTS = BASES.flatMap((b) => COMBS.map((cb) => `${b}_${cb}`)); // b0_none = achats sans filtre, b2_none = F2 (contrôles)

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Un an civil, mêmes règles que comboG.runYear (préchauffage 3 mois, échelle prix/8200), pour toutes les variantes en une passe de données. */
export function runYearAll(all, Y, variants = VARIANTS) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((s, x) => s + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), ev = h4Events(c, RULES.N), out = {};
  for (const v of variants) {
    const [b, cb] = v.split('_');
    const filter = (a) => {
      if (!(a.z.dir > 0)) return false;
      if (b === 'b2' && !sw(a)) return false;
      const e = a.z.created;
      return decide(cb, { c1: ev.state[e] === 1, c2: !(a.tg && a.tg.pen > 0), recent: ev.last[e] >= 0 && e - ev.last[e] <= LOOKBACK });
    };
    const T = backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
    out[v] = { Y, trades: T.map((t) => t.r) };
  }
  return out;
}

const WEEKS_TEST = 155; // 2023-01-11 -> 2025-12-31
const pool = (res, v, a, b) => { const rs = []; for (let Y = a; Y <= b; Y++) if (res[Y]?.[v]) rs.push(...res[Y][v].trades); return rs; };

if (process.argv[1].endsWith('comboH.mjs') && process.argv[3] !== 'noop') {
  const mode = process.argv[3] || 'train', only = (process.argv[4] || '').split(',').filter(Boolean);
  const all = loadAll(), res = {};
  const years = mode === 'train' ? [...Array(12).keys()].map((i) => 2011 + i).concat([2023, 2024, 2025]) : [2023, 2024, 2025, 2026];
  for (const Y of years) { const r = runYearAll(all, Y, mode === 'train' ? VARIANTS : only); if (r) res[Y] = r; }
  if (mode === 'train') {
    // Étape 1 : le test 2023-2025 n'est PAS lu (R masqué) ; seul le nombre de trades sert au critère de rythme.
    console.log('variante    | 2011-2016                      | 2017-2022                      | 2011-2022                      | trades/sem 2023-25 | ok?');
    for (const v of VARIANTS) {
      const a = summarize(pool(res, v, 2011, 2016)), b = summarize(pool(res, v, 2017, 2022)), t = summarize(pool(res, v, 2011, 2022));
      const rate = pool(res, v, 2023, 2025).length / WEEKS_TEST, ctrl = summarize(pool(res, v.split('_')[0] + '_none', 2011, 2022)).avgR;
      const beats = v.endsWith('_none') ? null : t.avgR > ctrl;
      const pass = rate >= 1.5 && t.t >= 2.6 && a.avgR > 0 && b.avgR > 0 && beats === true;
      console.log(v.padEnd(11), '|', fmt(a), '|', fmt(b), '|', fmt(t), '|', rate.toFixed(2).padStart(6), '|', v.endsWith('_none') ? 'contrôle' : pass ? 'OUI' : 'non');
    }
  } else {
    console.log('ÉTAPE 2 (lecture unique) :', only.join(','));
    for (const v of only) { console.log('\n##', v); console.log('TEST 2023-2025'.padEnd(20), fmt(summarize(pool(res, v, 2023, 2025)))); console.log('2026 (descriptif)'.padEnd(20), fmt(summarize(pool(res, v, 2026, 2026)))); }
  }
}
