// comboAK_fvg_matin.mjs - FM1 : FVG formé entre 4 h et 7 h NY, testé (ordre à 50 %) entre 7 h et 10 h, achats et ventes, sans balayage H4.
// Règle et critères FIGÉS : voir docs/PREREG-FVG-FORME-4-7-TESTE-7-10.md (écrit avant tout calcul).
// Usage : node comboAK_fvg_matin.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAK_fvg_matin.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si validée ou prometteuse
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { nyHour } from './lib/krysMethod.js';
import { runYearT, WEEKS_TEST } from './comboT.mjs';

export const FORM_FROM = 4, FORM_TO = 7, ORDER_FROM = 6.75, ORDER_TO = 9.75, MAX_AGE = 24; // ordre posé de 6 h 45 à 9 h 30 : remplissage possible de 7 h 00 à 9 h 45 (bougies ouvertes)
export const T_MIN = 1.96, T_FLOOR = 1.0, DD_MAX = 34.3, RATE_MIN = 1.0;
const t0 = (y) => Date.UTC(y, 0, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Filtre de formation : la bougie c3 du FVG s'ouvre entre 4 h 00 (incluse) et 7 h 00 (exclue), heure NY du moteur. */
export const formedInWindow = (c) => ({ z }) => { const h = nyHour(c[z.created].t); return h >= FORM_FROM && h < FORM_TO; };

/** FM1 sur un an civil, série continue. Renvoie { c, T } (trades complets, achats et ventes). */
export function runYearFMRaw(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, ff = formedInWindow(c);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: MAX_AGE, hourFrom: ORDER_FROM, hourTo: ORDER_TO, entryFraction: RULES.entryFraction, buyOnly: false };
  const T = backtest(c, { ...o, filter: (a) => ff(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}
export const runYearFM = (all, Y) => { const r = runYearFMRaw(all, Y); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, dir: t.dir })); };

/** Critères d'entraînement et palier. s = résumé 2011-2022, A et B = moyennes des moitiés, rate = trades par semaine 2023-2025. */
export function judgeFM(s, A, B, rate) {
  const c = { gain: s.avgR > 0 && s.t >= T_MIN, halves: A > 0 && B > 0, dd: s.dd <= DD_MAX, rate: rate >= RATE_MIN };
  const pass = Object.values(c).every(Boolean);
  const promising = !pass && !c.gain && s.avgR > 0 && s.t >= T_FLOOR && c.halves && c.dd && c.rate;
  return { c, pass, tier: pass ? 'validée' : promising ? 'prometteuse' : 'rejetée' };
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAK_fvg_matin.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a;
    const b = runYearFM(all, Y); if (b) vari[Y] = b;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (repère, attendu : 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    console.log('2011-2022', f(pool(ctrl, 2011, 2022)));
    console.log('\n## FM1 (FVG formé 4 h-7 h, testé 7 h-10 h, achats + ventes)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    const V = pool(vari, 2011, 2022), s = summarize(rs(V)), A = avg(rs(pool(vari, 2011, 2016))), B = avg(rs(pool(vari, 2017, 2022))), rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeFM(s, A, B, rate);
    console.log(`moy ${s.avgR.toFixed(3)} t ${s.t.toFixed(2)} | A ${A.toFixed(3)} B ${B.toFixed(3)} | dd ${s.dd.toFixed(1)} | /sem 2023-25 ${rate.toFixed(2)} (R non affiché)`);
    console.log(`critères : gain&t:${+j.c.gain} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.tier}`);
    console.log('\nDescriptif 2011-2022 (non jugé) :');
    for (const [lab, d] of [['achats', 1], ['ventes', -1]]) { const x = V.filter((t) => t.dir === d); console.log(lab.padEnd(7), f(x)); }
    console.log('À lire au test :', j.tier === 'rejetée' ? 'rien' : 'FM1');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : FM1');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const V = pool(vari, a, b), C = pool(ctrl, a, b);
      console.log(lab.padEnd(18), 'FM1', f(V), '| achats', f(V.filter((t) => t.dir === 1)), '| ventes', f(V.filter((t) => t.dir === -1)), '| F2C (repère)', f(C), '| verdict test :', a === 2023 ? (avg(rs(V)) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
