// comboZ_ventes.mjs - F2S : F2 (achats) + ventes en miroir. Règle et critères FIGÉS : voir docs/PREREG-F2-AJOUT-VENTES.md (écrit avant tout calcul).
// Usage : node comboZ_ventes.mjs <dossier data> train   -> entraînement 2011-2022 (ventes 2023+ : nombre de trades seulement)
//         node comboZ_ventes.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, summarize, fmt } from './comboF.mjs';
import { runYearTRaw, WEEKS_TEST } from './comboT.mjs';
import { runYearSellRaw } from './comboW_premier.mjs';

/** Un an : achats F2C et ventes, trades bruts. Série fusionnée classée par bougie de sortie (puis de remplissage). */
export function runYearZ(all, Y) {
  const b = runYearTRaw(all, Y, {}); if (!b) return null; const s = runYearSellRaw(all, Y);
  const tag = (T, side) => T.map((t) => ({ side, r: t.r, why: t.why, fillIdx: t.fillIdx, exitIdx: t.exitIdx, entry: t.entry, stop: t.stop, tp: t.tp, exit: t.exit, risk: t.risk, dir: t.dir, placedIdx: t.placedIdx, zCreated: t.zCreated }));
  const buys = tag(b.T, 'B'), sells = tag(s.T, 'S'), merged = buys.concat(sells).sort((x, y) => x.exitIdx - y.exitIdx || x.fillIdx - y.fillIdx);
  return { buys, sells, merged, c: b.c };
}
/** Part des ventes dont l'intervalle [remplissage ; sortie] recoupe celui d'un achat (même année). */
export function overlapShare(buys, sells) {
  if (!sells.length) return 0; let n = 0;
  for (const s of sells) if (buys.some((b) => b.fillIdx <= s.exitIdx && s.fillIdx <= b.exitIdx)) n++;
  return n / sells.length;
}
const rs = (x) => x.map((t) => t.r);
const poolY = (res, a, b, k) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y][k]); return x; };
const ratio = (s) => (s.dd > 0 ? s.totalR / s.dd : Infinity);
export const T_MIN = 1.96, RATE_MIN = 1.0;

if (process.argv[1].endsWith('comboZ_ventes.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), res = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearZ(all, Y); if (r) res[Y] = r; console.error('année', Y, 'ok'); }
  const S = (k, a, b) => summarize(rs(poolY(res, a, b, k))), f = (k, a, b) => fmt(S(k, a, b));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4 ; rapport R/dd 4,73)');
    console.log('achats 2011-2022', f('buys', 2011, 2022));
    const fc = S('buys', 2011, 2022); console.log('rapport R/dd F2C :', ratio(fc).toFixed(2), '| trades/semaine 2023-25 achats :', (poolY(res, 2023, 2025, 'buys').length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    console.log('## Ventes en miroir seules');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f('sells', a, b));
    const sv = S('sells', 2011, 2022), A = S('sells', 2011, 2016), B = S('sells', 2017, 2022), rate = poolY(res, 2023, 2025, 'sells').length / WEEKS_TEST, fs = S('merged', 2011, 2022);
    console.log('\n## F2S = achats + ventes'); console.log('2011-2022 ', f('merged', 2011, 2022), '| rapport R/dd', ratio(fs).toFixed(2));
    const c = { t: sv.avgR > 0 && sv.t >= T_MIN, halves: A.avgR > 0 && B.avgR > 0, rate: rate >= RATE_MIN, ratio: ratio(fs) >= ratio(fc) }, pass = Object.values(c).every(Boolean);
    console.log(`ventes : moy ${sv.avgR.toFixed(3)} t ${sv.t.toFixed(2)} | A ${A.avgR.toFixed(3)} B ${B.avgR.toFixed(3)} | /sem 2023-25 ${rate.toFixed(2)} | R/dd F2S ${ratio(fs).toFixed(2)} contre F2C ${ratio(fc).toFixed(2)}`);
    console.log(`critères : ventes>0&t:${+c.t} moitiés:${+c.halves} rythme:${+c.rate} R/dd:${+c.ratio} => ${pass ? 'PASSE' : 'rejetée'}`);
    console.log('\nDescriptif 2011-2022 par année (R total achats | ventes) :'); let ov = 0, ns = 0;
    for (let Y = 2011; Y <= 2022; Y++) { const b = res[Y].buys, s = res[Y].sells; ov += overlapShare(b, s) * s.length; ns += s.length; console.log(Y, 'achats', b.reduce((q, t) => q + t.r, 0).toFixed(1).padStart(6), '| ventes', s.reduce((q, t) => q + t.r, 0).toFixed(1).padStart(6), `(n ${s.length})`); }
    console.log('part des ventes ouvertes en même temps qu\'un achat :', (100 * ov / ns).toFixed(0), '%');
    console.log('À lire au test :', pass ? 'F2S' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : F2S');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const bu = S('buys', a, b), se = S('sells', a, b), me = S('merged', a, b);
      console.log(lab.padEnd(18), 'achats', fmt(bu), '| ventes', fmt(se), '| F2S', fmt(me), '| R/dd achats', ratio(bu).toFixed(2), 'F2S', ratio(me).toFixed(2), '| verdict test :', a === 2023 ? (se.avgR > 0 && ratio(me) >= ratio(bu) ? 'OK' : 'KO') : '—');
    }
  }
}
