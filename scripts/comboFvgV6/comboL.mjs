// comboL.mjs - F2 : stop plus large (m x risque0, TP inchangé). Règles et critères FIGÉS : voir docs/PREREG-F2-STOP-LARGE.md (écrit avant tout calcul).
// Usage : node comboL.mjs <dossier data> train            -> entraînement 2011-2022 (R de 2023+ masqué ; seul le nombre de trades est affiché)
//         node comboL.mjs <dossier data> test <S-1.25,...> -> lecture unique du test 2023-2025 (et 2026 descriptif)
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestW.js';
import { h4SweepFilter } from './lib/krysBacktest.js';

export const MULTS = { 'S-1.25': 1.25, 'S-1.5': 1.5 };
export const GAIN_MIN = 0.03, T_MIN = 1.96, DD_FACTOR = 1.25, RATE_MIN = 1.5, WEEKS_TEST = 155;

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil, avec stop = entrée - mult x risque0 (mult = 1 : F2 de base). Renvoie des trades { key, r }. */
export function runYearW(all, Y, mult = 1) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, stopMult: mult };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r }));
}

/** Associe les trades de deux versions par ordre (même clé). Renvoie les différences r_variante - r_contrôle, et les trades non appariés de chaque côté. */
export function match(ctrl, vari) {
  const cm = new Map(ctrl.map((t) => [t.key, t.r])), vm = new Map(vari.map((t) => [t.key, t.r])), d = [], onlyV = [], onlyC = [];
  for (const [kk, r] of vm) if (cm.has(kk)) d.push(r - cm.get(kk)); else onlyV.push(r);
  for (const [kk, r] of cm) if (!vm.has(kk)) onlyC.push(r);
  return { d, onlyV, onlyC };
}
/** t apparié : moyenne des différences / (écart-type / racine n). */
export function pairedT(d) {
  const n = d.length; if (n < 2) return 0; const m = d.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return sd ? m / (sd / Math.sqrt(n)) : 0;
}
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement 1 à 5 d'une variante contre le contrôle (sur 2011-2022 ; rate = trades/semaine 2023-25, sans lire R). */
export function judge(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), A = [pool(ctrl, 2011, 2016), pool(vari, 2011, 2016)], B = [pool(ctrl, 2017, 2022), pool(vari, 2017, 2022)];
  const mc = avg(rs(C)), mv = avg(rs(V)), m = match(C, V), tp = pairedT(m.d), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tp >= T_MIN, halves: avg(rs(A[1])) > avg(rs(A[0])) && avg(rs(A[1])) > 0 && avg(rs(B[1])) > avg(rs(B[0])) && avg(rs(B[1])) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tp, ddC, ddV, n: V.length, a: avg(rs(A[1])), b: avg(rs(B[1])), aC: avg(rs(A[0])), bC: avg(rs(B[0])), nMatched: m.d.length, onlyV: m.onlyV, onlyC: m.onlyC, rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboL.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), runs = { ctrl: {} }, names = Object.keys(MULTS);
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearW(all, Y, 1); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearW(all, Y, MULTS[nm]); if (v) runs[nm][Y] = v; } }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2 (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (contrôle) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const passers = [];
    for (const nm of names) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judge(runs.ctrl, runs[nm], rate), V = pool(runs[nm], 2011, 2022);
      console.log('##', nm, '(stop = entrée -', MULTS[nm], 'x risque0 ; TP inchangé)');
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`appariés : ${j.nMatched} ordres | seulement variante : ${j.onlyV.length} (R moy ${avg(j.onlyV).toFixed(3)}) | seulement contrôle : ${j.onlyC.length} (R moy ${avg(j.onlyC).toFixed(3)})`);
      console.log(`moy ${j.mv.toFixed(3)} (contrôle ${j.mc.toFixed(3)}) | t apparié ${j.tp.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`);
      if (j.pass) passers.push(nm);
    }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const C = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(C, V);
      console.log(nm, lab.padEnd(18), 'variante', f(V), '| contrôle', f(C), '| t apparié', pairedT(m.d).toFixed(2), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(C)) && avg(rs(V)) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
