// comboAD_dailyPD.mjs - F2 avec tendance daily par PD arrays (TD2). Règle et critères FIGÉS : voir docs/PREREG-F2-TENDANCE-DAILY-PD.md (écrit avant tout calcul).
// Usage : node comboAD_dailyPD.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboAD_dailyPD.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { runYearT, judgeH1, WEEKS_TEST } from './comboT.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/**
 * Tendance daily par PD arrays (TD2). Barres daily = jours calendaires de New York (clé = floor((t - 5 h) / 86 400), temps moteur).
 * À la clôture de la barre d, avec les niveaux et FVG daily actifs à la clôture de d - 1 :
 *  - low daily pris et rejeté (haussier) : low[d] < Lp et close[d] > Lp ; high daily pris et rejeté (baissier) : high[d] > Hp et close[d] < Hp
 *    (Lp / Hp = dernier creux / sommet daily confirmé, pivot de 2 barres de chaque côté, confirmé à la clôture de p + 2) ;
 *  - FVG daily haussier touché et rejeté : low[d] <= haut de la zone, low[d] > bas de la zone, close[d] > haut de la zone ; baissier : symétrique ;
 *  - un FVG daily (strict, 3 barres) meurt quand une mèche le remplit entièrement ; il naît à la clôture de b3 et n'est testé qu'à partir de la barre suivante.
 * L'état devient haussier au premier événement haussier, baissier au premier événement baissier ; inchangé si les deux sens arrivent à la même barre. État initial 0.
 * Retourne { st, ev } : st[m] = état (1, -1, 0) calculé avec les barres daily COMPLÈTES avant le jour de la bougie m (causal) ; ev = comptes d'événements par type.
 */
export function dailyPD(c) {
  const st = new Int8Array(c.length), D = [], ev = { low: 0, bullFvg: 0, high: 0, bearFvg: 0 }; let cur = null, ph = null, pl = null, state = 0, fvgs = [];
  for (let m = 0; m < c.length; m++) {
    const x = c[m], key = Math.floor((x.t - 5 * 3600) / 86400);
    if (!cur || cur.key !== key) {
      if (cur) {
        D.push(cur); const d = D.length - 1, B = D[d];
        const lowEv = pl !== null && B.l < pl && B.c > pl, highEv = ph !== null && B.h > ph && B.c < ph;
        const bullFvgEv = fvgs.some((g) => g.dir > 0 && B.l <= g.hi && B.l > g.lo && B.c > g.hi), bearFvgEv = fvgs.some((g) => g.dir < 0 && B.h >= g.lo && B.h < g.hi && B.c < g.lo);
        if (lowEv) ev.low++; if (bullFvgEv) ev.bullFvg++; if (highEv) ev.high++; if (bearFvgEv) ev.bearFvg++;
        const bull = lowEv || bullFvgEv, bear = highEv || bearFvgEv;
        if (bull && !bear) state = 1; else if (bear && !bull) state = -1;
        fvgs = fvgs.filter((g) => !(g.dir > 0 ? B.l <= g.lo : B.h >= g.hi)); // FVG entièrement rempli par une mèche : mort
        if (d >= 2) { const a = D[d - 2]; if (a.h < B.l) fvgs.push({ dir: 1, lo: a.h, hi: B.l }); else if (a.l > B.h) fvgs.push({ dir: -1, lo: B.h, hi: a.l }); }
        const p = d - 2; // pivot confirmé seulement après la mise à jour de l'état (dernier pivot connu à la clôture de d - 1)
        if (p >= 2) {
          const hh = D[p].h > D[p - 1].h && D[p].h > D[p - 2].h && D[p].h > D[p + 1].h && D[p].h > D[p + 2].h;
          const ll = D[p].l < D[p - 1].l && D[p].l < D[p - 2].l && D[p].l < D[p + 1].l && D[p].l < D[p + 2].l;
          if (hh) ph = D[p].h; if (ll) pl = D[p].l;
        }
      }
      cur = { key, h: x.h, l: x.l, c: x.c };
    } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    st[m] = state;
  }
  return { st, ev };
}

/** F2 sur un an civil, série continue. mode 'td2' (achats seulement si tendance daily par PD arrays haussière) ou 'old' (F2C). Renvoie { c, T, st, ev }. */
export function runYearADRaw(all, Y, mode = 'td2') {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), { st, ev } = dailyPD(c);
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: true };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) && (mode !== 'td2' || st[a.m] > 0) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T, st, ev };
}
export const runYearAD = (all, Y, mode) => { const r = runYearADRaw(all, Y, mode); return r && r.T.map((t) => ({ key: `${Y}:${t.placedIdx}:${t.zCreated}`, r: t.r, why: t.why, state: r.st[t.placedIdx] })); };

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboAD_dailyPD.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, desc = {}, flips = {}, bullDays = {};
  for (let Y = 2011; Y <= 2026; Y++) {
    const a = runYearT(all, Y, {}); if (a) ctrl[Y] = a;
    const b = runYearAD(all, Y, 'td2'); if (b) vari[Y] = b;
    const d = runYearAD(all, Y, 'old'); if (d) desc[Y] = d;
    console.error('année', Y, 'ok');
  }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## TD2 (achats F2 seulement si tendance daily par PD arrays haussière)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement TD2 : ${j.nOnlyV} (R moy ${avg(m.onlyV).toFixed(3)})`);
    console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch TD2 vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const D = pool(desc, 2011, 2022), by = (s) => D.filter((t) => t.state === s);
    console.log(`DESCRIPTIF F2C 2011-22 : daily haussière ${by(1).length} (R moy ${avg(rs(by(1))).toFixed(3)}) | baissière ${by(-1).length} (R moy ${avg(rs(by(-1))).toFixed(3)}) | neutre ${by(0).length} (R moy ${avg(rs(by(0))).toFixed(3)})`);
    let ev22 = null;
    for (let Y = 2011; Y <= 2022; Y++) { const r = runYearADRaw(all, Y, 'old'); let n = 0, bu = 0, fl = 0, prev = 0; const s0 = lowerRaw(r.c, t0(Y)); for (let m = s0; m < r.c.length; m++) { n++; if (r.st[m] > 0) bu++; if (r.st[m] !== prev) { fl++; prev = r.st[m]; } } flips[Y] = fl; bullDays[Y] = bu / n; ev22 = r.ev; }
    console.log('part du temps en tendance haussière par an :', Object.entries(bullDays).map(([y, v]) => `${y}: ${(100 * v).toFixed(0)} %`).join('  '));
    console.log('changements d\'état par an :', Object.entries(flips).map(([y, v]) => `${y}: ${v}`).join('  '));
    console.log('événements daily cumulés 2010-11 -> 2022 :', JSON.stringify(ev22));
    console.log('À lire au test :', j.pass ? 'TD2' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : TD2');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log(lab.padEnd(18), 'TD2', f(V), '| F2C', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| ajoutés n', m.onlyV.length, 'R moy', avg(m.onlyV).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
