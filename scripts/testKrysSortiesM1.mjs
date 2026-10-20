import fs from 'node:fs';
import { loadCsv } from './runKrysValidation.mjs';
import { backtest, stats, h4SweepFilter } from './lib/krysBacktest.js';
import { trendState } from './testKrysTendanceLib.mjs';
const c = loadCsv('../data/real-data-2023-2026/US100.csv'), px = c.slice(700).reduce((a, x) => a + x.c, 0) / (c.length - 700), k = px / 8200, st = trendState(c), sw = h4SweepFilter(c, { N: 6, W: 32 });
const o = { start: 700, spread: 0.6 * k, stopMargin: 3 * k, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: (a) => a.z.dir > 0 && st[a.z.created] > 0 && sw(a) };
const T = backtest(c, o).trades, yr = (t) => new Date(c[t.fillIdx].raw).getUTCFullYear();
const s = (x) => `n=${x.n} gagn=${(x.winRate * 100).toFixed(0)}% R=${x.totalR.toFixed(1)} moy=${x.avgR.toFixed(2)} dd=${x.maxDrawdownR.toFixed(1)}`;
console.log('échelle k', k.toFixed(2), 'spread', (0.6 * k).toFixed(2), 'pts');
console.log('v5 sur HistData M15 2023–sept 2026 :', s(stats(T)));
for (const y of [2023, 2024, 2025, 2026]) console.log('  ', y, s(stats(T.filter(t => yr(t) === y))));
// M1
const rows = fs.readFileSync('../data/real-data-2023-2026/US100_M1.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(',').map(Number));
const N = rows.length, mt = new Float64Array(N), mh = new Float64Array(N), ml = new Float64Array(N), mc = new Float64Array(N);
rows.forEach((r, i) => { mt[i] = r[0]; mh[i] = r[2]; ml[i] = r[3]; mc[i] = r[4]; });
const lb = (t) => { let a = 0, b = N; while (a < b) { const m = (a + b) >> 1; if (mt[m] < t) a = m + 1; else b = m; } return a; };
const sp = 0.6 * k;
function sim(t, pol) {
  const { entry, stop: s0, risk, fillIdx } = t; let stop = s0, remaining = 1, realized = 0, partialDone = false;
  const tp = pol.tp ? pol.tp(t) : t.tp, R = (p) => (p - entry) / risk;
  const barStart = c[fillIdx].raw; let i = lb(barStart), fillMin = -1;
  for (; i < N && mt[i] < barStart + 15 * 60000; i++) if (ml[i] + sp <= entry) { fillMin = i; break; }
  if (fillMin < 0) return null;
  if (ml[fillMin] <= stop) return -1;
  const end = Math.min(N, fillMin + 1440); let lastBar = Math.floor(mt[fillMin] / 900000);
  const bars = []; // barres M15 complétées après le remplissage : {h,l}
  let curB = { h: -Infinity, l: Infinity, id: lastBar };
  for (i = fillMin + 1; i < end; i++) {
    const id = Math.floor(mt[i] / 900000);
    if (id !== curB.id) { // une barre M15 vient de se terminer : mises à jour trailing
      bars.push(curB); if (pol.trail && curB.h >= entry + pol.trail.after * risk) { const L = bars.slice(-pol.trail.n).map(b => b.l); stop = Math.max(stop, Math.min(...L)); }
      curB = { h: -Infinity, l: Infinity, id };
    }
    curB.h = Math.max(curB.h, mh[i]); curB.l = Math.min(curB.l, ml[i]);
    if (ml[i] <= stop) { realized += remaining * R(stop); return realized; }
    if (pol.partial && !partialDone && mh[i] >= entry + pol.partial.at * risk) { realized += pol.partial.frac * pol.partial.at; remaining -= pol.partial.frac; partialDone = true; stop = Math.max(stop, entry); }
    if (mh[i] >= tp) { realized += remaining * R(tp); return realized; }
    if (pol.be && mh[i] >= entry + pol.be * risk) stop = Math.max(stop, entry);
  }
  return realized + remaining * R(mc[Math.min(N - 1, end - 1)]);
}
const P = {
  'A  actuel : TP statique max(½ FVG gauche, 3R)': {},
  'B  TP statique 2R': { tp: (t) => t.entry + 2 * t.risk },
  'C  TP statique 4R': { tp: (t) => t.entry + 4 * t.risk },
  'D  TP statique 5R': { tp: (t) => t.entry + 5 * t.risk },
  'E  actuel + stop à l\'entrée à +1R': { be: 1 },
  'F  actuel + stop à l\'entrée à +1,5R': { be: 1.5 },
  'G  50 % à +1,5R puis stop à l\'entrée, reste au TP actuel': { partial: { at: 1.5, frac: 0.5 } },
  'H  50 % à +2R puis stop à l\'entrée, reste au TP actuel': { partial: { at: 2, frac: 0.5 } },
  'I  trailing (3 dernières M15) après +1R, sans TP': { tp: () => Infinity, trail: { after: 1, n: 3 } },
  'J  trailing après +1R + TP actuel': { trail: { after: 1, n: 3 } },
};
for (const [n, pol] of Object.entries(P)) {
  const res = T.map(t => ({ r: sim(t, pol), y: yr(t) })).filter(x => x.r !== null), tot = res.reduce((a, x) => a + x.r, 0), win = res.filter(x => x.r > 0.05).length;
  const by = [2023, 2024, 2025, 2026].map(y => { const a = res.filter(x => x.y === y); return (a.reduce((s, x) => s + x.r, 0) / a.length).toFixed(2); });
  let eq = 0, pk = 0, dd = 0; res.forEach(x => { eq += x.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); });
  console.log(n.padEnd(60), 'n=' + res.length, 'R=' + tot.toFixed(1).padStart(5), 'moy=' + (tot / res.length).toFixed(2), 'gagn=' + (100 * win / res.length).toFixed(0) + '%', 'dd=' + dd.toFixed(1).padStart(4), '| par an', by.join(' / '));
}
