// comboV6.mjs - Combo FVG (v6), règles FIGÉES. Protocole : voir PREREG-COMBO-FVG-V6.md. Ne rien modifier après le calcul.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { backtest, stats, h4SweepFilter } from './lib/krysBacktest.js';

const D = process.argv[2] || '/mnt/user-data/uploads/ict-fvg-bot/data';

// ---------- données : M1 -> M15 (temps moteur : t' - 5 h = heure NY réelle, DST réel) ----------
export function readM1(path) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('latin1'), out = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(',');
    if (p.length >= 5) out.push([+p[0], +p[1], +p[2], +p[3], +p[4]]);
    pos = end + 1;
  }
  return out;
}
const nthSunday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); const first = (7 - d.getUTCDay()) % 7; return 1 + first + 7 * (n - 1); };
const dstCache = new Map();
export function dstHours(ms) { // 1 si heure d'été US (règle 2007+), sinon 0
  const y = new Date(ms).getUTCFullYear();
  if (!dstCache.has(y)) dstCache.set(y, [Date.UTC(y, 2, nthSunday(y, 2, 2), 7), Date.UTC(y, 10, nthSunday(y, 10, 1), 6)]);
  const [a, b] = dstCache.get(y); return ms >= a && ms < b ? 1 : 0;
}
function toM15(rows) {
  const out = []; let cur = null;
  for (const [ms, o, h, l, c] of rows) {
    const b = Math.floor(ms / 900000);
    if (!cur || cur.b !== b) { if (cur) out.push(cur); cur = { b, raw: b * 900000, o, h, l, c }; }
    else { if (h > cur.h) cur.h = h; if (l < cur.l) cur.l = l; cur.c = c; }
  }
  if (cur) out.push(cur);
  return out.map((x) => ({ t: x.raw / 1000 + dstHours(x.raw) * 3600, o: x.o, h: x.h, l: x.l, c: x.c, raw: x.raw }));
}
export function loadAll() {
  const hist = readM1(`${D}/histdata-m1/US100.csv.gz`), brk = readM1(`${D}/real-m1-full/US100.csv.gz`);
  const cut = brk[0][0];
  return toM15(hist.filter((r) => r[0] < cut).concat(brk));
}

// ---------- règles figées ----------
export const RULES = { N: 6, W: 32, maxAge: 8, hourFrom: 6, hourTo: 16, minRR: 3, stopMargin: 3, spread: 0.6, entryFraction: 0.5, stopMode: 'c1', tpMode: 'half', REF: 8200, warmupMonths: 3 };

