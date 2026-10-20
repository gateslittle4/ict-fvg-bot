// comboAE_dailyPD_ventes.mjs - F2 en miroir (ventes) avec tendance daily baissière (TD2S). Règle et critères FIGÉS : voir docs/PREREG-F2-VENTES-TENDANCE-DAILY-PD.md (écrit avant tout calcul).
// Usage : node comboAE_dailyPD_ventes.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAE_dailyPD_ventes.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { judgeH1, WEEKS_TEST } from './comboT.mjs';
import { dailyPD } from './comboAD_dailyPD.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Filtre d'un ordre : vente seulement ; balayage H4 du high (sw gère le sens) ; mode 'td2s' : état daily baissier (st[m] < 0) exigé ; mode 'ctrl' (F2S) : pas de filtre daily. */
export const passSell = (a, sw, st, mode) => a.z.dir < 0 && sw(a) && (mode !== 'td2s' || st[a.m] < 0);

/** F2 en miroir (ventes) sur un an civil, série continue. Renvoie { c, T, st }. buyOnly est faux : les zones de vente sont créées ; les achats sont refusés par le filtre. */
export function runYearAERaw(all, Y, mode = 'td2s') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), { st } = dailyPD(c);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const T = backtest(c, { ...o, filter: (a) => passSell(a, sw, st, mode) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, st };
}
export const runYearAE = (all, Y, mode) => { const r = runYearAERaw(all, Y, mode); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, state: r.st[t.placedIdx] })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAE_dailyPD_ventes.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearAE(all, Y, 'ctrl'); if (a) ctrl[Y] = a;
    const b = runYearAE(all, Y, 'td2s'); if (b) vari[Y] = b;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2S (ventes en miroir, sans filtre daily ; pas de valeurs attendues connues)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2S) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## TD2S (ventes F2 seulement si tendance daily baissière)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement TD2S : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`moy ${j.mv.toFixed(3)} (F2S ${j.mc.toFixed(3)}) | Welch TD2S vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const D = pool(ctrl, 2011, 2022), by = (s) => D.filter((t) => t.state === s);
    console.log(`DESCRIPTIF F2S 2011-22 : daily baissière ${by(-1).length} (R moy ${avg(rs(by(-1))).toFixed(3)}) | haussière ${by(1).length} (R moy ${avg(rs(by(1))).toFixed(3)}) | neutre ${by(0).length} (R moy ${avg(rs(by(0))).toFixed(3)})`);
    console.log('À lire au test :', j.pass ? 'TD2S' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : TD2S');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log(lab.padEnd(18), 'TD2S', f(V), '| F2S', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
