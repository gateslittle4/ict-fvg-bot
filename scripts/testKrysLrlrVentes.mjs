import { loadCsv } from './runKrysValidation.mjs';
import { backtest, stats } from './lib/krysBacktest.js';
// Même suivi des FVG H4 (pénétration max par le haut pour les FVG haussiers)
function build(c) {
  const H = [], gaps = [], res = new Array(c.length); let cur = null;
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) { if (cur) { H.push(cur); const n = H.length; if (n >= 3) { const a = H[n - 3], b = H[n - 1]; if (a.h < b.l) gaps.push({ lo: a.h, hi: b.l, born: m, pen: 0 }); } }
      cur = { key, o: x.o, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    for (const g of gaps) if (g.pen < 1 && g.born < m) { const p = (g.hi - x.l) / (g.hi - g.lo); if (p > g.pen) g.pen = Math.min(1, p); }
    res[m] = gaps.filter(g => g.pen < 0.5 && m - g.born <= 12 * 16).map(g => ({ ...g }));
  }
  return res;
}
const files = { '2023-2025': '../data/real-data-2023-2025/US100.csv', '2026': '../data/real-data-2026-02-to-09/US100.csv' };
const s = (x) => `n=${String(x.n).padStart(3)} gagn=${(x.winRate * 100).toFixed(0)}% R=${x.totalR.toFixed(1).padStart(6)} moy=${x.avgR.toFixed(2)} dd=${x.maxDrawdownR.toFixed(1)}`;
for (const [nm, f] of Object.entries(files)) {
  const c = loadCsv(f), px = c.slice(700).reduce((a, x) => a + x.c, 0) / (c.length - 700), k = px / 8200, G = build(c);
  const yr = (t) => new Date(c[t.fillIdx].raw).getUTCFullYear();
  console.log('==', nm);
  for (const [n, frac] of [['ventes LRLR : TP à 50 % du FVG H4 haussier', 0.5], ['ventes LRLR : TP à 100 % (bas du FVG H4)', 1]]) {
    const gf = (a) => { const gs = (G[a.m] || []).filter(g => a.entry > g.hi - 0.5 * (g.hi - g.lo)); if (!gs.length) return null; return gs.reduce((b, g) => g.hi > b.hi ? g : b); };
    const o = { start: 700, spread: 0.6 * k, stopMargin: 3 * k, stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5,
      filter: (a) => a.z.dir < 0, tpFn: ({ z, entry, stop, risk, m }) => { if (z.dir > 0) return null; const g = gf({ m, entry }); if (!g) return null; const tp = g.hi - frac * (g.hi - g.lo); return entry - tp >= 2 * risk ? tp : null; } };
    const t = backtest(c, o).trades; console.log(n.padEnd(46), s(stats(t)));
    if (nm !== '2026') console.log('     par an', [2023, 2024, 2025].map(y => y + ': ' + stats(t.filter(x => yr(x) === y)).avgR.toFixed(2) + '(' + t.filter(x => yr(x) === y).length + ')').join(' '));
  }
}
