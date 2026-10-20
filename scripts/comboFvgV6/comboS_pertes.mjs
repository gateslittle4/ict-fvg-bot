// comboS_pertes.mjs - DESCRIPTIF (aucune règle, aucun filtre) : étude des pertes de F2 sur 2011-2022. Définitions figées dans docs/PREREG-ETUDE-PERTES-F2.md (écrit avant le calcul).
// Usage : node comboS_pertes.mjs <dossier data>
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { nyParts } from './comboI.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
export function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function wilson(k, n, z = 1.96) { if (!n) return [NaN, NaN]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - s) / d, (c + s) / d]; }
export function bootCI(x, B = 2000) { if (x.length < 5) return [NaN, NaN]; const r = rng(7), m = []; for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < x.length; i++) s += x[(r() * x.length) | 0]; m.push(s / x.length); } m.sort((a, b) => a - b); return [m[Math.floor(0.025 * B)], m[Math.floor(0.975 * B)]]; }
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);

/** F2 sur un an civil, série continue, trades complets avec chemin. Renvoie { c, start, trades } ; trades remplis pendant Y. */
export function runYearFull(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const trades = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, start, trades };
}

/** Pour un trade d'achat : AFM (R, de la bougie après le remplissage à la sortie), MAE (R, du remplissage à la sortie), S (risque / amplitude moyenne des 96 bougies précédant le remplissage), RR prévu. */
export function tradeMetrics(c, t) {
  let afm = 0, mae = 0; for (let m = t.fillIdx; m <= t.exitIdx; m++) { if (m > t.fillIdx) afm = Math.max(afm, (c[m].h - t.entry) / t.risk); mae = Math.max(mae, (t.entry - c[m].l) / t.risk); }
  const a = Math.max(0, t.fillIdx - 96); let s = 0; for (let m = a; m < t.fillIdx; m++) s += c[m].h - c[m].l; const rangeAvg = t.fillIdx > a ? s / (t.fillIdx - a) : NaN;
  return { afm, mae, S: t.risk / rangeAvg, rr: (t.tp - t.entry) / t.risk };
}
/** Après un stop : dans les 96 bougies suivantes, le prix atteint-il l'entrée ? le TP ? */
export function afterStop(c, t, n = 96) { let hi = -Infinity; for (let m = t.exitIdx + 1; m <= Math.min(c.length - 1, t.exitIdx + n); m++) if (c[m].h > hi) hi = c[m].h; return { backE: hi >= t.entry, tp: hi >= t.tp }; }
/** Base de comparaison : depuis l'ouverture de la bougie i, atteint +R ? +(1+RR)R ? dans les 96 bougies suivantes. */
export function baseStat(c, i, R, RR, n = 96) { const P = c[i].o; let hi = -Infinity; for (let m = i + 1; m <= Math.min(c.length - 1, i + n); m++) if (c[m].h > hi) hi = c[m].h; return { r1: hi >= P + R, rtp: hi >= P + (1 + RR) * R }; }
/** Découpe en 4 groupes de même effectif selon une clé croissante. */
export function quartiles(items, key) { const s = [...items].sort((a, b) => key(a) - key(b)), n = s.length, out = [[], [], [], []]; s.forEach((x, i) => out[Math.min(3, Math.floor(4 * i / n))].push(x)); return out; }

const pct = (k, n) => `${(100 * k / n).toFixed(0)} %`.padStart(5);
const ci = (k, n) => { const [a, b] = wilson(k, n); return `[${(100 * a).toFixed(0)} ; ${(100 * b).toFixed(0)}]`; };

