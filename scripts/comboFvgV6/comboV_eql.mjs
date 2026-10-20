// comboV_eql.mjs - E1 : F2 avec balayage d'« equal lows » H4 à la place du balayage H4 actuel. Règle et critères FIGÉS : voir docs/PREREG-F2-EQUAL-LOWS-H4.md (écrit avant tout calcul).
// Usage : node comboV_eql.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboV_eql.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { welch } from './comboI.mjs';
import { runYearT, judgeH1, GAIN_MIN, T_MIN, DD_FACTOR, RATE_MIN, WEEKS_TEST } from './comboT.mjs';

export const EQL = { bars: 12, tol: 0.001 };
const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/**
 * Pour chaque bougie M15 m : l'indice du dernier balayage d'equal lows H4 (-1 si aucun).
 * Barres H4 alignées sur minuit NY (comme h4Sweeps) ; seules les barres COMPLÈTES comptent.
 * Creux = barre complète dont le plus bas est strictement inférieur à ceux de la barre précédente et de la suivante (confirmé quand la suivante est complète).
 * Equal lows = deux creux parmi les `bars` dernières barres complètes, plus bas à au plus `tol` (relatif au plus bas des deux). Niveau L = le plus bas.
 * Balayage = première bougie après la confirmation du 2e creux dont le plus bas passe strictement sous L ; un niveau ne compte qu'une fois.
 */
export function eqlSweeps(c, { bars = EQL.bars, tol = EQL.tol } = {}) {
  const lastLow = new Int32Array(c.length).fill(-1);
  const H = [], creux = [], levels = [];
  let cur = null, ls = -1;
  for (let m = 0; m < c.length; m++) {
    const k = c[m], key = Math.floor((k.t - 5 * 3600) / 14400);
    if (!cur || cur.key !== key) {
      if (cur) {
        H.push(cur); const n = H.length;
        while (creux.length && creux[0].idx < n - bars) creux.shift();
        for (let q = levels.length - 1; q >= 0; q--) if (levels[q].i < n - bars) levels.splice(q, 1);
        const j = n - 2; // creux candidat, confirmé par la barre n-1 qui vient de se terminer
        if (j >= 1 && H[j].l < H[j - 1].l && H[j].l < H[j + 1].l && j >= n - bars) {
          for (const q of creux) { const lo = Math.min(q.l, H[j].l); if (Math.abs(q.l - H[j].l) <= tol * lo) levels.push({ i: q.idx, L: lo, swept: false }); }
          creux.push({ idx: j, l: H[j].l });
        }
      }
      cur = { key, h: k.h, l: k.l };
    } else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); }
    for (const v of levels) if (!v.swept && k.l < v.L) { v.swept = true; ls = m; }
    lastLow[m] = ls;
  }
  return lastLow;
}
/** Filtre E1 : FVG d'achat formé au plus W bougies après le dernier balayage d'equal lows. */
export function eqlFilter(c, { W = RULES.W, ...p } = {}) { const ll = eqlSweeps(c, p); return ({ z }) => { const li = ll[z.created]; return z.dir > 0 && li >= 0 && z.created - li <= W; }; }

/** F2 sur un an civil, série continue. mode 'eql' (E1) ou 'old' (balayage H4 actuel = F2C). Renvoie les trades complets. */
export function runYearV(all, Y, mode = 'eql') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const f = mode === 'eql' ? eqlFilter(c) : ((sw) => (a) => a.z.dir > 0 && sw(a))(h4SweepFilter(c, { N: RULES.N, W: RULES.W }));
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true, filter: f };
  return backtest(c, o).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
}
export const runYearE = (all, Y) => { const T = runYearV(all, Y, 'eql'); return T && T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboV_eql.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {};
  for (let Y = 2011; Y <= 2026; Y++) { const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a; const b = runYearE(all, Y); if (b) vari[Y] = b; console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## E1 (equal lows H4 : 2 creux, écart <= 0,1 %, 12 barres)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`supprimés (F2C absents de E1) : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement E1 : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch E1 vs supprimés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    console.log('À lire au test :', j.pass ? 'E1' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : E1');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log('E1', lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| supprimés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
