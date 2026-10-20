// comboQ.mjs - F2 : règle du lundi (lundi après vendredi haussier : acheter même sans cible, TP 3 R, sans exiger le balayage H4). Règles et critères FIGÉS : voir docs/PREREG-F2-REGLE-LUNDI.md (écrit avant tout calcul).
// Usage : node comboQ.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seul le nombre de trades ajoutés est affiché)
//         node comboQ.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), à ne lancer que si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestW.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { sessions, bullish, nyDate, addDays, dowOf } from './comboP_lundis.mjs';

export const RR_NO_TARGET = 3, N_MIN = 40, T_MIN = 1.65, DD_FACTOR = 1.25;
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Dates (NY) qualifiantes : lundi dont le vendredi précédent (date - 3) est haussier. */
export function qualifyingDates(c) {
  const S = sessions(c), out = new Set();
  for (const d of S.keys()) if (dowOf(d) === 1 && bullish(S.get(addDays(d, -3)))) out.add(d);
  return out;
}

/** F2 sur un an civil ; rule = true : règle du lundi active. Renvoie des trades { key, r, added } (added = ordre sans FVG cible). */
export function runYearQ(all, Y, rule) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const Q = rule ? qualifyingDates(c) : null, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  if (rule) o.noTargetRR = ({ m }) => (Q.has(nyDate(c[m].t)) ? RR_NO_TARGET : null);
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && (a.tg ? sw(a) : true) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, added: !t.targetCreated && t.target[0] === 0 && t.target[1] === 0 }));
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);
export function tOne(x) { const n = x.length; if (n < 2) return 0; const m = avg(x), sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return sd ? m / (sd / Math.sqrt(n)) : 0; }

/** Critères d'entraînement 1 à 5 (sur 2011-2022). */
export function judge(ctrl, vari) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), add = V.filter((t) => t.added), A = pool(vari, 2011, 2016).filter((t) => t.added), B = pool(vari, 2017, 2022).filter((t) => t.added);
  const ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd, totC = rs(C).reduce((a, b) => a + b, 0), totV = rs(V).reduce((a, b) => a + b, 0), tt = tOne(rs(add));
  const c = { n: add.length >= N_MIN, t: avg(rs(add)) > 0 && tt >= T_MIN, halves: A.length > 0 && B.length > 0 && avg(rs(A)) > 0 && avg(rs(B)) > 0, total: totV > totC, dd: ddV <= DD_FACTOR * ddC };
  return { nAdd: add.length, mAdd: avg(rs(add)), tAdd: tt, nA: A.length, mA: avg(rs(A)), nB: B.length, mB: avg(rs(B)), totC, totV, ddC, ddV, nC: C.length, nV: V.length, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboQ.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) { const a = runYearQ(all, Y, false), b = runYearQ(all, Y, true); if (a) ctrl[Y] = a; if (b) vari[Y] = b; }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2 (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('\nVARIANTE (règle du lundi)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(vari, a, b)));
    const j = judge(ctrl, vari);
    console.log(`\ntrades ajoutés (sans cible) : ${j.nAdd} | R moyen ${j.mAdd.toFixed(3)} | t ${j.tAdd.toFixed(2)} | A : ${j.nA} trades, ${j.mA.toFixed(3)} | B : ${j.nB} trades, ${j.mB.toFixed(3)}`);
    console.log(`trades : contrôle ${j.nC}, variante ${j.nV} (écart ${j.nV - j.nC}, dont ${j.nAdd} ajoutés ; le reste = effets de bord d'occupation) | R total : contrôle ${j.totC.toFixed(1)}, variante ${j.totV.toFixed(1)} | pire baisse : ${j.ddC.toFixed(1)} -> ${j.ddV.toFixed(1)}`);
    console.log('trades ajoutés en 2023-2025 (nombre seul, R non lu) :', pool(vari, 2023, 2025).filter((t) => t.added).length);
    console.log(`critères : n>=${N_MIN}:${+j.c.n} t:${+j.c.t} moitiés:${+j.c.halves} total:${+j.c.total} dd:${+j.c.dd} => ${j.pass ? 'PASSE' : j.c.n ? 'rejetée' : 'NON CONCLUANT (trop peu de trades ajoutés) / rejetée'}`);
  } else {
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const C = pool(ctrl, a, b), V = pool(vari, a, b), add = V.filter((t) => t.added), totC = rs(C).reduce((x, y) => x + y, 0), totV = rs(V).reduce((x, y) => x + y, 0);
      console.log(lab.padEnd(18), 'variante', f(V), '| contrôle', f(C), '| ajoutés', add.length, 'R moy', avg(rs(add)).toFixed(3), '| R total', totC.toFixed(1), '->', totV.toFixed(1), a === 2023 ? '| verdict test : ' + (avg(rs(add)) > 0 && totV > totC ? 'OK' : 'KO') : '');
    }
  }
}
