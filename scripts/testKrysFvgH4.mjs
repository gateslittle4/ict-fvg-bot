import { loadCsv } from './runKrysValidation.mjs';
import { backtest, stats, h4SweepFilter } from './lib/krysBacktest.js';
// FVG H4 strict (3 barres H4 contiguës ; baissier : c1.low > c3.high, zone [c3.high, c1.low]) ; actif tant qu'aucune mèche ne l'a rempli entièrement (haut >= c1.low).
function h4Gaps(c) {
  const H = [], gaps = [], res = new Array(c.length); let cur = null;
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) { if (cur) { H.push(cur); const n = H.length; if (n >= 3) { const a = H[n - 3], b = H[n - 1];
          if (a.l > b.h) gaps.push({ dir: -1, lo: b.h, hi: a.l, born: m, dead: false }); else if (a.h < b.l) gaps.push({ dir: 1, lo: a.h, hi: b.l, born: m, dead: false }); } }
      cur = { key, o: x.o, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    for (const g of gaps) if (!g.dead && g.born < m && (g.dir < 0 ? x.h >= g.hi : x.l <= g.lo)) g.dead = true;
    res[m] = gaps.filter(g => !g.dead).map(g => ({ ...g }));
  }
  return res;
}
const files = { '2023-2025': '../data/real-data-2023-2025/US100.csv', '2026': '../data/real-data-2026-02-to-09/US100.csv' };
const s = (x) => `n=${String(x.n).padStart(3)} gagn=${(x.winRate * 100).toFixed(0)}% R=${x.totalR.toFixed(1).padStart(6)} moy=${x.avgR.toFixed(2)}`;
for (const [nm, f] of Object.entries(files)) {
  const c = loadCsv(f), px = c.slice(700).reduce((a, x) => a + x.c, 0) / (c.length - 700), k = px / 8200, sw = h4SweepFilter(c, { N: 6, W: 32 }), G = h4Gaps(c);
  const o = { start: 700, spread: 0.6 * k, stopMargin: 3 * k, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5 };
  const inBear = (a) => (G[a.m] || []).some(g => g.dir < 0 && a.entry >= g.lo && a.entry <= g.hi);
  const yr = (t) => new Date(c[t.fillIdx].raw).getUTCFullYear();
  console.log('==', nm);
  const base = (a) => a.z.dir > 0 && sw(a);
  for (const [n, flt] of [['achats v3', base], ['achats v3 SANS ceux dans un FVG H4 baissier', (a) => base(a) && !inBear(a)], ['(diag) achats v3 DANS un FVG H4 baissier', (a) => base(a) && inBear(a)]]) {
    const t = backtest(c, { ...o, filter: flt }).trades; console.log(n.padEnd(46), s(stats(t)));
    if (nm !== '2026') console.log('     par an', [2023, 2024, 2025].map(y => y + ': ' + stats(t.filter(x => yr(x) === y)).avgR.toFixed(2) + '(' + t.filter(x => yr(x) === y).length + ')').join(' '));
  }
}
