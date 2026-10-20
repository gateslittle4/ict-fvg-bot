// comboAB_premier_fvg.mjs - F2 avec « premier FVG après le balayage H4 » (FB1). Règle et critères FIGÉS : voir docs/PREREG-F2-PREMIER-FVG-APRES-BALAYAGE.md (écrit avant tout calcul).
// Usage : node comboAB_premier_fvg.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAB_premier_fvg.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter, h4Sweeps } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { runYearT, judgeH1, WEEKS_TEST } from './comboT.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/**
 * Épisodes de balayage : pour chaque bougie m qui crée un FVG d'achat brut (c[m-2].h < c[m].l) avec un balayage H4 connu (li = lastLow[m] >= 0),
 * rang[m] = nombre de FVG d'achat bruts créés jusqu'à m (inclus) avec la même li (1 = premier de l'épisode). rang[m] = 0 si m ne crée pas de FVG d'achat ou si li < 0.
 * Causal : le rang de m ne dépend que de bougies <= m.
 */
export function fvgRank(c, N = RULES.N) {
  const { lastLow } = h4Sweeps(c, N), rang = new Int32Array(c.length), cnt = new Map();
  for (let m = 2; m < c.length; m++) {
    if (!(c[m - 2].h < c[m].l)) continue;
    const li = lastLow[m]; if (li < 0) continue;
    const r = (cnt.get(li) || 0) + 1; cnt.set(li, r); rang[m] = r;
  }
  return rang;
}
/** Filtre FB1 : l'ordre n'est posé que si le FVG d'entrée est le premier de son épisode. */
export const firstFvgFilter = (c) => { const r = fvgRank(c); return (z) => r[z.created] === 1; };

/** F2 sur un an civil, série continue. mode 'fb1' ou 'old' (F2C). Renvoie { c, T }. */
export function runYearABRaw(all, Y, mode = 'fb1') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const ff = mode === 'fb1' ? firstFvgFilter(c) : null;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) && (!ff || ff(a.z)) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}
export const runYearAB = (all, Y, mode) => { const r = runYearABRaw(all, Y, mode); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, rank: mode === 'old' ? fvgRank(r.c)[t.zCreated] : 1 })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAB_premier_fvg.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, desc = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a;
    const b = runYearAB(all, Y, 'fb1'); if (b) vari[Y] = b;
    const d = runYearAB(all, Y, 'old'); if (d) desc[Y] = d;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## FB1 (premier FVG d\'achat après le balayage H4)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement FB1 : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch FB1 vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const D = pool(desc, 2011, 2022), first = D.filter((t) => t.rank === 1), later = D.filter((t) => t.rank > 1);
    console.log(`DESCRIPTIF F2C 2011-22 : premier FVG ${first.length} (${(100 * first.length / D.length).toFixed(0)} %, R moy ${avg(rs(first)).toFixed(3)}) | suivants ${later.length} (R moy ${avg(rs(later)).toFixed(3)}) | rang moyen ${avg(D.map((t) => t.rank)).toFixed(2)}`);
    console.log('À lire au test :', j.pass ? 'FB1' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : FB1');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log(lab.padEnd(18), 'FB1', f(V), '| F2C', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
