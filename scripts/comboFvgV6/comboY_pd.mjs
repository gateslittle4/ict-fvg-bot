// comboY_pd.mjs - PD1 : F2 avec premium/discount entre le niveau H4 balayé et le bord bas du FVG cible. Règle et critères FIGÉS : voir docs/PREREG-F2-PREMIUM-DISCOUNT.md (écrit avant tout calcul).
// Usage : node comboY_pd.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboY_pd.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { match } from './comboL.mjs';
import { runYearT, judgeH1, WEEKS_TEST } from './comboT.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Comme h4Sweeps (creux), mais renvoie aussi le niveau balayé : lastLow[m] = bougie du dernier balayage, lastLevel[m] = le plus bas des N barres H4 complètes à cet instant. */
export function h4SweepLevels(c, N = 6) {
  const lastLow = new Int32Array(c.length).fill(-1), lastLevel = new Float64Array(c.length).fill(NaN), H = [];
  let cur = null, ll = -1, lv = NaN;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = Math.floor((k.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) { if (cur) H.push(cur); cur = { key, h: k.h, l: k.l }; } else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); }
    if (H.length >= N) { let lo = Infinity; for (let q = H.length - N; q < H.length; q++) if (H[q].l < lo) lo = H[q].l; if (k.l < lo) { ll = m; lv = lo; } }
    lastLow[m] = ll; lastLevel[m] = lv;
  }
  return { lastLow, lastLevel };
}

/** F2 sur un an civil, série continue. mode 'pd' = PD1 ; 'ctrl' = F2C (mêmes ordres que comboT) en enregistrant pour chaque ordre s'il est à discount. Renvoie { c, T, cls }. */
export function runYearYRaw(all, Y, mode = 'pd') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepLevels(c, RULES.N), cls = new Map();
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const filter = ({ z, m, entry, tg }) => {
    if (z.dir <= 0) return false; const li = sw.lastLow[z.created]; if (!(li >= 0 && z.created - li <= RULES.W)) return false;
    const eq = (sw.lastLevel[z.created] + tg.lo) / 2, disc = entry < eq; cls.set(`${m}:${z.created}`, disc);
    return mode === 'ctrl' ? true : disc;
  };
  const T = backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, cls, sw };
}
export const runYearY = (all, Y, mode) => { const r = runYearYRaw(all, Y, mode); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, disc: r.cls.get(`${t.placedIdx}:${t.zCreated}`) })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboY_pd.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, ctrlRec = {};
  for (let Y = 2011; Y <= 2026; Y++) { const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a; const b = runYearY(all, Y, 'pd'); if (b) vari[Y] = b; const r = runYearY(all, Y, 'ctrl'); if (r) ctrlRec[Y] = r; console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## PD1 (achat seulement sous l\'équilibre [niveau H4 balayé ; bord bas du FVG cible])');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement PD1 : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch PD1 vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const CR = pool(ctrlRec, 2011, 2022), D = CR.filter((t) => t.disc), P = CR.filter((t) => !t.disc);
    console.log(`\nDescriptif 2011-2022 (ordres de F2C) : discount n ${D.length} R moy ${avg(rs(D)).toFixed(3)} | premium n ${P.length} R moy ${avg(rs(P)).toFixed(3)} | part premium ${(100 * P.length / CR.length).toFixed(0)} %`);
    console.log('À lire au test :', j.pass ? 'PD1' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : PD1');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log('PD1', lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
