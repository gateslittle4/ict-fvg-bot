// comboI.mjs - F2 : filtres « heure » et « jour de semaine ». Règles et critères FIGÉS : voir docs/PREREG-F2-FILTRES-HEURE-JOUR.md (écrit avant tout calcul).
// Usage : node comboI.mjs <dossier data> train            -> entraînement 2011-2022 (R de 2023+ masqué ; seul le nombre de trades est affiché)
//         node comboI.mjs <dossier data> test <v1[,v2]>   -> lecture unique du test 2023-2025 (et 2026 descriptif) pour les variantes données
import { loadAll, RULES, summarize, fmt } from './comboF.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktest.js';

export const T_MIN = 2.85, R_MIN = 0.15, RATE_MIN = 1.0, WEEKS_TEST = 155; // 11 hypothèses : Bonferroni 0,05/11 -> t 2,85

/** Jour de semaine (0 = dimanche … 6 = samedi) et heure (0-23) de New York, à partir du temps moteur (t - 5 h = heure NY réelle). */
export function nyParts(t) { const d = new Date((t - 5 * 3600) * 1000); return { dow: d.getUTCDay(), hour: d.getUTCHours() }; }

// Hypothèses figées. from/to : fenêtre de placement [from ; to[ en heures NY ; skip : jour exclu (1 = lundi … 5 = vendredi).
export const HYP = {
  'H-A': { from: 6, to: 9 }, 'H-B': { from: 6, to: 11 }, 'H-C': { from: 6, to: 13 }, 'H-D': { from: 8, to: 16 }, 'H-E': { from: 9, to: 16 },
  'J-lun': { skip: 1 }, 'J-mar': { skip: 2 }, 'J-mer': { skip: 3 }, 'J-jeu': { skip: 4 }, 'J-ven': { skip: 5 },
};
export const HOURS = ['H-A', 'H-B', 'H-C', 'H-D', 'H-E'], DAYS = ['J-lun', 'J-mar', 'J-mer', 'J-jeu', 'J-ven'];
export const spec = (name) => (name === 'COMBO' ? null : { from: RULES.hourFrom, to: RULES.hourTo, skip: 0, ...HYP[name] });
/** Une variante garde-t-elle un trade (placé à l'heure/jour donnés) ? */
export const keeps = (s, { dow, hour }) => hour >= s.from && hour < s.to && dow !== s.skip;

/** t de Welch (a - b) ; 0 si un groupe a moins de 2 trades ou une variance nulle des deux côtés. */
export function welch(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length, v = (x, mu) => x.reduce((s, y) => s + (y - mu) ** 2, 0) / (x.length - 1);
  const ma = m(a), mb = m(b), se = Math.sqrt(v(a, ma) / a.length + v(b, mb) / b.length);
  return se ? (ma - mb) / se : 0;
}
/** Sépare les trades annotés en gardés / exclus par la variante s. */
export function split(trades, s) { const kept = [], out = []; for (const t of trades) (keeps(s, t) ? kept : out).push(t.r); return { kept, out }; }

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** F2 sur un an civil (mêmes règles que comboF.runYear 'f_sweep'), trades annotés de l'heure et du jour de PLACEMENT. s : fenêtre/exclusion « moteur » (rejeu réel) ou absent pour la base. */
export function runYearF2(all, Y, s = null) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((q, x) => q + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const sp = s || { from: RULES.hourFrom, to: RULES.hourTo, skip: 0 };
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: sp.from, hourTo: sp.to, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const filter = (a) => a.z.dir > 0 && sw(a) && (!sp.skip || nyParts(c[a.m].t).dow !== sp.skip);
  const T = backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return T.map((t) => ({ r: t.r, ...nyParts(t.t) }));
}

const pool = (res, a, b) => { const x = []; for (let Y = a; Y <= b; Y++) if (res[Y]) x.push(...res[Y]); return x; };
const rs = (x) => x.map((t) => t.r);

/** Critères d'entraînement 1 à 4 pour une variante (sur les trades de la base 2011-2022 ; rate = trades/semaine 2023-25, sans lire R). */
export function judge(base, s, rate) {
  const A = split(pool(base, 2011, 2016), s), B = split(pool(base, 2017, 2022), s), T = split(pool(base, 2011, 2022), s);
  const avg = (x) => (x.length ? x.reduce((q, v) => q + v, 0) / x.length : 0);
  const tw = welch(T.kept, T.out), mean = avg(T.kept);
  const c = { t: tw >= T_MIN, r: mean >= R_MIN, halves: avg(A.kept) > 0 && avg(B.kept) > 0 && avg(A.kept) > avg(A.out) && avg(B.kept) > avg(B.out), rate: rate >= RATE_MIN };
  return { tw, mean, nKept: T.kept.length, nOut: T.out.length, avgOut: avg(T.out), a: avg(A.kept), b: avg(B.kept), aOut: avg(A.out), bOut: avg(B.out), rate, c, pass: c.t && c.r && c.halves && c.rate };
}

