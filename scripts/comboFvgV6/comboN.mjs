// comboN.mjs - F2 : RR dynamique (TP = cible FVG à gauche, sans plancher de 3 R). Règles et critères FIGÉS : voir docs/PREREG-F2-RR-DYNAMIQUE.md (écrit avant tout calcul).
// Usage : node comboN.mjs <dossier data> train            -> entraînement 2011-2022 (R de 2023+ masqué ; seul le nombre de trades est affiché)
//         node comboN.mjs <dossier data> test <R-near,...> -> lecture unique du test 2023-2025 (et 2026 descriptif)
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestW.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match, pairedT } from './comboL.mjs';

export const VARS = { 'R-near': 'near', 'R-half': 'half', 'R-far': 'far' };
export const GAIN_MIN = 0.03, T_MIN = 2.13, DD_FACTOR = 1.25, RATE_MIN = 1.5, WEEKS_TEST = 155; // 3 hypothèses : 0,05/3 -> z 2,13

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil avec un autre TP. tpMode 'half' + minRR 3 = F2 de base (contrôle). Renvoie { key, r, rr }. */
export function runYearT(all, Y, tpMode = 'half', minRR = 3) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR, tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, rr: Math.abs(t.tp - t.entry) / t.risk }));
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement 1 à 5 (sur 2011-2022 ; rate = trades/semaine 2023-25, sans lire R). */
export function judge(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tp = pairedT(m.d);
  const part = (res, a, b) => avg(rs(pool(res, a, b)));
  const mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tp >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tp, ddC, ddV, nMatched: m.d.length, onlyV: m.onlyV, onlyC: m.onlyC, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboN.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), runs = { ctrl: {} }, names = Object.keys(VARS);
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearT(all, Y, 'half', 3); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearT(all, Y, VARS[nm], 0); if (v) runs[nm][Y] = v; } }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2 (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (contrôle) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const passers = [];
    for (const nm of names) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judge(runs.ctrl, runs[nm], rate), V = pool(runs[nm], 2011, 2022), rr = V.map((t) => t.rr).sort((p, q) => p - q);
      console.log('##', nm, '(TP :', VARS[nm] === 'near' ? 'bord proche' : VARS[nm] === 'half' ? 'moitié' : 'bord lointain', 'du FVG cible, sans plancher)');
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`RR visé : médiane ${rr[Math.floor(rr.length / 2)].toFixed(2)}, moyenne ${avg(rr).toFixed(2)}, Q1 ${rr[Math.floor(rr.length / 4)].toFixed(2)}, Q3 ${rr[Math.floor(rr.length * 3 / 4)].toFixed(2)}, part < 1 : ${(100 * rr.filter((x) => x < 1).length / rr.length).toFixed(0)} %`);
      console.log(`appariés : ${j.nMatched} | seulement variante : ${j.onlyV.length} (R moy ${avg(j.onlyV).toFixed(3)}) | seulement contrôle : ${j.onlyC.length} (R moy ${avg(j.onlyC).toFixed(3)})`);
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