function trendState(c) { // cassure H4 agressive (copie de testKrysTendance.mjs)
  const H = [], st = new Int8Array(c.length), piv = []; let cur = null, tr = 0;
  const atr = () => { const n = Math.min(14, H.length - 1); if (n < 5) return null; let s = 0; for (let q = H.length - n; q < H.length; q++) s += Math.max(H[q].h - H[q].l, Math.abs(H[q].h - H[q - 1].c), Math.abs(H[q].l - H[q - 1].c)); return s / n; };
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) {
      if (cur) { H.push(cur); const j = H.length - 1, p = j - 2, A = atr();
        if (p >= 2) { const hh = H[p].h > H[p - 1].h && H[p].h > H[p - 2].h && H[p].h > H[p + 1].h && H[p].h > H[p + 2].h, ll = H[p].l < H[p - 1].l && H[p].l < H[p - 2].l && H[p].l < H[p + 1].l && H[p].l < H[p + 2].l; if (hh) piv.push({ s: 1, px: H[p].h, bar: p, done: false }); if (ll) piv.push({ s: -1, px: H[p].l, bar: p, done: false }); }
        if (A && H[j].h - H[j].l >= A) { for (const v of piv) { if (v.done || j <= v.bar + 2) continue; if (v.s > 0 && H[j].c >= v.px + 0.25 * A) { v.done = true; tr = 1; } else if (v.s < 0 && H[j].c <= v.px - 0.25 * A) { v.done = true; tr = -1; } } }
        for (const v of piv) if (!v.done && j > v.bar + 2 && (v.s > 0 ? H[j].h > v.px : H[j].l < v.px) && !(v.s > 0 ? H[j].c >= v.px + 0.25 * A && H[j].h - H[j].l >= A : H[j].c <= v.px - 0.25 * A && H[j].h - H[j].l >= A)) v.done = true; }
      cur = { key, o: x.o, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    st[m] = tr;
  }
  return st;
}
function bearH4(c) { // « le prix d'entrée est dans un FVG H4 baissier non rempli » (copie de testKrysFvgH4.mjs, évaluation paresseuse)
  const H = [], gaps = []; let cur = null, p = -1;
  const adv = (to) => { for (; p < to; ) { p++; const x = c[p], key = Math.floor((x.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) { if (cur) { H.push(cur); const n = H.length; if (n >= 3) { const a = H[n - 3], b = H[n - 1]; if (a.l > b.h) gaps.push({ dir: -1, lo: b.h, hi: a.l, born: p, dead: false }); else if (a.h < b.l) gaps.push({ dir: 1, lo: a.h, hi: b.l, born: p, dead: false }); } }
      cur = { key, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    for (const g of gaps) if (!g.dead && g.born < p && (g.dir < 0 ? x.h >= g.hi : x.l <= g.lo)) g.dead = true; } };
  return (a) => { adv(a.m); return gaps.some((g) => !g.dead && g.dir < 0 && a.entry >= g.lo && a.entry <= g.hi); };
}

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Un an civil (heure NY) : préchauffage de 3 mois, échelle de prix = prix moyen de l'année / 8200. variant : 'v6' | 'raw_buys' (achats sans filtre H4) | 'raw_both' (tout FVG, sans filtre). */
export function runYear(all, Y, variant = 'v6') {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((s, x) => s + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  let filter;
  if (variant === 'v6') { const st = trendState(c), sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), br = bearH4(c); filter = (a) => a.z.dir > 0 && st[a.z.created] > 0 && sw(a) && !br(a); }
  else if (variant === 'f_trend') { const st = trendState(c); filter = (a) => a.z.dir > 0 && st[a.z.created] > 0; }
  else if (variant === 'f_sweep') { const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }); filter = (a) => a.z.dir > 0 && sw(a); }
  else if (variant === 'f_bear') { const br = bearH4(c); filter = (a) => a.z.dir > 0 && !br(a); }
  else if (variant === 'raw_buys') filter = (a) => a.z.dir > 0;
  else filter = () => true;
  const T = backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { Y, k: +k.toFixed(2), bars: c.length - start, trades: T.map((t) => t.r) };
}
export function summarize(rs) {
  const n = rs.length, tot = rs.reduce((a, b) => a + b, 0), avg = n ? tot / n : 0, sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0;
  let eq = 0, pk = 0, dd = 0; for (const r of rs) { eq += r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { n, win: n ? rs.filter((r) => r > 0).length / n : 0, totalR: tot, avgR: avg, t: sd ? avg / (sd / Math.sqrt(n)) : 0, dd };
}
export const fmt = (s) => `n=${String(s.n).padStart(4)} gagn=${(s.win * 100).toFixed(0).padStart(2)}% R=${s.totalR.toFixed(1).padStart(7)} moy=${s.avgR.toFixed(3).padStart(6)} t=${s.t.toFixed(2).padStart(5)} dd=${s.dd.toFixed(1)}`;

if (process.argv[1].endsWith('comboF.mjs') && process.argv[3] !== 'noop') {
  const all = loadAll(); console.error('M15 :', all.length, new Date(all[0].raw).toISOString(), '->', new Date(all[all.length - 1].raw).toISOString());
  const res = {};
  for (const v of ['f_trend', 'f_sweep', 'f_bear']) { res[v] = {}; for (let Y = 2011; Y <= 2026; Y++) { const r = runYear(all, Y, v); if (r) res[v][Y] = r; } }
  fs.writeFileSync(process.argv[4] || 'results.json', JSON.stringify(res));
  const blocks = { 'ENTRAÎNEMENT A 2011-2016': [2011, 2016], 'ENTRAÎNEMENT B 2017-2022': [2017, 2022], 'ENTRAÎNEMENT 2011-2022': [2011, 2022], '  (dont jamais vu 2011-2018)': [2011, 2018], 'TEST 2023-2025': [2023, 2025], 'FORWARD 2026 (au 21/09)': [2026, 2026] };
  for (const v of Object.keys(res)) {
    console.log('\n##', v);
    for (const [nm, [a, b]] of Object.entries(blocks)) { const rs = []; for (let Y = a; Y <= b; Y++) if (res[v][Y]) rs.push(...res[v][Y].trades); console.log(nm.padEnd(30), fmt(summarize(rs))); }
    console.log('par an :', Object.values(res[v]).map((r) => `${r.Y}: ${summarize(r.trades).avgR.toFixed(2)}(${r.trades.length})`).join('  '));
  }
}
