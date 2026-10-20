// comboW_premier.mjs - PS1 : F2 limité au premier setup rempli de la journée (achat ou vente). Règle et critères FIGÉS : voir docs/PREREG-F2-PREMIER-SETUP-JOUR.md (écrit avant tout calcul).
// Usage : node comboW_premier.mjs <dossier data> train   -> entraînement 2011-2022 (R de 2023+ masqué ; seuls les nombres de trades sont affichés)
//         node comboW_premier.mjs <dossier data> test    -> lecture unique du test 2023-2025 (et 2026 descriptif), seulement si l'entraînement passe
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest } from './lib/krysBacktestC.js';
import { h4SweepFilter } from './lib/krysBacktest.js';
import { match } from './comboL.mjs';
import { runYearTRaw, judgeH1, WEEKS_TEST } from './comboT.mjs';

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };
export const nyDate = (t) => new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10); // même conversion que comboU_aveugle (t est décalé pour l'heure d'été)

/** Série de VENTES de F2 en miroir (balayage d'un sommet H4), simulée seule. Renvoie { c, T } comme runYearTRaw. */
export function runYearSellRaw(all, Y) {
  const i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF, sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction, buyOnly: false };
  const T = backtest(c, { ...o, filter: (a) => a.z.dir < 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { c, T };
}

/**
 * Sélection « premier remplissage de la journée ». buys, sells : trades avec fillIdx ; dayOf(fillIdx) -> jour. Renvoie les achats retenus et, pour chaque achat retiré, qui l'a précédé.
 * Un achat est retenu s'il est le premier achat de sa journée (plusieurs achats remplis à la même bougie : seul le premier posé est retenu, voir l'addendum du prérégistrement) ET strictement plus tôt que toute vente de la journée (égalité avec une vente : retiré).
 */
export function firstOfDay(buys, sells, dayOf) {
  const ord = (t) => [t.fillIdx, t.placedIdx ?? 0, t.zCreated ?? 0], lt = (a, b) => { const x = ord(a), y = ord(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  const eb = new Map(), es = new Map(); // eb : le premier achat de chaque journée (ordre : bougie de remplissage, puis de pose, puis de création de la zone) ; es : bougie du premier remplissage de vente
  for (const t of buys) { const d = dayOf(t.fillIdx); if (!eb.has(d) || lt(t, eb.get(d))) eb.set(d, t); }
  for (const t of sells) { const d = dayOf(t.fillIdx); if (!es.has(d) || t.fillIdx < es.get(d)) es.set(d, t.fillIdx); }
  const kept = [], removed = [];
  for (const t of buys) { const d = dayOf(t.fillIdx), s = es.has(d) ? es.get(d) : Infinity; if (t === eb.get(d) && t.fillIdx < s) kept.push(t); else removed.push({ t, by: t !== eb.get(d) ? 'achat' : 'vente' }); }
  return { kept, removed, eb, es };
}

const key = (Y, t) => `${Y}:${t.placedIdx}:${t.zCreated}`;
/** Un an : trades F2C, PS1 et éléments descriptifs. */
export function runYearPS1(all, Y) {
  const b = runYearTRaw(all, Y, {}); if (!b) return null;
  const s = runYearSellRaw(all, Y), dayOf = (i) => nyDate(b.c[i].t), f = firstOfDay(b.T, s.T, dayOf);
  const ctrl = b.T.map((t) => ({ key: key(Y, t), r: t.r, why: t.why })), vari = f.kept.map((t) => ({ key: key(Y, t), r: t.r, why: t.why }));
  const sf = firstOfDay(s.T, b.T, dayOf).kept; // ventes premier remplissage (descriptif)
  const days = new Set([...b.T, ...s.T].map((t) => dayOf(t.fillIdx)));
  return { ctrl, vari, desc: { days: days.size, buys: b.T.length, sells: s.T.length, sellFirst: sf.map((t) => t.r), removedByBuy: f.removed.filter((x) => x.by === 'achat').map((x) => x.t.r), removedBySell: f.removed.filter((x) => x.by === 'vente').map((x) => x.t.r) } };
}

const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

if (process.argv[1].endsWith('comboW_premier.mjs')) {
  const mode = process.argv[3] || 'train', all = loadAll(), ctrl = {}, vari = {}, desc = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearPS1(all, Y); if (r) { ctrl[Y] = r.ctrl; vari[Y] = r.vari; desc[Y] = r.desc; } console.error('année', Y, 'ok'); }
  const f = (x) => fmt(summarize(rs(x)));
  if (mode === 'train') {
    console.log('CONTRÔLE F2C (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04, 129,7 R, dd 27,4)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(pool(ctrl, a, b)));
    console.log('trades/semaine 2023-25 (F2C) :', (pool(ctrl, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const rate = pool(vari, 2023, 2025).length / WEEKS_TEST, j = judgeH1(ctrl, vari, rate), C = pool(ctrl, 2011, 2022), m = match(C, pool(vari, 2011, 2022));
    console.log('## PS1 (premier setup rempli de la journée, achat ou vente)');
    for (const [lab, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(lab.padEnd(10), f(pool(vari, a, b)));
    console.log(`retirés : ${j.nRemoved} sur ${C.length} (${(100 * j.nRemoved / C.length).toFixed(0)} %, R moy ${j.avgRemoved.toFixed(3)}) | ajoutés seulement PS1 : ${j.nOnlyV}`);
    console.log(`moy ${j.mv.toFixed(3)} (F2C ${j.mc.toFixed(3)}) | Welch PS1 vs retirés ${j.tw.toFixed(2)} | A ${j.a.toFixed(3)} (c ${j.aC.toFixed(3)}) B ${j.b.toFixed(3)} (c ${j.bC.toFixed(3)}) | dd ${j.ddV.toFixed(1)} (c ${j.ddC.toFixed(1)}) | /sem ${j.rate.toFixed(2)}`);
    console.log(`critères : gain:${+j.c.gain} t:${+j.c.t} moitiés:${+j.c.halves} dd:${+j.c.dd} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
    const D = (g) => { let a = []; for (let Y = 2011; Y <= 2022; Y++) if (desc[Y]) a = a.concat(g(desc[Y])); return a; }, dd = (k) => { let s = 0; for (let Y = 2011; Y <= 2022; Y++) if (desc[Y]) s += desc[Y][k]; return s; };
    console.log(`\nDescriptif 2011-2022 : journées avec un remplissage ${dd('days')} | achats F2C ${dd('buys')} | ventes (miroir) ${dd('sells')}`);
    console.log(`ventes premier remplissage : n ${D((d) => d.sellFirst).length}, R moy ${avg(D((d) => d.sellFirst)).toFixed(3)} (non jugé) | achats retirés après un autre achat : n ${D((d) => d.removedByBuy).length}, R moy ${avg(D((d) => d.removedByBuy)).toFixed(3)} | après une vente : n ${D((d) => d.removedBySell).length}, R moy ${avg(D((d) => d.removedBySell)).toFixed(3)}`);
    console.log('À lire au test :', j.pass ? 'PS1' : 'rien');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : PS1');
    for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
      const Cc = pool(ctrl, a, b), V = pool(vari, a, b), m = match(Cc, V);
      console.log('PS1', lab.padEnd(18), 'variante', f(V), '| F2C', f(Cc), '| retirés n', m.onlyC.length, 'R moy', avg(m.onlyC).toFixed(3), '| verdict test :', a === 2023 ? (avg(rs(V)) > avg(rs(Cc)) && avg(rs(V)) > 0 && avg(m.onlyC) < avg(rs(V)) ? 'OK' : 'KO') : '—');
    }
  }
}
