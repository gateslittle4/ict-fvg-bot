// comboAG_reentree_confirmation.mjs - F2 avec réentrée sur confirmation après un stop (CONF). Règle et critères FIGÉS : voir docs/PREREG-F2-REENTREE-CONFIRMATION.md (écrit avant tout calcul).
// Usage : node comboAG_reentree_confirmation.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAG_reentree_confirmation.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktestD.js';
import { match } from './comboL.mjs';
import { WEEKS_TEST } from './comboT.mjs';
import { BIG_MULT, judgeREE, runYearAF } from './comboAF_reentree.mjs';

export const WAIT = 8; // fenêtre de confirmation = âge maximal d'un FVG de F2 (RULES.maxAge)
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil, série continue. mode : 'ctrl' (F2C) ou 'conf' (réentrée sur confirmation). Renvoie { c, T, cnt }. */
export function runYearAGRaw(all, Y, mode = 'conf') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const cnt = { armed: 0, big: 0, confirmed: 0, expired: 0, taken: 0, replaced: 0 }, inYear = (m) => m >= start && c[m].raw < t0(Y + 1);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  if (mode === 'conf') { o.reentry = { bigMult: BIG_MULT, wait: WAIT }; o.onReentry = (e) => { if (inYear(e.m)) cnt[e.kind]++; }; }
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, cnt };
}
export const runYearAG = (all, Y, mode) => { const r = runYearAGRaw(all, Y, mode); return r && { cnt: r.cnt, trades: r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, re: !!t.reentry, rr: Math.abs(t.tp - t.entry) / t.risk, delay: t.delay })) }; };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y].trades); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAG_reentree_confirmation.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, ree = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearAG(all, Y, 'ctrl'); if (a) ctrl[Y] = a;
    const b = runYearAG(all, Y, 'conf'); if (b) vari[Y] = b;
    const d = runYearAF(all, Y, 'ree'); if (d) ree[Y] = d; // descriptif seulement
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x))), cntSum = (res, a, b) => { const s = { armed: 0, big: 0, confirmed: 0, expired: 0, taken: 0, replaced: 0 }; for (let Y = a; Y <= b; Y++) if (res[Y]) for (const k of Object.keys(s)) s[k] += res[Y].cnt[k]; return s; };
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeREE(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), V = pool(vari, 2011, 2022), re = V.filter((t) => t.re);
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '| CONF :', rate.toFixed(2), '(R du test non affiché)\n');
    console.log('## CONF (réentrée sur confirmation : clôture au-dessus du stop d\'origine, fenêtre de 8 bougies, sauf grande bougie baissière)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), 'CONF entier', f(pool(vari, a, b)), '|| réentrées seules', f(pool(vari, a, b).filter((t) => t.re)));
    const cs = cntSum(vari, 2011, 2022), stops = C.filter((t) => t.why === 'stop').length;
    console.log(`stops de F2C : ${stops} | fenêtres armées : ${cs.armed} | annulées (grande baissière) : ${cs.big} | expirées sans confirmation : ${cs.expired} | remplacées par un nouveau stop pendant la fenêtre : ${cs.replaced} | confirmées : ${cs.confirmed} | réentrées prises : ${re.length}`);
    const by = (w) => re.filter((t) => t.why === w).length;
    console.log(`réentrées : TP ${by('tp')} | stop ${by('stop')} | temps ${by('temps')} | RR visé moyen ${avg(re.map((t) => t.rr)).toFixed(2)} (F2C ${avg(C.map((t) => t.rr)).toFixed(2)}) | délai moyen stop->confirmation ${avg(re.map((t) => t.delay)).toFixed(1)} bougies`);
    const m = match(C, V.filter((t) => !t.re));
    console.log(`trades de F2C absents de CONF : ${m.onlyC.length} (R moy ${avg(m.onlyC).toFixed(3)}) | trades non-réentrée de CONF absents de F2C : ${m.onlyV.length} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`réentrées : A ${j.a.toFixed(3)} (${j.nA}) B ${j.b.toFixed(3)} (${j.nB}) | R total F2C ${j.sC.totalR.toFixed(1)} -> CONF ${j.sV.totalR.toFixed(1)} | moy F2C ${j.sC.avgR.toFixed(3)} -> CONF ${j.sV.avgR.toFixed(3)} | dd ${j.sC.dd.toFixed(1)} -> ${j.sV.dd.toFixed(1)}`);
    console.log(`critères : réentrées(moy>0,t>=1,96):${+j.c.reMean} (t ${j.sRe.t.toFixed(2)}) moitiés:${+j.c.halves} non-dilution:${+j.c.noDilution} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const rr = pool(ree, 2011, 2022).filter((t) => t.re);
    console.log(`DESCRIPTIF (non jugé) REE déjà lue : réentrées ${rr.length} (R moy ${avg(rs(rr)).toFixed(3)}) | CONF : ${re.length} (R moy ${avg(rs(re)).toFixed(3)})`);
    console.log('À lire au test :', j.pass ? 'CONF' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : CONF');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), re = V.filter((t) => t.re);
      console.log(lab.padEnd(18), 'CONF', f(V), '| F2C', f(Cc), '| réentrées', f(re), '| verdict test :', a === 2023 ? (avg(rs(re)) > 0 && V.reduce((s, t) => s + t.r, 0) > Cc.reduce((s, t) => s + t.r, 0) ? 'OK' : 'KO') : '—');
    }
  }
}
