// comboAL_fvg_matin_utc.mjs - FM2 : FVG formé entre 4 h et 7 h UTC, testé (ordre à 50 %) entre 7 h et 10 h UTC, achats et ventes, sans balayage H4.
// Règle et critères FIGÉS : voir docs/PREREG-FVG-FORME-4-7-TESTE-7-10-UTC.md (écrit avant tout calcul). Même moteur et mêmes critères que FM1 (comboAK_fvg_matin.mjs) ; seule l'horloge change : UTC fixe (axe du graphique de Krystofia).
// Usage : node comboAL_fvg_matin_utc.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAL_fvg_matin_utc.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si validée ou prometteuse
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { runYearT, WEEKS_TEST } from './comboT.mjs';
import { formedInWindow, judgeFM, ORDER_FROM, ORDER_TO, MAX_AGE } from './comboAK_fvg_matin.mjs';

const t0 = (y) => Date.UTC(y, 0, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Horloge UTC : t' = raw/1000 + 5 h, de sorte que nyHour(t') (décalage fixe de 5 h du moteur) renvoie l'heure UTC. Pas de correction d'heure d'été. */
export const utcClock = (all) => all.map((k) => ({ ...k, t: k.raw / 1000 + 5 * 3600 }));

/** FM2 sur un an civil, série continue. Renvoie { c, T } (c = bougies en horloge UTC). */
export function runYearFM2Raw(allUtc, Y) {
  const i1 = lowerRaw(allUtc, t0(Y + 1)), c = allUtc.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, ff = formedInWindow(c);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: MAX_AGE, hourFrom: ORDER_FROM, hourTo: ORDER_TO, entryFraction: RULES.entryFraction, buyOnly: false };
  const T = backtest(c, { ...o, filter: (a) => ff(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}
export const runYearFM2 = (allUtc, Y) => { const r = runYearFM2Raw(allUtc, Y); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, dir: t.dir })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAL_fvg_matin_utc.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), allUtc = utcClock(all), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a;
    const b = runYearFM2(allUtc, Y); if (b) vari[Y] = b;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (repère, attendu : 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    console.log('2011-2022', f(pool(ctrl, 2011, 2022)));
    console.log('\n## FM2 (FVG formé 4 h-7 h UTC, testé 7 h-10 h UTC, achats + ventes)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    const V = pool(vari, 2011, 2022), s = summarize(rs(V)), A = avg(rs(pool(vari, 2011, 2016))), B = avg(rs(pool(vari, 2017, 2022))), rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeFM(s, A, B, rate);
    console.log(`moy ${s.avgR.toFixed(3)} t ${s.t.toFixed(2)} | A ${A.toFixed(3)} B ${B.toFixed(3)} | dd ${s.dd.toFixed(1)} | /sem 2023-25 ${rate.toFixed(2)} (R non affiché)`);
    console.log(`critères : gain&t:${+j.c.gain} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.tier}`);
    console.log('\nDescriptif 2011-2022 (non jugé) :');
    for (const [lab, d] of [['achats', 1], ['ventes', -1]]) console.log(lab.padEnd(7), f(V.filter((t) => t.dir === d)));
    console.log('À lire au test :', j.tier === 'rejetée' ? 'rien' : 'FM2');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : FM2');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const V = pool(vari, a, b), C = pool(ctrl, a, b);
      console.log(lab.padEnd(18), 'FM2', f(V), '| achats', f(V.filter((t) => t.dir === 1)), '| ventes', f(V.filter((t) => t.dir === -1)), '| F2C (repère)', f(C), '| verdict test :', a === 2023 ? (avg(rs(V)) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
