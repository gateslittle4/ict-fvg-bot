// comboX_direction.mjs - F2 avec filtre de direction du matin (D930, D06). Règles et critères FIGÉS : voir docs/PREREG-F2-DIRECTION-MATIN.md (écrit avant tout calcul).
// Usage : node comboX_direction.mjs <dossier data> train                -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboX_direction.mjs <dossier data> test <D930,D06>      -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement pour les variantes qui passent
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';
import { match } from './comboL.mjs';
import { runYearT, judgeH1, WEEKS_TEST } from './comboT.mjs';

// refHour : heure NY de la bougie de référence ; fromHour : les ordres posés avant cette heure sont gardés sans condition (D930 : 9,5 ; D06 : 6, donc tous filtrés)
export const VARS = { D930: { refHour: 9.5, fromHour: 9.5 }, D06: { refHour: 6, fromHour: 6 } };
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
export const nyDate = (t) => new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10);

/** Filtre de direction : l'ordre posé à la bougie m n'est accepté que si c[m].c > ouverture de la bougie de référence du jour (première bougie du jour à partir de refHour), pour les bougies de pose à partir de fromHour. */
export function directionFilter(c, { refHour, fromHour }) {
  const day = new Array(c.length), hr = new Float64Array(c.length), ref = new Map();
  for (let i = 0; i < c.length; i++) { day[i] = nyDate(c[i].t); hr[i] = nyHour(c[i].t); if (hr[i] >= refHour && !ref.has(day[i])) ref.set(day[i], i); }
  return (m) => { if (hr[m] < fromHour) return true; const r = ref.get(day[m]); return r !== undefined && r <= m && c[m].c > c[r].o; };
}

/** F2 sur un an civil, série continue, avec le filtre. spec = {} (F2C) ou { refHour, fromHour }. Renvoie les trades complets avec c. */
export function runYearXRaw(all, Y, spec = {}) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const df = spec.refHour != null ? directionFilter(c, spec) : null;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) && (!df || df(a.m)) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}
export const runYearX = (all, Y, spec) => { const r = runYearXRaw(all, Y, spec); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboX_direction.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), names = Object.keys(VARS), runs = { ctrl: {} };
  for (const nm of names) runs[nm] = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearT(all, Y, {}); if (r) runs.ctrl[Y] = r; for (const nm of names) { const v = runYearX(all, Y, VARS[nm]); if (v) runs[nm][Y] = v; } console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(runs.ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(runs.ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const passers = [], C = pool(runs.ctrl, 2011, 2022);
    for (const nm of names) {
      const rate = pool(runs[nm], 2023, 2025).length / WEEKS_TEST, j = judgeH1(runs.ctrl, runs[nm], rate), m = match(C, pool(runs[nm], 2011, 2022));
      console.log(`## ${nm} (refHour ${VARS[nm].refHour}, ordres filtrés à partir de ${VARS[nm].fromHour} h)`);
      for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(runs[nm], a, b)));
      console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement variante : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
      console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch variante vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
      console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}\n`); if (j.pass) passers.push(nm);
    }
    console.log('À lire au test :', passers.join(',') || 'rien');
  } else {
    const sel = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', sel.join(','));
    for (const nm of sel) for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(runs.ctrl, a, b), V = pool(runs[nm], a, b), m = match(Cc, V);
      console.log(nm, lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
