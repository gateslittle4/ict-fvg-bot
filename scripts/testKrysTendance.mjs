import { loadCsv } from './runKrysValidation.mjs';
import { backtest, stats, h4SweepFilter } from './lib/krysBacktest.js';
// Pré-enregistré. Pivot H4 = fractal k=2 confirmé. Cassure = clôture H4 au-delà d'un pivot non cassé, de >= 0,25 ATR, par une barre H4 d'amplitude >= 1 ATR (ATR H4 14).
// Tendance = sens de la dernière cassure (haut cassé -> haussier ; bas cassé -> baissier). Aucun autre réglage.
function trendState(c) {
  const H = [], st = new Int8Array(c.length), piv = []; let cur = null, tr = 0;
  const atr = () => { const n = Math.min(14, H.length - 1); if (n < 5) return null; let s = 0; for (let q = H.length - n; q < H.length; q++) s += Math.max(H[q].h - H[q].l, Math.abs(H[q].h - H[q - 1].c), Math.abs(H[q].l - H[q - 1].c)); return s / n; };
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) {
      if (cur) { H.push(cur); const j = H.length - 1, p = j - 2, A = atr();
        if (p >= 2) { const hh = H[p].h > H[p - 1].h && H[p].h > H[p - 2].h && H[p].h > H[p + 1].h && H[p].h > H[p + 2].h, ll = H[p].l < H[p - 1].l && H[p].l < H[p - 2].l && H[p].l < H[p + 1].l && H[p].l < H[p + 2].l; if (hh) piv.push({ s: 1, px: H[p].h, bar: p, done: false }); if (ll) piv.push({ s: -1, px: H[p].l, bar: p, done: false }); }
        if (A && H[j].h - H[j].l >= A) { for (const v of piv) { if (v.done || j <= v.bar + 2) continue; if (v.s > 0 && H[j].c >= v.px + 0.25 * A) { v.done = true; tr = 1; } else if (v.s < 0 && H[j].c <= v.px - 0.25 * A) { v.done = true; tr = -1; } } }
        // pivots dépassés sans cassure « agressive » : retirés
        for (const v of piv) if (!v.done && j > v.bar + 2 && (v.s > 0 ? H[j].h > v.px : H[j].l < v.px) && !(v.s > 0 ? H[j].c >= v.px + 0.25 * A && H[j].h - H[j].l >= A : H[j].c <= v.px - 0.25 * A && H[j].h - H[j].l >= A)) v.done = true; }
      cur = { key, o: x.o, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    st[m] = tr;
  }
  return st;
}
const files = { '2023-2025': '../data/real-data-2023-2025/US100.csv', '2026': '../data/real-data-2026-02-to-09/US100.csv' };
const s = (x) => `n=${String(x.n).padStart(3)} gagn=${(x.winRate * 100).toFixed(0)}% R=${x.totalR.toFixed(1).padStart(6)} moy=${x.avgR.toFixed(2)}`;
for (const [nm, f] of Object.entries(files)) {
  const c = loadCsv(f), px = c.slice(700).reduce((a, x) => a + x.c, 0) / (c.length - 700), k = px / 8200, st = trendState(c), sw = h4SweepFilter(c, { N: 6, W: 32 });
  const o = { start: 700, spread: 0.6 * k, stopMargin: 3 * k, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5 };
  const yr = (t) => new Date(c[t.fillIdx].raw).getUTCFullYear();
  const share = [1, -1, 0].map(v => (100 * st.filter(x => x === v).length / st.length).toFixed(0) + '%'); console.log('==', nm, 'tendance haussière/baissière/aucune :', share.join(' / '));
  const V = { 'T1 sens de la tendance seulement': (a) => st[a.z.created] === a.z.dir, 'T2 tendance + balayage H4 (v3)': (a) => st[a.z.created] === a.z.dir && sw(a), 'réf. sans aucun filtre': () => true };
  for (const [n, flt] of Object.entries(V)) { const t = backtest(c, { ...o, filter: flt }).trades, sl = t.filter(x => x.dir < 0), bl = t.filter(x => x.dir > 0);
    console.log(n.padEnd(34), s(stats(t)), '| ventes', s(stats(sl)), '| achats', s(stats(bl)));
    if (nm !== '2026') console.log('     par an', [2023, 2024, 2025].map(y => y + ': ' + stats(t.filter(x => yr(x) === y)).avgR.toFixed(2) + '(' + t.filter(x => yr(x) === y).length + ')').join(' ')); }
}
