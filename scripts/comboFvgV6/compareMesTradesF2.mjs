// compareMesTradesF2.mjs - DESCRIPTIF : tes trades réels de 2025 contre les signaux de F2 (achats) et de F2 miroir (ventes). Définitions FIGÉES : voir docs/PREREG-COMPARAISON-TES-TRADES-VS-F2.md (écrit avant tout calcul).
// Usage : node compareMesTradesF2.mjs <dossier data> <real-trades-2025.csv>
import fs from 'node:fs';
import { loadAll, RULES } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { parseCsv, addR } from './analyseMesTrades.mjs';

export const TOL = 0.001, FILL_NEXT = 1, MIN_AROUND = 60;
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
const nyMs = (k) => (k.t - 5 * 3600) * 1000; // début de la bougie en « heure NY », exprimé comme un instant UTC
const herMs = (s) => Date.parse(s.replace(' ', 'T') + ':00Z');

/** F2 (dir=+1) ou F2 miroir (dir=-1) sur l'année Y, avec journal des ordres posés (filtre enveloppé : les trades sont identiques à ceux sans journal). */
export function runYearLogged(all, Y, dir) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y));
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), spread = RULES.spread * k, orders = [];
  const o = { start, spread, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: dir > 0 };
  const T = backtest(c, { ...o, filter: (a) => { const ok = a.z.dir === dir && sw(a); if (ok) orders.push({ placedIdx: a.m, entry: a.entry, stop: a.stop, tp: a.tp, dir }); return ok; } }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  for (const od of orders) od.endIdx = orderEnd(c, od, spread);
  return { c, T, orders, spread };
}
/** Dernière bougie où l'ordre est vivant (reconstituée comme le moteur : remplissage, stop, TP, fin de plage 06-16 NY). */
export function orderEnd(c, od, spread) {
  const buy = od.dir > 0;
  for (let m = od.placedIdx + 1; m < c.length; m++) {
    const k = c[m], hr = nyHour(k.t);
    const fill = buy ? k.l + spread <= od.entry : k.h >= od.entry, stop = buy ? k.l <= od.stop : k.h >= od.stop, tp = buy ? k.h >= od.tp : k.l <= od.tp;
    if (fill || stop || tp || hr >= RULES.hourTo || hr < RULES.hourFrom) return m;
  }
  return c.length - 1;
}
/** Indice de la bougie qui contient l'instant d'ouverture (en « heure NY »), ou -1. */
export function candleOf(c, ms, lo = 0) {
  let a = lo, b = c.length - 1, r = -1;
  while (a <= b) { const m = (a + b) >> 1; if (nyMs(c[m]) <= ms) { r = m; a = m + 1; } else b = m - 1; }
  return r >= 0 && ms < nyMs(c[r]) + 900000 ? r : -1;
}
const nyDay = (k) => new Date(nyMs(k)).toISOString().slice(0, 10);

