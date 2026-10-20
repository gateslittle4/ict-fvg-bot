// comboT.mjs - F2 : H1 (pas d'ordre quand le stop est court : S >= 1,76) et H2 (breakeven à 1 R). Règles et critères FIGÉS : voir docs/PREREG-F2-STOP-COURT-ET-BREAKEVEN.md (écrit avant tout calcul).
// Usage : node comboT.mjs <dossier data> train                -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboT.mjs <dossier data> test <H1,H2>          -> lecture unique du test 2023-2025 (et 2026 descriptif)
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match, pairedT } from './comboL.mjs';
import { welch } from './comboI.mjs';

export const VARS = { H1: { sMin: 1.76 }, H2: { beR: 1 } };
export const GAIN_MIN = 0.03, T_MIN = 1.96, DD_FACTOR = 1.25, RATE_MIN = 1.0, WEEKS_TEST = 155; // 2 hypothèses : 0,05/2 -> z 1,96
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** S = risque / amplitude moyenne des 96 bougies M15 précédant la bougie de pose m (ps = sommes cumulées de h - l). */
export const sOf = (ps, m, risk) => (m >= 96 ? risk / ((ps[m] - ps[m - 96]) / 96) : Infinity);

/** F2 sur un an civil, série continue. spec = {} (F2C), { sMin } (H1) ou { beR } (H2). Renvoie des trades { key, r, why, be }. */
export function runYearT(all, Y, spec = {}) { const r = runYearTRaw(all, Y, spec); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, be: !!t.be })); }
/** Idem, avec les chandeliers et les trades complets (pour les tests). */
export function runYearTRaw(all, Y, spec = {}) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const ps = new Float64Array(c.length + 1); for (let i = 0; i < c.length; i++) ps[i + 1] = ps[i] + (c[i].h - c[i].l);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true, beR: spec.beR || null };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) && (spec.sMin == null || sOf(ps, a.m, a.risk) >= spec.sMin) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, ps, T };
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);
const part = (res, a, b) => avg(rs(pool(res, a, b)));

/** Critères d'entraînement H1 : gain, Welch gardés/supprimés, moitiés, baisse, rythme. */
export function judgeH1(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tw = welch(rs(V), m.onlyC), mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tw >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tw, ddC, ddV, nRemoved: m.onlyC.length, avgRemoved: avg(m.onlyC), nOnlyV: m.onlyV.length, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}
/** Critères d'entraînement H2 : gain, t apparié, moitiés, baisse, rythme. */
export function judgeH2(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V), tp = pairedT(m.d), mc = avg(rs(C)), mv = avg(rs(V)), ddC = summarize(rs(C)).dd, ddV = summarize(rs(V)).dd;
  const c = { gain: mv >= mc + GAIN_MIN, t: tp >= T_MIN, halves: part(vari, 2011, 2016) > part(ctrl, 2011, 2016) && part(vari, 2011, 2016) > 0 && part(vari, 2017, 2022) > part(ctrl, 2017, 2022) && part(vari, 2017, 2022) > 0, dd: ddV <= DD_FACTOR * ddC, rate: rate >= RATE_MIN };
  return { mc, mv, tp, ddC, ddV, nMatched: m.d.length, nOnlyV: m.onlyV.length, nOnlyC: m.onlyC.length, a: part(vari, 2011, 2016), b: part(vari, 2017, 2022), aC: part(ctrl, 2011, 2016), bC: part(ctrl, 2017, 2022), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboT.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), names = Object.keys(VARS), runs = { ctrl: {} };
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearT(all, Y, {}); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearT(all, Y, VARS[nm]); if (v) runs[nm][Y] = v; } console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const passers = [], C = pool(runs.ctrl, 2011, 2022);
    { const nm = 'H1', rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judgeH1(runs.ctrl, runs[nm], rate);
      console.log('## H1 (S >= 1,76)'); for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`supprimés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement variante : ${j.nOnlyV}`);
      console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch gardés vs supprimés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`); if (j.pass) passers.push(nm); }
    { const nm = 'H2', rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judgeH2(runs.ctrl, runs[nm], rate), V = pool(runs[nm], 2011, 2022);
      console.log('## H2 (breakeven à 1 R)'); for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      const cm = new Map(C.map((t) => [t.key, t])), pairs = V.filter((t) => cm.has(t.key));
      const be = V.filter((t) => t.be).length, beZero = V.filter((t) => t.why === 'be').length, g2z = pairs.filter((t) => t.why === 'be' && cm.get(t.key).why === 'tp').length, s2z = pairs.filter((t) => t.why === 'be' && cm.get(t.key).why === 'stop').length, tp = C.filter((t) => t.why === 'tp').length, st = C.filter((t) => t.why === 'stop').length;
      console.log(`trades qui touchent +1 R : ${be} sur ${V.length} (${(100 * be / V.length).toFixed(0)} %) | sortis à 0 R : ${beZero} | gagnants de F2C devenus 0 R : ${g2z} sur ${tp} | stops de F2C devenus 0 R : ${s2z} sur ${st}`);
      console.log(`appariés ${j.nMatched} | seulement variante ${j.nOnlyV} | seulement F2C ${j.nOnlyC} | R total : F2C ${C.reduce((a, t) => a + t.r, 0).toFixed(1)}, variante ${V.reduce((a, t) => a + t.r, 0).toFixed(1)}`);
      console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | t apparié ${j.tp.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`); if (j.pass) passers.push(nm); }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(Cc, V);
      if (nm === 'H1') console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| supprimés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
      else console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| diff moyenne appariée', avg(m.d).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.d) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
