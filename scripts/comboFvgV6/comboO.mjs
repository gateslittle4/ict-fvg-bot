// comboO.mjs - F2 : âge maximal de la cible (15 / 30 jours). Règles et critères FIGÉS : voir docs/PREREG-F2-CIBLE-RECENTE.md (écrit avant tout calcul).
// Usage : node comboO.mjs <dossier data> train            -> entraînement 2011-2022 (R de 2023+ masqué ; seul le nombre de trades est affiché)
//         node comboO.mjs <dossier data> test <C-15,...>   -> lecture unique du test 2023-2025 (et 2026 descriptif)
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestW.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { welch } from './comboI.mjs';

export const VARS = { 'C-15': 15, 'C-30': 30 };
export const GAIN_MIN = 0.03, T_MIN = 1.96, DD_FACTOR = 1.25, RATE_MIN = 1.0, WEEKS_TEST = 155; // 2 hypothèses : 0,05/2 -> z 1,96

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil ; days = âge maximal de la cible en jours (null = F2 de base). Renvoie { key, r, age } (age = âge de la cible à la pose, en jours). */
export function runYearA(all, Y, days = null) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, maxTargetAgeDays: days };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, age: (c[t.placedIdx].t - c[t.targetCreated].t) / 86400 }));
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement 1 à 5 (sur 2011-2022 ; rate = trades/semaine 2023-25, sans lire R). Critère 2 : Welch variante contre trades supprimés. */
export function judge(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tw = welch(rs(V), m.onlyC);
  const part = (res, a, b) => avg(rs(pool(res, a, b)));
  const mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tw >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tw, ddC, ddV, nRemoved: m.onlyC.length, avgRemoved: avg(m.onlyC), nOnlyV: m.onlyV.length, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboO.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), runs = { ctrl: {} }, names = Object.keys(VARS);
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearA(all, Y, null); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearA(all, Y, VARS[nm]); if (v) runs[nm][Y] = v; } }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    const C = pool(runs.ctrl, 2011, 2022), ages = C.map((t) => t.age);
    console.log('CONTRÔLE F2 (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (contrôle) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)');
    console.log(`Âge de la cible des trades du contrôle (2011-2022, jours) : médiane ${ages.sort((p, q) => p - q)[Math.floor(ages.length / 2)].toFixed(1)} | plus de 15 j : ${(100 * ages.filter((x) => x > 15).length / ages.length).toFixed(0)} % | plus de 30 j : ${(100 * ages.filter((x) => x > 30).length / ages.length).toFixed(0)} %\n`);
    const passers = [];
    for (const nm of names) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judge(runs.ctrl, runs[nm], rate);
      console.log('##', nm, '(cible = FVG formé dans les', VARS[nm], 'derniers jours)');
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`supprimés : ${j.nRemoved} (R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement variante : ${j.nOnlyV}`);
      console.log(`moy ${j.mv.toFixed(3)} (contrôle ${j.mc.toFixed(3)}) | Welch variante vs supprimés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`);
      if (j.pass) passers.push(nm);
    }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const C = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(C, V);
      console.log(nm, lab.padEnd(18), 'variante', f(V), '| contrôle', f(C), '| supprimés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(C)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
