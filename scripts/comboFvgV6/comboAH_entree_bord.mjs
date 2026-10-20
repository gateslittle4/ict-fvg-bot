// comboAH_entree_bord.mjs - F2 avec entrée au bord proche du FVG (ENT0) + mesure descriptive de la profondeur. Règle et critères FIGÉS : voir docs/PREREG-F2-ENTREE-AU-BORD.md (écrit avant tout calcul).
// Usage : node comboAH_entree_bord.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAH_entree_bord.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktestD.js';
import { nyHour } from './lib/krysMethod.js';
import { match } from './comboL.mjs';
import { WEEKS_TEST, DD_FACTOR, RATE_MIN, T_MIN } from './comboT.mjs';

export const TOTAL_GAIN = 1.10; // R total de ENT0 >= 1,10 x F2C
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil. mode : 'ctrl' (F2C, entrée à 50 %) ou 'ent0' (entrée au bord proche). Renvoie { c, T, orders } ; orders = ordres de F2C posés dans l'année (pour la profondeur). */
export function runYearAHRaw(all, Y, mode = 'ent0') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), spread = RULES.spread * k;
  const orders = [], inY = (m) => m >= start && c[m].raw < t0(Y + 1);
  const o = { start, spread, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: mode === 'ent0' ? 0 : RULES.entryFraction, buyOnly: true };
  const T = backtest(c, { ...o, filter: (a) => { const ok = a.z.dir > 0 && sw(a); if (ok && mode === 'ctrl' && inY(a.m)) orders.push({ m: a.m, near: a.near, far: a.far, stop: a.stop, tp: a.tp, width: a.near - a.far }); return ok; } }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, orders, spread };
}
export const runYearAH = (all, Y, mode) => { const r = runYearAHRaw(all, Y, mode); return r && { trades: r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why })), depth: mode === 'ctrl' ? r.orders.map((od) => ({ ...depthScan(r.c, od, r.spread), ratio: widthRatio(r.c, od) })) : [] }; };

