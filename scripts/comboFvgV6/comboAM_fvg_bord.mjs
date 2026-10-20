// comboAM_fvg_bord.mjs - FM3 : FVG formé 4 h-7 h NY (c1 ouverte entre 4 h et 7 h), testé 7 h-10 h, entrée au bord proche, stop = ouverture de c2 ± 0,5 pt, cible 5 R fixe, ré-entrée au marché après un stop (au plus 2).
// Règle et critères FIGÉS : voir docs/PREREG-FVG-4-7-BORD-STOP-SERRE-REENTREE.md (SHA-256 9e9eb8ae...654b, écrit avant tout calcul). Moteur : lib/krysBacktestE.js.
// Usage : node comboAM_fvg_bord.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAM_fvg_bord.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si validée ou prometteuse
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestE.js';
import { nyHour } from './lib/krysMethod.js';
import { runYearT, WEEKS_TEST } from './comboT.mjs';
import { judgeFM, ORDER_FROM, ORDER_TO, MAX_AGE } from './comboAK_fvg_matin.mjs';

export const FORM_FROM = 4, FORM_TO = 7, REENTRY_FROM = 7, REENTRY_TO = 9.75, MAX_REENTRY = 2, RR = 5, MARGIN_PTS = 0.5; // MARGIN_PTS : à l'échelle 8 200, comme le spread
const t0 = (y) => Date.UTC(y, 0, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Filtre de formation : la PREMIÈRE bougie du FVG (c1, indice created - 2) s'ouvre entre 4 h 00 (incluse) et 7 h 00 (exclue), heure NY du moteur. */
export const formedC1 = (c) => ({ z }) => { const h = nyHour(c[z.created - 2].t); return h >= FORM_FROM && h < FORM_TO; };

/** FM3 sur un an civil, série continue. spreadMult = 1 (règle) ou 2 (descriptif). Renvoie { c, T, k, start, reStats }. */
export function runYearFM3Raw(all, Y, spreadMult = 1) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, ff = formedC1(c), margin = MARGIN_PTS * k;
  const o = {
    start, spread: RULES.spread * k * spreadMult, stopMargin: margin, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode,
    maxAge: MAX_AGE, hourFrom: ORDER_FROM, hourTo: ORDER_TO, entryFraction: 0, buyOnly: false,
    stopFn: ({ z }) => (z.dir < 0 ? c[z.created - 1].o + margin : c[z.created - 1].o - margin),
    tpFn: ({ z, entry, risk }) => entry + z.dir * RR * risk,
    reentry2: { max: MAX_REENTRY, from: REENTRY_FROM, to: REENTRY_TO, rr: RR, margin },
    filter: (a) => ff(a),
  };
  const bt = backtest(c, o);
  const T = bt.trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, k, start, reStats: bt.reStats };
}
export const runYearFM3 = (all, Y, spreadMult = 1) => { const r = runYearFM3Raw(all, Y, spreadMult); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}:${t.rn || 0}`, r: t.r, why: t.why, dir: t.dir, re: !!t.reentry, risk: t.risk, rk: t.risk / r.k })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const median = (x) => { if (!x.length) return 0; const s = [...x].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAM_fvg_bord.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, dbl = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a;
    const b = runYearFM3(all, Y); if (b) vari[Y] = b;
    if (mode === 'train' && Y <= 2022) { const d = runYearFM3(all, Y, 2); if (d) dbl[Y] = d; }
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (repère, attendu : 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    console.log('2011-2022', f(pool(ctrl, 2011, 2022)));
    console.log('\n## FM3 (FVG formé 4 h-7 h (c1), testé 7 h-10 h, bord proche, stop = ouverture de c2, 5 R, <= 2 ré-entrées)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    const V = pool(vari, 2011, 2022), s = summarize(rs(V)), A = avg(rs(pool(vari, 2011, 2016))), B = avg(rs(pool(vari, 2017, 2022))), rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeFM(s, A, B, rate);
    console.log(`moy ${s.avgR.toFixed(3)} t ${s.t.toFixed(2)} | A ${A.toFixed(3)} B ${B.toFixed(3)} | dd ${s.dd.toFixed(1)} | /sem 2023-25 ${rate.toFixed(2)} (R non affiché)`);
    console.log(`critères : gain&t:${+j.c.gain} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.tier}`);
    console.log('\nDescriptif 2011-2022 (non jugé) :');
    for (const [lab, x] of [['origine', V.filter((t) => !t.re)], ['ré-entrées', V.filter((t) => t.re)], ['achats', V.filter((t) => t.dir === 1)], ['ventes', V.filter((t) => t.dir === -1)]]) console.log(lab.padEnd(10), f(x));
    const D = pool(dbl, 2011, 2022);
    console.log(`part des trades à 5 R : ${(100 * V.filter((t) => t.why === 'tp').length / V.length).toFixed(1)} % | sortis au temps : ${(100 * V.filter((t) => t.why === 'temps').length / V.length).toFixed(1)} % | stops : ${(100 * V.filter((t) => t.why === 'stop').length / V.length).toFixed(1)} %`);
    console.log(`stop : distance médiane ${median(V.map((t) => t.risk)).toFixed(1)} pts bruts, ${median(V.map((t) => t.rk)).toFixed(1)} pts à l'échelle 8 200 | trades dont le risque <= 4 x spread : ${(100 * V.filter((t) => t.rk <= 4 * RULES.spread).length / V.length).toFixed(1)} %`);
    console.log('spread doublé :', f(D));
    console.log('À lire au test :', j.tier === 'rejetée' ? 'rien' : 'FM3');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : FM3');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const V = pool(vari, a, b), C = pool(ctrl, a, b);
      console.log(lab.padEnd(18), 'FM3', f(V), '| origine', f(V.filter((t) => !t.re)), '| ré-entrées', f(V.filter((t) => t.re)), '| achats', f(V.filter((t) => t.dir === 1)), '| ventes', f(V.filter((t) => t.dir === -1)), '| F2C (repère)', f(C), '| verdict test :', a === 2023 ? (avg(rs(V)) > 0 ? 'OK' : 'KO') : '—');
    }
  }
}