if (process.argv[1].endsWith('comboI.mjs')) {
  const mode = process.argv[3] || 'train';
  const all = loadAll(), base = {};
  for (let Y = 2011; Y <= 2026; Y++) { const r = runYearF2(all, Y); if (r) base[Y] = r; }
  const f = (x) => fmt(summarize(x));
  if (mode === 'train') {
    console.log('CONTRÔLE F2 de base (attendu : A +0,067 (617), B +0,146 (605), 2011-22 +0,106 (1 222), t 2,04)');
    for (const [nm, a, b] of [['2011-2016', 2011, 2016], ['2017-2022', 2017, 2022], ['2011-2022', 2011, 2022]]) console.log(nm.padEnd(10), f(rs(pool(base, a, b))));
    console.log('trades/semaine 2023-25 (base) :', (pool(base, 2023, 2025).length / WEEKS_TEST).toFixed(2), '(R du test non affiché)\n');
    const res = {}, passH = [], passJ = [];
    const show = (nm, s) => {
      const rate = pool(base, 2023, 2025).filter((t) => keeps(s, t)).length / WEEKS_TEST, j = judge(base, s, rate); res[nm] = j;
      console.log(nm.padEnd(6), `gardés n=${String(j.nKept).padStart(4)} moy=${j.mean.toFixed(3).padStart(6)} | exclus n=${String(j.nOut).padStart(4)} moy=${j.avgOut.toFixed(3).padStart(6)} | Welch t=${j.tw.toFixed(2).padStart(5)} | A ${j.a.toFixed(3)} (exclus ${j.aOut.toFixed(3)}) B ${j.b.toFixed(3)} (exclus ${j.bOut.toFixed(3)}) | /sem ${j.rate.toFixed(2)} | t:${+j.c.t} r:${+j.c.r} moitiés:${+j.c.halves} rythme:${+j.c.rate} => ${j.pass ? 'PASSE' : 'rejetée'}`);
      return j;
    };
    for (const nm of HOURS) if (show(nm, spec(nm)).pass) passH.push(nm);
    for (const nm of DAYS) if (show(nm, spec(nm)).pass) passJ.push(nm);
    let combo = null;
    if (passH.length && passJ.length) {
      const bh = passH.sort((x, y) => res[y].tw - res[x].tw)[0], bj = passJ.sort((x, y) => res[y].tw - res[x].tw)[0];
      combo = { ...spec(bh), skip: spec(bj).skip }; console.log('\nCOMBO =', bh, '+', bj); show('COMBO', combo);
    } else console.log('\nCOMBO : non calculée (il faut au moins une heure ET un jour qui passent)');
    // critère 5 : rejeu réel pour les variantes qui passent
    const passers = Object.keys(res).filter((k2) => res[k2].pass);
    console.log('\nCRITÈRE 5 — rejeu réel (variantes qui passent) :', passers.join(',') || 'aucune');
    for (const nm of passers) {
      const s = nm === 'COMBO' ? combo : spec(nm), rr = {};
      for (let Y = 2011; Y <= 2022; Y++) { const r = runYearF2(all, Y, s); if (r) rr[Y] = r; }
      const A = summarize(rs(pool(rr, 2011, 2016))), B = summarize(rs(pool(rr, 2017, 2022))), T = summarize(rs(pool(rr, 2011, 2022)));
      console.log(nm, '| A', fmt(A), '| B', fmt(B), '| 2011-22', fmt(T), '=>', T.avgR > 0.106 && A.avgR > 0 && B.avgR > 0 ? 'OK' : 'KO');
    }
    const best = passH.concat(passJ).filter((k2) => !k2.startsWith('COMBO')).sort((x, y) => res[y].tw - res[x].tw)[0];
    console.log('\nÀ lire au test (au plus 2) :', [best, combo ? 'COMBO' : null].filter(Boolean).join(',') || 'rien');
    console.log('(COMBO se relance en test avec : ' + (combo ? `from=${combo.from} to=${combo.to} skip=${combo.skip}` : '—') + ')');
  } else {
    const names = (process.argv[4] || '').split(',').filter(Boolean);
    console.log('ÉTAPE 2 (lecture unique) :', names.join(','));
    for (const nm of names) {
      const m = /^COMBO:(\d+)-(\d+)-(\d)$/.exec(nm), s = m ? { from: +m[1], to: +m[2], skip: +m[3] } : spec(nm);
      for (const [lab, a, b] of [['TEST 2023-2025', 2023, 2025], ['2026 (descriptif)', 2026, 2026]]) {
        const { kept, out } = split(pool(base, a, b), s);
        console.log(nm, lab.padEnd(18), 'gardés', f(kept), '| exclus', f(out), '| Welch t', welch(kept, out).toFixed(2));
      }
    }
  }
}