/** Profondeur atteinte par le prix dans la zone après la pose de l'ordre : 0 = bord proche tout juste touché, 1 = bord lointain. null si le bord proche n'est jamais touché. Fin : TP, stop, hors plage horaire ou fin des données. */
export function depthScan(c, od, spread, hourFrom = RULES.hourFrom, hourTo = RULES.hourTo) {
  let depth = null, end = 'fin';
  for (let m = od.m + 1; m < c.length; m++) {
    const k = c[m], hr = nyHour(k.t); if (hr >= hourTo || hr < hourFrom) { end = 'heure'; break; }
    const d = (od.near - (k.l + spread)) / (od.near - od.far); if (d >= 0 && (depth === null || d > depth)) depth = Math.min(1, d);
    if (k.l <= od.stop) { end = 'stop'; break; }
    if (k.h >= od.tp) { end = 'tp'; break; }
  }
  return { depth, end };
}
/** Largeur du FVG / amplitude moyenne des 96 bougies précédant la pose (null si moins de 96 bougies). */
export function widthRatio(c, od) { if (od.m < 96) return null; let s = 0; for (let q = od.m - 96; q < od.m; q++) s += c[q].h - c[q].l; return od.width / (s / 96); }
/** Seuils de terciles (effectifs égaux) d'une liste de nombres. */
export const terciles = (x) => { const s = [...x].sort((a, b) => a - b); return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]]; };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y].trades); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement ENT0. */
export function judgeENT0(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), A = pool(vari, 2011, 2016), B = pool(vari, 2017, 2022), CA = pool(ctrl, 2011, 2016), CB = pool(ctrl, 2017, 2022);
  const sC = summarize(rs(C)), sV = summarize(rs(V)), sum = (x) => rs(x).reduce((a, b) => a + b, 0);
  const c = { total: sV.totalR >= TOTAL_GAIN * sC.totalR, mean: sV.avgR > 0 && sV.t >= T_MIN, halves: avg(rs(A)) > 0 && avg(rs(B)) > 0 && sum(A) >= sum(CA) && sum(B) >= sum(CB), dd: sV.dd <= DD_FACTOR * sC.dd, rate: rate >= RATE_MIN };
  return { sC, sV, a: avg(rs(A)), b: avg(rs(B)), totA: sum(A), totB: sum(B), cTotA: sum(CA), cTotB: sum(CB), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboAH_entree_bord.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearAH(all, Y, 'ctrl'); if (a) ctrl[Y] = a;
    const b = runYearAH(all, Y, 'ent0'); if (b) vari[Y] = b;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeENT0(ctrl, vari, rate);
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '| ENT0 :', rate.toFixed(2), '(R du test non affiché)\n');
    console.log('## ENT0 (entrée au bord proche du FVG)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), m = match(C, V);
    console.log(`appariés ${m.d.length} | seulement ENT0 ${m.onlyV.length} (R moy ${avg(m.onlyV).toFixed(3)}) | seulement F2C ${m.onlyC.length} (R moy ${avg(m.onlyC).toFixed(3)}) | diff moyenne sur appariés ${avg(m.d).toFixed(3)}`);
    const w = (x) => x.filter((t) => t.why === 'tp').length;
    console.log(`TP : F2C ${w(C)} sur ${C.length} (${(100 * w(C) / C.length).toFixed(0)} %), ENT0 ${w(V)} sur ${V.length} (${(100 * w(V) / V.length).toFixed(0)} %)`);
    console.log(`R total F2C ${j.sC.totalR.toFixed(1)} -> ENT0 ${j.sV.totalR.toFixed(1)} (seuil ${(TOTAL_GAIN * j.sC.totalR).toFixed(1)}) | moy ${j.sC.avgR.toFixed(3)} -> ${j.sV.avgR.toFixed(3)} (t ${j.sV.t.toFixed(2)}) | A ${j.a.toFixed(3)} R tot ${j.totA.toFixed(1)} (F2C ${j.cTotA.toFixed(1)}) B ${j.b.toFixed(3)} R tot ${j.totB.toFixed(1)} (F2C ${j.cTotB.toFixed(1)}) | dd ${j.sC.dd.toFixed(1)} -> ${j.sV.dd.toFixed(1)}`);
    console.log(`critères : total+10%:${+j.c.total} moyenne(>0,t>=1,96):${+j.c.mean} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    // Descriptifs (non jugés)
    const D = []; for (let Y = 2011; Y <= 2022; Y++) if (ctrl[Y]) D.push(...ctrl[Y].depth);
    const pct = (x, n) => `${x} (${(100 * x / n).toFixed(0)} %)`, reach = (th) => D.filter((d) => d.depth !== null && d.depth >= th).length;
    console.log(`\nDESCRIPTIF 1 — profondeur, ${D.length} ordres de F2C : bord proche touché ${pct(D.filter((d) => d.depth !== null).length, D.length)} | ≥25 % ${pct(reach(0.25), D.length)} | ≥50 % ${pct(reach(0.5), D.length)} | ≥75 % ${pct(reach(0.75), D.length)} | 100 % ${pct(reach(1), D.length)}`);
    const tp50 = D.filter((d) => d.end === 'tp' && (d.depth === null || d.depth < 0.5));
    console.log(`  ordres allés au TP sans atteindre 50 % : ${tp50.length} dont bord proche touché ${tp50.filter((d) => d.depth !== null).length}, jamais touché ${tp50.filter((d) => d.depth === null).length}`);
    const Dr = D.filter((d) => d.ratio !== null), [q1, q2] = terciles(Dr.map((d) => d.ratio)), grp = [['petits', (d) => d.ratio <= q1], ['moyens', (d) => d.ratio > q1 && d.ratio <= q2], ['grands', (d) => d.ratio > q2]];
    console.log(`DESCRIPTIF 2 — largeur du FVG / amplitude moyenne 96 bougies (terciles : ${q1.toFixed(2)} ; ${q2.toFixed(2)}) : part des ordres atteignant 50 % :`);
    for (const [nm, fn] of grp) { const g = Dr.filter(fn); console.log(`  FVG ${nm} : ${g.length} ordres, atteignent 50 % ${(100 * g.filter((d) => d.depth !== null && d.depth >= 0.5).length / g.length).toFixed(0)} %, touchent le bord ${(100 * g.filter((d) => d.depth !== null).length / g.length).toFixed(0)} %`); }
    console.log('À lire au test :', j.pass ? 'ENT0' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : ENT0');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b);
      console.log(lab.padEnd(18), 'ENT0', f(V), '| F2C', f(Cc), '| verdict test :', a === 2023 ? (avg(rs(V)) > 0 && rs(V).reduce((s, r) => s + r, 0) > rs(Cc).reduce((s, r) => s + r, 0) ? 'OK' : 'KO') : '—');
    }
  }
}
