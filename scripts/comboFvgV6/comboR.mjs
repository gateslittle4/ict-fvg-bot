// comboR.mjs - F2 sur la SÉRIE CONTINUE (cibles de tout âge) : C-15C, C-30C (âge maximal de la cible) et M-C (règle du lundi). Règles et critères FIGÉS : voir docs/PREREG-F2-SERIE-CONTINUE.md (écrit avant tout calcul).
// Usage : node comboR.mjs <dossier data> train                 -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboR.mjs <dossier data> test <C-15C,M-C,...>   -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement pour les variantes qui passent
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { welch } from './comboI.mjs';
import { sessions, bullish, nyDate, addDays, dowOf } from './comboP_lundis.mjs';

export const VARS = { 'C-15C': { cap: 15 }, 'C-30C': { cap: 30 }, 'M-C': { monday: true } };
export const GAIN_MIN = 0.03, T_MIN = 2.13, DD_FACTOR = 1.25, RATE_MIN = 1.0, WEEKS_TEST = 155, N_MIN = 40, RR_NO_TARGET = 3; // 3 hypothèses : 0,05/3 -> z 2,13

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Dates (NY) qualifiantes : lundi dont le vendredi précédent (date - 3) est haussier. */
export function qualifyingDates(c) {
  const S = sessions(c), out = new Set();
  for (const d of S.keys()) if (dowOf(d) === 1 && bullish(S.get(addDays(d, -3)))) out.add(d);
  return out;
}

/** F2 sur un an civil. warm = 'full' (série continue : depuis la première bougie) ou 'old' (ancienne tranche octobre Y-1 -> décembre Y, pour le test d'identité). spec = {} (F2), {cap} ou {monday:true}. */
export function runYearR(all, Y, spec = {}, warm = 'full') {
  const i0 = warm === 'full' ? 0 : lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), Q = spec.monday ? qualifyingDates(c) : null;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, maxTargetAgeDays: spec.cap || null, buyOnly: true };
  if (spec.monday) o.noTargetRR = ({ m }) => (Q.has(nyDate(c[m].t)) ? RR_NO_TARGET : null);
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && (spec.monday && !a.tg ? true : sw(a)) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => { const none = !t.targetCreated && t.target[0] === 0 && t.target[1] === 0; return { key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, added: none, age: none ? null : (c[t.placedIdx].t - c[t.targetCreated].t) / 86400 }; });
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);
export function tOne(x) { const n = x.length; if (n < 2) return 0; const m = avg(x), sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return sd ? m / (sd / Math.sqrt(n)) : 0; }

/** Critères d'entraînement pour C-15C / C-30C (sur 2011-2022 ; rate = trades/semaine 2023-25, sans lire R). */
export function judgeCap(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tw = welch(rs(V), m.onlyC);
  const part = (res, a, b) => avg(rs(pool(res, a, b)));
  const mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tw >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tw, ddC, ddV, nRemoved: m.onlyC.length, avgRemoved: avg(m.onlyC), nOnlyV: m.onlyV.length, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}

/** Critères d'entraînement pour M-C (sur 2011-2022). */
export function judgeMon(ctrl, vari) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), add = V.filter((t) => t.added), A = pool(vari, 2011, 2016).filter((t) => t.added), B = pool(vari, 2017, 2022).filter((t) => t.added);
  const ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd, totC = rs(C).reduce((a, b) => a + b, 0), totV = rs(V).reduce((a, b) => a + b, 0), tt = tOne(rs(add));
  const c = { n: add.length >= N_MIN, t: avg(rs(add)) > 0 && tt >= T_MIN, halves: A.length > 0 && B.length > 0 && avg(rs(A)) > 0 && avg(rs(B)) > 0, total: totV > totC, dd: ddV <= DD_FACTOR * ddC };
  return { nAdd: add.length, mAdd: avg(rs(add)), tAdd: tt, nA: A.length, mA: avg(rs(A)), nB: B.length, mB: avg(rs(B)), totC, totV, ddC, ddV, nC: C.length, nV: V.length, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboR.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), names = Object.keys(VARS), runs = { ctrl: {} };
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const r = runYearR(all, Y, {}); if (r) runs.ctrl[Y] = r;
    for (const nm of names) { const v = runYearR(all, Y, VARS[nm]); if (v) runs[nm][Y] = v; }
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    const C = pool(runs.ctrl, 2011, 2022), ages = C.filter((t) => t.age != null).map((t) => t.age).sort((p, q) => p - q), sh = (d) => (100 * ages.filter((x) => x > d).length / ages.length).toFixed(0);
    console.log('CONTRÔLE F2C (série continue). Référence descriptive, ancien rejeu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, dd 27,4');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)');
    console.log(`Âge de la cible des trades de F2C (2011-2022, jours) : médiane ${ages[Math.floor(ages.length / 2)].toFixed(1)} | > 15 j : ${sh(15)} % | > 30 j : ${sh(30)} % | > 90 j : ${sh(90)} %\n`);
    const passers = [];
    for (const nm of names.filter((n) => VARS[n].cap)) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judgeCap(runs.ctrl, runs[nm], rate);
      console.log('##', nm, '(cible = FVG formé dans les', VARS[nm].cap, 'derniers jours)');
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`supprimés : ${j.nRemoved} (R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement variante : ${j.nOnlyV}`);
      console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch variante vs supprimés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`);
      if (j.pass) passers.push(nm);
    }
    { const nm = 'M-C', j = judgeMon(runs.ctrl, runs[nm]);
      console.log('## M-C (règle du lundi, série continue)');
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`trades ajoutés (sans cible) : ${j.nAdd} | R moyen ${j.mAdd.toFixed(3)} | t ${j.tAdd.toFixed(2)} | A : ${j.nA} trades, ${j.mA.toFixed(3)} | B : ${j.nB} trades, ${j.mB.toFixed(3)}`);
      console.log(`trades : F2C ${j.nC}, variante ${j.nV} | R total : F2C ${j.totC.toFixed(1)}, variante ${j.totV.toFixed(1)} | pire baisse : ${j.ddC.toFixed(1)} -> ${j.ddV.toFixed(1)}`);
      console.log('trades ajoutés en 2023-2025 (nombre seul, R non lu) :', pool(runs[nm], 2023, 2025).filter((t) => t.added).length);
      console.log(`critères : n>=${N_MIN}:${+j.c.n} t:${+j.c.t} moitiés:${+j.c.halves} total:${+j.c.total} dd:${+j.c.dd} => ${j.pass ? 'PASSE' : j.c.n ? 'rejetée' : 'NON CONCLUANT / rejetée'}\n`);
      if (j.pass) passers.push(nm); }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const C = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(C, V), add = V.filter((t) => t.added), totC = rs(C).reduce((x, y) => x + y, 0), totV = rs(V).reduce((x, y) => x + y, 0);
      if (VARS[nm].cap) console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(C), '| supprimés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(C)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
      else console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(C), '| ajoutés', add.length, 'R moy', avg(rs(add)).toFixed(3), '| R total', totC.toFixed(1), '->', totV.toFixed(1), a === 2023 ? '| verdict test : ' + (avg(rs(add)) > 0 && totV > totC ? 'OK' : 'KO') : '');
    }
  }
}