/** Classe un de tes trades. run = { c, T, orders }. */
export function classify(t, run) {
  const { c } = run, ms = herMs(t.open), i = candleOf(c, ms); if (i < 0) return { none: 'pas de bougie' };
  const hr = nyHour(c[i].t); if (hr < RULES.hourFrom || hr >= RULES.hourTo) return { outside: true, i };
  const day = nyDay(c[i]), p = +t.open_price, os = run.orders, dayOrders = os.filter((od) => nyDay(c[od.placedIdx]) === day);
  const alive = os.filter((od) => od.placedIdx <= i && i <= od.endIdx);
  return { i, A: dayOrders.length > 0, B: alive.length > 0, C: alive.some((od) => Math.abs(p - od.entry) <= TOL * p), D: run.T.some((x) => x.fillIdx === i || x.fillIdx === i + FILL_NEXT) };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
if (process.argv[1].endsWith('compareMesTradesF2.mjs')) {
  const all = loadAll(), raw = fs.readFileSync(process.argv[3], 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/), H = raw[0].split(',');
  const T = parseCsv(fs.readFileSync(process.argv[3], 'utf8')); // open, close, side, vol, usd
  raw.slice(1).forEach((l, n) => { const p = l.split(','); T[n].open_price = +p[H.indexOf('open_price')]; });
  addR(T);
  const buyRun = runYearLogged(all, 2025, +1), sellRun = runYearLogged(all, 2025, -1);
  console.log(`F2 achats 2025 : ordres posés ${buyRun.orders.length}, trades remplis ${buyRun.T.length} | F2 miroir ventes : ordres ${sellRun.orders.length}, trades ${sellRun.T.length}`);
  const wk = T.filter((t) => [0, 6].includes(new Date(herMs(t.open)).getUTCDay())).length, noC = T.filter((t) => candleOf(buyRun.c, herMs(t.open)) < 0).length;
  console.log(`CONTRÔLE : ${T.length} trades, week-end ${wk}, sans bougie M15 ${noC}`);
  const res = { Buy: [], Sell: [] };
  for (const t of T) { const cl = classify(t, t.side === 'Buy' ? buyRun : sellRun); t.cl = cl; res[t.side].push(t); }
  const rep = (nm, G) => {
    const n = G.length, f = (fn) => G.filter(fn).length, pc = (x) => `${x} (${(100 * x / n).toFixed(0)} %)`;
    console.log(`${nm.padEnd(8)} n=${n} | hors fenêtre ${pc(f((t) => t.cl.outside))} | pas de bougie ${f((t) => t.cl.none)} | A jour ${pc(f((t) => t.cl.A))} | B vivant ${pc(f((t) => t.cl.B))} | C zone ${pc(f((t) => t.cl.C))} | D rempli ${pc(f((t) => t.cl.D))}`);
    const cd = G.filter((t) => t.cl.C || t.cl.D), no = G.filter((t) => !(t.cl.C || t.cl.D));
    console.log(`         niveau C ou D : n=${cd.length}, $ ${cd.reduce((a, t) => a + t.usd, 0).toFixed(0)}, R moy ${avg(cd.map((t) => t.R)).toFixed(2)}, gagnants ${(100 * cd.filter((t) => t.usd > 0).length / (cd.length || 1)).toFixed(0)} % | aucun : n=${no.length}, $ ${no.reduce((a, t) => a + t.usd, 0).toFixed(0)}, R moy ${avg(no.map((t) => t.R)).toFixed(2)}, gagnants ${(100 * no.filter((t) => t.usd > 0).length / (no.length || 1)).toFixed(0)} %`);
  };
  rep('Achats', res.Buy); rep('Ventes', res.Sell); rep('Total', T);
  // sens inverse : trades F2 (achats) de la période de tes trades
  const d0 = T.map((t) => t.open.slice(0, 10)).sort()[0], d1 = T.map((t) => t.open.slice(0, 10)).sort().pop(), c = buyRun.c;
  const F = buyRun.T.filter((t) => { const d = nyDay(c[t.fillIdx]); return d >= d0 && d <= d1; }), herBuys = res.Buy;
  const taken = [], notTaken = [];
  for (const f of F) {
    const fm = nyMs(c[f.fillIdx]), hit = herBuys.some((t) => Math.abs(herMs(t.open) - fm) <= MIN_AROUND * 60000 && Math.abs(t.open_price - f.entry) <= TOL * f.entry);
    (hit ? taken : notTaken).push(f);
  }
  console.log(`SENS INVERSE : trades F2 (achats) du ${d0} au ${d1} : ${F.length} | tu en as pris ${taken.length} (R F2 moy ${avg(taken.map((t) => t.r)).toFixed(3)}) | pas pris ${notTaken.length} (R F2 moy ${avg(notTaken.map((t) => t.r)).toFixed(3)})`);
  const show = (t) => { const k = c[t.fillIdx]; return `${nyDay(k)} ${new Date(nyMs(k)).toISOString().slice(11, 16)} entrée ${t.entry.toFixed(1)} R ${t.r.toFixed(2)}`; };
  console.log('EXEMPLES');
  const ex = (lab, a) => { console.log(lab); a.slice(0, 3).forEach((x) => console.log('  ', typeof x.open === 'string' ? `${x.open} ${x.side} ${x.open_price} $ ${x.usd}` : show(x))); };
  ex('tes achats niveau D :', res.Buy.filter((t) => t.cl.D)); ex('tes achats sans signal (dans la fenêtre) :', res.Buy.filter((t) => !t.cl.outside && !t.cl.none && !t.cl.A)); ex('trades F2 que tu n\'as pas pris :', notTaken); ex('trades F2 que tu as pris :', taken);
}
