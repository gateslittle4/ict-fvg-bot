// comboAI_ob_m5.mjs - setup « OB M15 avec FVG M5 dedans » (OBM5), achats, contexte H4 de F2. Règle et critères FIGÉS : voir docs/PREREG-OB-M15-FVG-M5.md (écrit avant tout calcul).
// Usage : node comboAI_ob_m5.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAI_ob_m5.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import fs from 'node:fs';
import { loadAll, readM1, dstHours, RULES, summarize, fmt } from './comboF.mjs';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { obBacktest } from './lib/obEngine.js';
import { runYearT, WEEKS_TEST, DD_FACTOR, RATE_MIN, T_MIN } from './comboT.mjs';

const D = process.argv[2] || '/mnt/user-data/uploads/ict-fvg-bot/data';
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** M1 -> barres de `periodMs`, même convention de temps que loadAll (t = raw/1000 + décalage d'été US en heures). */
export function toBars(rows, periodMs) {
  const out = []; let cur = null;
  for (const [ms, o, h, l, c] of rows) {
    const b = Math.floor(ms / periodMs);
    if (!cur || cur.b !== b) { if (cur) out.push(cur); cur = { b, raw: b * periodMs, o, h, l, c }; } else { if (h > cur.h) cur.h = h; if (l < cur.l) cur.l = l; cur.c = c; }
  }
  if (cur) out.push(cur);
  return out.map((x) => ({ t: x.raw / 1000 + dstHours(x.raw) * 3600, o: x.o, h: x.h, l: x.l, c: x.c, raw: x.raw }));
}
export function loadM5() {
  const hist = readM1(`${D}/histdata-m1/US100.csv.gz`), brk = readM1(`${D}/real-m1-full/US100.csv.gz`), cut = brk[0][0];
  return toBars(hist.filter((r) => r[0] < cut).concat(brk), 300000);
}

/** OBM5 sur un an civil, série continue. Renvoie { c, T, cnt } ; spreadMult double le spread (stress de coût, descriptif). */
export function runYearOBRaw(all, all5, Y, spreadMult = 1) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const c5 = all5.slice(0, lowerRaw(all5, t0(Y + 1))), px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const cnt = { fvg_sweep: 0, ob: 0, m5: 0, untouched: 0, target: 0, order: 0 }, inY = (m) => m >= start && c[m].raw < t0(Y + 1);
  const r = obBacktest(c, c5, { start, spread: RULES.spread * k * spreadMult, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, sweep: sw, onStage: (n, m) => { if (inY(m)) cnt[n]++; } });
  return { c, T: r.trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1)), cnt };
}
export const runYearOB = (all, all5, Y, mult) => { const r = runYearOBRaw(all, all5, Y, mult); return r && { cnt: r.cnt, trades: r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.obIdx}`, r: t.r, why: t.why, rr: (t.tp - t.entry) / t.risk, year: Y })) }; };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y].trades); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement OBM5 ; ctrl = trades de F2C 2011-2022 (référence de niveau). */
export function judgeOB(vari, ctrlTrades, rate) {
  const V = pool(vari, 2011, 2022), sV = summarize(rs(V)), sC = summarize(rs(ctrlTrades)), a = avg(rs(pool(vari, 2011, 2016))), b = avg(rs(pool(vari, 2017, 2022)));
  const c = { mean: sV.avgR > 0 && sV.t >= T_MIN, halves: a > 0 && b > 0, level: sV.avgR >= sC.avgR, dd: sV.dd <= DD_FACTOR * sC.dd, rate: rate >= RATE_MIN };
  return { sV, sC, a, b, rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboAI_ob_m5.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), all5 = loadM5(), ctrl = {}, vari = {}, stress = {};
  console.error('M15', all.length, '| M5', all5.length);
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = { trades: a };
    const b = runYearOB(all, all5, Y, 1); if (b) vari[Y] = b;
    if (Y <= 2022) { const d = runYearOB(all, all5, Y, 2); if (d) stress[Y] = d; }
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeOB(vari, pool(ctrl, 2011, 2022), rate);
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '| OBM5 :', rate.toFixed(2), '(R du test non affiché)\n');
    console.log('## OBM5 (OB M15 + FVG M5 dedans, entrée à 50 % du FVG M5)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    const cs = { fvg_sweep: 0, ob: 0, m5: 0, untouched: 0, target: 0, order: 0 }; for (let Y = 2011; Y <= 2022; Y++) if (vari[Y]) for (const k of Object.keys(cs)) cs[k] += vari[Y].cnt[k];
    const V = pool(vari, 2011, 2022), w = (x) => x.filter((t) => t.why === 'tp').length;
    console.log(`chaîne : FVG M15 + balayage ${cs.fvg_sweep} -> OB ${cs.ob} -> FVG M5 dedans ${cs.m5} -> niveau non touché ${cs.untouched} -> cible ${cs.target} -> ordres ${cs.order} -> remplis ${V.length}`);
    console.log(`TP ${w(V)} sur ${V.length} (${(100 * w(V) / V.length).toFixed(0)} %) | RR visé moyen ${avg(V.map((t) => t.rr)).toFixed(2)}`);
    console.log(`R moyen par an : ${Object.keys(vari).filter((y) => y <= 2022).map((y) => `${y}: ${avg(rs(vari[y].trades)).toFixed(2)} (${vari[y].trades.length})`).join('  ')}`);
    console.log(`R total ${j.sV.totalR.toFixed(1)} | moy ${j.sV.avgR.toFixed(3)} (F2C ${j.sC.avgR.toFixed(3)}) t ${j.sV.t.toFixed(2)} | A ${j.a.toFixed(3)} B ${j.b.toFixed(3)} | dd ${j.sV.dd.toFixed(1)} (F2C ${j.sC.dd.toFixed(1)})`);
    console.log(`critères : moyenne(>0,t>=1,96):${+j.c.mean} moitiés:${+j.c.halves} niveau(>=F2C):${+j.c.level} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    console.log(`DESCRIPTIF (non jugé) spread doublé : ${f(pool(stress, 2011, 2022))}`);
    console.log('À lire au test :', j.pass ? 'OBM5' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : OBM5');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const V = pool(vari, a, b), yrs = []; for (let Y = a; Y <= b; Y++) if (vari[Y]) yrs.push(avg(rs(vari[Y].trades)));
      console.log(lab.padEnd(18), 'OBM5', f(V), '| F2C', f(pool(ctrl, a, b)), '| R moyen par an', yrs.map((x) => x.toFixed(3)).join(' / '), '| verdict test :', a === 2023 ? (avg(rs(V)) > 0 && yrs.filter((x) => x > 0).length >= 2 ? 'OK' : 'KO') : '—');
    }
  }
}
