// comboAF_reentree.mjs - F2 avec réentrée au marché après un stop (REE). Règle et critères FIGÉS : voir docs/PREREG-F2-REENTREE-APRES-STOP.md (écrit avant tout calcul).
// Usage : node comboAF_reentree.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAF_reentree.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktestD.js';
import { match } from './comboL.mjs';
import { WEEKS_TEST, GAIN_MIN, DD_FACTOR, RATE_MIN, T_MIN } from './comboT.mjs';

export const BIG_MULT = 2; // « grande bougie baissière » : corps >= 2 x amplitude moyenne des 96 bougies précédentes (choix de moi, voir pré-enregistrement)
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil, série continue. mode : 'ctrl' (F2C), 'ree' (réentrée, filtre grande baissière), 'nofilter' (descriptif : réentrée sans le filtre). Renvoie { c, T, cnt }. */
export function runYearAFRaw(all, Y, mode = 'ree') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const cnt = { armed: 0, big: 0, taken: 0 }, inYear = (m) => m >= start && c[m].raw < t0(Y + 1);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  if (mode === 'ree') o.reentry = { bigMult: BIG_MULT }; else if (mode === 'nofilter') o.reentry = { bigMult: null };
  if (o.reentry) o.onReentry = (e) => { if (inYear(e.m)) cnt[e.kind]++; };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, cnt };
}
export const runYearAF = (all, Y, mode) => { const r = runYearAFRaw(all, Y, mode); return r && { cnt: r.cnt, trades: r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, re: !!t.reentry, rr: Math.abs(t.tp - t.entry) / t.risk })) }; };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y].trades); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement REE : réentrées (t, moitiés), total et moyenne non dilués, baisse, rythme. */
export function judgeREE(ctrl, vari, rate) {
  const C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), re = V.filter((t) => t.re), reA = pool(vari, 2011, 2016).filter((t) => t.re), reB = pool(vari, 2017, 2022).filter((t) => t.re);
  const sRe = summarize(rs(re)), sC = summarize(rs(C)), sV = summarize(rs(V));
  const c = { reMean: sRe.avgR > 0 && sRe.t >= T_MIN, halves: avg(rs(reA)) > 0 && avg(rs(reB)) > 0, noDilution: sV.totalR > sC.totalR && sV.avgR >= sC.avgR, dd: sV.dd <= DD_FACTOR * sC.dd, rate: rate >= RATE_MIN };
  return { sRe, sC, sV, nA: reA.length, nB: reB.length, a: avg(rs(reA)), b: avg(rs(reB)), rate, c, pass: Object.values(c).every(Boolean) };
}

if (process.argv[1].endsWith('comboAF_reentree.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, nof = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearAF(all, Y, 'ctrl'); if (a) ctrl[Y] = a;
    const b = runYearAF(all, Y, 'ree'); if (b) vari[Y] = b;
    const d = runYearAF(all, Y, 'nofilter'); if (d) nof[Y] = d;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x))), cntSum = (res, a, b) => { const s = { armed: 0, big: 0, taken: 0 }; for (let Y = a; Y <= b; Y++) if (res[Y]) for (const k of Object.keys(s)) s[k] += res[Y].cnt[k]; return s; };
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeREE(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), re = V.filter((t) => t.re);
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '| REE :', rate.toFixed(2), '(R du test non affiché)\n');
    console.log('## REE (réentrée au marché après un stop, sauf grande bougie baissière)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), 'REE entier', f(pool(vari, a, b)), '|| réentrées seules', f(pool(vari, a, b).filter((t) => t.re)));
    const cs = cntSum(vari, 2011, 2022), stops = C.filter((t) => t.why === 'stop').length;
    console.log(`stops de F2C : ${stops} | exclus (S grande baissière) : ${cs.big} | armés : ${cs.armed} | réentrées prises : ${cs.taken}`);
    const by = (w) => re.filter((t) => t.why === w).length;
    console.log(`réentrées : TP ${by('tp')} | stop ${by('stop')} | temps ${by('temps')} | RR visé moyen ${avg(re.map((t) => t.rr)).toFixed(2)} (F2C ${avg(C.map((t) => t.rr)).toFixed(2)})`);
    const m = match(C, V.filter((t) => !t.re));
    console.log(`trades de F2C absents de REE : ${m.onlyC.length} (R moy ${avg(m.onlyC).toFixed(3)}) | trades non-réentrée de REE absents de F2C : ${m.onlyV.length} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`réentrées : A ${j.a.toFixed(3)} (${j.nA}) B ${j.b.toFixed(3)} (${j.nB}) | R total F2C ${j.sC.totalR.toFixed(1)} -> REE ${j.sV.totalR.toFixed(1)} | moy F2C ${j.sC.avgR.toFixed(3)} -> REE ${j.sV.avgR.toFixed(3)} | dd ${j.sC.dd.toFixed(1)} -> ${j.sV.dd.toFixed(1)}`);
    console.log(`critères : réentrées(moy>0,t>=1,96):${+j.c.reMean} (t ${j.sRe.t.toFixed(2)}) moitiés:${+j.c.halves} non-dilution:${+j.c.noDilution} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const dn = pool(nof, 2011, 2022).filter((t) => t.re), dnc = cntSum(nof, 2011, 2022);
    console.log(`DESCRIPTIF (non jugé) sans filtre « grande baissière » : réentrées ${dn.length} (R moy ${avg(rs(dn)).toFixed(3)}) | avec filtre ${re.length} (R moy ${avg(rs(re)).toFixed(3)}) | armés sans filtre ${dnc.armed}`);
    console.log('À lire au test :', j.pass ? 'REE' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : REE');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), re = V.filter((t) => t.re);
      console.log(lab.padEnd(18), 'REE', f(V), '| F2C', f(Cc), '| réentrées', f(re), '| verdict test :', a === 2023 ? (avg(rs(re)) > 0 && V.reduce((s, t) => s + t.r, 0) > Cc.reduce((s, t) => s + t.r, 0) ? 'OK' : 'KO') : '—');
    }
  }
}