if (process.argv[1].endsWith('comboS_pertes.mjs')) {
  const all = loadAll(), rows = [], r = rng(20261007), base = { n: 0, r1: 0, rtp: 0 };
  for (let Y = 2011; Y <= 2022; Y++) {
    const run = runYearFull(all, Y); if (!run) continue; const { c, start, trades } = run;
    const bars = []; for (let i = start; i < c.length; i++) { const h = nyHour(c[i].t), dow = nyParts(c[i].t).dow; if (dow >= 1 && dow <= 5 && h >= 6 && h < 16) bars.push(i); }
    for (const t of trades) {
      const m = tradeMetrics(c, t), row = { Y, r: t.r, why: t.why, ...m }; rows.push(row);
      if (t.why === 'stop') { Object.assign(row, afterStop(c, t)); for (let q = 0; q < 20; q++) { const b = baseStat(c, bars[(r() * bars.length) | 0], t.risk, m.rr); base.n++; if (b.r1) base.r1++; if (b.rtp) base.rtp++; } }
    }
    console.error('année', Y, 'ok');
  }
  const R = rows.map((x) => x.r), st = rows.filter((x) => x.why === 'stop'), tp = rows.filter((x) => x.why === 'tp'), tm = rows.filter((x) => x.why === 'temps');
  console.log('CONTRÔLE (attendu : 1 222 trades, +0,106 R, t 2,04, dd 27,4) :', fmt(summarize(R)));
  console.log(`Sorties : stops ${st.length} (${pct(st.length, rows.length)}), TP ${tp.length}, au temps ${tm.length} (R moyen ${avg(tm.map((x) => x.r)).toFixed(2)})`);
  console.log('\n== 1) Avancée favorable maximale (AFM) avant le stop, en R');
  console.log('AFM médiane', [...st].map((x) => x.afm).sort((a, b) => a - b)[Math.floor(st.length / 2)].toFixed(2));
  for (const [lab, f] of [['moins de 0,25 R', (a) => a < 0.25], ['0,25 à 1 R', (a) => a >= 0.25 && a < 1], ['1 R ou plus', (a) => a >= 1]]) { const g = st.filter((x) => f(x.afm)); console.log(lab.padEnd(18), 'n', String(g.length).padStart(4), pct(g.length, st.length), ci(g.length, st.length)); }
  console.log('\n== 2) Gagnants (TP) : plus grande avancée contre le trade avant le TP (MAE, en R)');
  for (const th of [0.5, 0.75]) { const k = tp.filter((x) => x.mae > th).length; console.log(`MAE > ${th} R :`.padEnd(18), 'n', String(k).padStart(4), 'sur', tp.length, pct(k, tp.length), ci(k, tp.length)); }
  console.log('MAE médiane des gagnants', [...tp].map((x) => x.mae).sort((a, b) => a - b)[Math.floor(tp.length / 2)].toFixed(2));
  console.log('\n== 3) Taille du stop relative au bruit : S = risque / amplitude moyenne des 96 bougies M15 précédentes (quartiles de S)');
  const okS = rows.filter((x) => Number.isFinite(x.S));
  quartiles(okS, (x) => x.S).forEach((g, i) => { const rr = g.map((x) => x.r), [lo, hi] = bootCI(rr), S = g.map((x) => x.S); console.log(`Q${i + 1} S ${Math.min(...S).toFixed(2)}-${Math.max(...S).toFixed(2)}`.padEnd(22), 'n', String(g.length).padStart(4), 'gagn.', pct(g.filter((x) => x.r > 0).length, g.length), 'R moy', avg(rr).toFixed(3).padStart(6), `[${lo.toFixed(2)} ; ${hi.toFixed(2)}]`, 'RR prévu moyen', avg(g.map((x) => x.rr)).toFixed(2)); });
  console.log('\n== 4) Après le stop (96 bougies M15 = 1 jour), avec base de comparaison');
  const e = st.filter((x) => x.backE).length, p = st.filter((x) => x.tp).length;
  console.log(`Stops mesurés : ${st.length} | revient à l'entrée ${pct(e, st.length)} ${ci(e, st.length)} | atteint le TP prévu ${pct(p, st.length)} ${ci(p, st.length)}`);
  console.log(`BASE (${base.n} bougies tirées au hasard, 06-16 NY, même R et même RR) : atteint +R ${pct(base.r1, base.n)} | atteint +(1+RR)R ${pct(base.rtp, base.n)}`);
}
