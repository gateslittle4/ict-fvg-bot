// comboK_stops.mjs - DESCRIPTIF (aucune décision, aucun filtre) : que fait le prix APRÈS le stop de F2 ?
// Usage : node comboK_stops.mjs <dossier data>
import { loadAll, RULES } from './comboF.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktest.js';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an : renvoie les trades complets + les bougies (même règles que comboF 'f_sweep'). */
export function f2Trades(all, Y) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}

/** Pour un trade stoppé : ce que fait le prix dans les H bougies M15 suivant la bougie du stop. Pessimiste : si le stop élargi et le TP sont dans la même bougie, le stop élargi gagne. */
export function afterStop(c, t, H) {
  const out = { sameCandleTP: c[t.exitIdx].h >= t.tp, tp: false, entry: false, minDepth: 0, wideDead: { 0.5: false, 1: false } };
  let minLow = Infinity;
  const end = Math.min(c.length - 1, t.exitIdx + H);
  for (let m = t.exitIdx + 1; m <= end; m++) {
    const k = c[m];
    if (k.l < minLow) minLow = k.l;
    for (const kk of [0.5, 1]) if (k.l <= t.stop - kk * t.risk) out.wideDead[kk] = true; // stop élargi touché en premier (pessimiste, même bougie comprise)
    if (k.h >= t.entry) out.entry = true;
    if (k.h >= t.tp) { out.tp = true; break; }
  }
  out.minDepth = minLow === Infinity ? 0 : Math.max(0, (t.stop - minLow) / t.risk);
  return out;
}

if (process.argv[1].endsWith('comboK_stops.mjs')) {
  const all = loadAll(), blocks = { '2011-2016': [2011, 2016], '2017-2022': [2017, 2022], '2023-2025': [2023, 2025], '2026': [2026, 2026] };
  const rows = {}; for (const b of Object.keys(blocks)) rows[b] = [];
  for (let Y = 2011; Y <= 2026; Y++) { const r = f2Trades(all, Y); if (!r) continue; for (const [b, [a, z]] of Object.entries(blocks)) if (Y >= a && Y <= z) for (const t of r.T) rows[b].push({ t, c: r.c }); }
  const pct = (a, n) => (n ? (100 * a / n).toFixed(0) : '0').padStart(3) + '%';
  for (const H of [96, 480]) {
    console.log(`\n===== Horizon après le stop : ${H} bougies M15 (${H === 96 ? '≈ 1 jour' : '≈ 5 jours'}) =====`);
    console.log('bloc'.padEnd(10), 'trades', 'stop', 'tp', 'temps', '| stoppés : TP même bougie | TP revu après | revient à l\'entrée | ne revient jamais à l\'entrée | TP atteint sans passer 0,5R sous le stop | sans passer 1R sous le stop');
    for (const b of Object.keys(blocks)) {
      const T = rows[b].map((x) => x), st = T.filter((x) => x.t.why === 'stop');
      const A = st.map((x) => afterStop(x.c, x.t, H));
      const n = st.length, same = A.filter((a) => a.sameCandleTP).length, tp = A.filter((a) => a.tp).length, en = A.filter((a) => a.entry).length;
      const w5 = A.filter((a) => a.tp && !a.wideDead?.[0.5]).length, w1 = A.filter((a) => a.tp && !a.wideDead?.[1]).length;
      console.log(b.padEnd(10), String(T.length).padStart(6), String(n).padStart(4), String(T.filter((x) => x.t.why === 'tp').length).padStart(4), String(T.filter((x) => x.t.why === 'temps').length).padStart(5), '|', `${same} (${pct(same, n)})`.padEnd(24), '|', `${tp} (${pct(tp, n)})`.padEnd(14), '|', `${en} (${pct(en, n)})`.padEnd(18), '|', `${n - en} (${pct(n - en, n)})`.padEnd(29), '|', `${w5} (${pct(w5, n)})`.padEnd(40), '|', `${w1} (${pct(w1, n)})`);
    }
  }
  // profil des stops : bougie de remplissage, durée, profondeur après le stop
  console.log('\n===== Profil des stops =====');
  for (const b of Object.keys(blocks)) {
    const st = rows[b].filter((x) => x.t.why === 'stop'), fill = st.filter((x) => x.t.exitIdx === x.t.fillIdx).length, dur = st.map((x) => x.t.exitIdx - x.t.fillIdx).sort((p, q) => p - q);
    const A = st.map((x) => afterStop(x.c, x.t, 480)), depth = A.map((a) => a.minDepth).sort((p, q) => p - q);
    const med = (v) => (v.length ? v[Math.floor(v.length / 2)] : 0);
    console.log(b.padEnd(10), `stops=${st.length}`, `| stoppés dans la bougie de remplissage : ${fill} (${pct(fill, st.length)})`, `| durée médiane remplissage→stop : ${med(dur)} bougies (${(med(dur) * 15 / 60).toFixed(1)} h)`, `| profondeur médiane sous le stop (en R, avant TP ou sur 480 bougies) : ${med(depth).toFixed(2)}`);
  }
}
