// comboAA_rr.mjs - F2 avec plancher de RR de 5 et de 6 (RR5, RR6). Règles et critères FIGÉS : voir docs/PREREG-F2-RR-5-ET-6.md (écrit avant tout calcul).
// Usage : node comboAA_rr.mjs <dossier data> train               -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAA_rr.mjs <dossier data> test <RR5,RR6>      -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement pour les variantes qui passent
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match, pairedT } from './comboL.mjs';
import { runYearT, WEEKS_TEST } from './comboT.mjs';

export const VARS = { RR5: 5, RR6: 6 };
export const GAIN_MIN = 0.03, T_MIN = 1.96, DD_FACTOR = 1.25, RATE_MIN = 1.5;
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil, série continue, plancher de RR = minRR (3 = F2C). Renvoie { c, T } (trades complets). */
export function runYearRRRaw(all, Y, minRR = RULES.minRR) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}
export const runYearRR = (all, Y, minRR) => { const r = runYearRRRaw(all, Y, minRR); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, rr: Math.abs(t.tp - t.entry) / t.risk })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);
const part = (res, a, b) => avg(rs(pool(res, a, b)));
const med = (x) => { const s = x.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Critères d'entraînement. */
export function judgeRR(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tp = pairedT(m.d), mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tp >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tp, ddC, ddV, nMatched: m.d.length, nOnlyV: m.onlyV.length, nOnlyC: m.onlyC.length, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboAA_rr.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), names = Object.keys(VARS), runs = { ctrl: {} };
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearT(all, Y, {}); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearRR(all, Y, VARS[nm]); if (v) runs[nm][Y] = v; } console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const passers = [];
    for (const nm of names) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judgeRR(runs.ctrl, runs[nm], rate), V = pool(runs[nm], 2011, 2022), tpN = V.filter((t) => t.why === 'tp'), tm = V.filter((t) => t.why === 'temps');
      console.log(`## ${nm} (plancher ${VARS[nm]} R)`);
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`TP touchés ${(100 * tpN.length / V.length).toFixed(1)} % | sorties au temps ${(100 * tm.length / V.length).toFixed(1)} % (R moy ${avg(rs(tm)).toFixed(2)}) | RR visé médian ${med(V.map((t) => t.rr)).toFixed(2)}, moyen ${avg(V.map((t) => t.rr)).toFixed(2)} | trades : appariés ${j.nMatched}, ajoutés ${j.nOnlyV}, retirés ${j.nOnlyC}`);
      console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | t apparié ${j.tp.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`); if (j.pass) passers.push(nm);
    }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(Cc, V);
      console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| diff appariée moy', avg(m.d).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.d) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
