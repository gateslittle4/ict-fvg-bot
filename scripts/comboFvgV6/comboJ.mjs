// comboJ.mjs - F2 + report au lendemain (variante B). Voir docs/PREREG-COMBO-FVG-REPORT-LENDEMAIN.md. Règles FIGÉES.
import { loadAll, RULES, summarize, fmt } from './comboG.mjs';
import { backtest, h4SweepFilter, h4Sweeps } from './lib/krysBacktest.js';
import { nyHour } from './lib/krysMethod.js';

const dayOf = (k) => Math.floor((k.t - 5 * 3600) / 86400); // jour civil New York (t - 5 h = heure NY réelle)

/**
 * Report au lendemain : ok[m] = 1 si, à la bougie m, le dernier balayage du low H4 a eu lieu le jour NY PRÉCÉDENT (veille calendaire exacte)
 * et qu'aucun FVG d'achat M15 strict (c1.high < c3.low) n'a eu son c3 le jour du balayage, APRÈS le balayage, dans la plage horaire [hourFrom, hourTo[.
 */
export function carryOk(c, N = 6, hourFrom = RULES.hourFrom, hourTo = RULES.hourTo) {
  const n = c.length, day = c.map(dayOf), { lastLow } = h4Sweeps(c, N);
  const tradable = new Uint8Array(n); // c3 d'un FVG d'achat dans la plage horaire
  for (let m = 2; m < n; m++) { const hr = nyHour(c[m].t); if (c[m - 2].h < c[m].l && hr >= hourFrom && hr < hourTo) tradable[m] = 1; }
  const dayEnd = new Int32Array(n); for (let m = n - 1; m >= 0; m--) dayEnd[m] = m + 1 < n && day[m + 1] === day[m] ? dayEnd[m + 1] : m;
  const nextTr = new Int32Array(n + 1).fill(n); for (let m = n - 1; m >= 0; m--) nextTr[m] = tradable[m] ? m : nextTr[m + 1];
  const ok = new Uint8Array(n);
  for (let m = 0; m < n; m++) { const s = lastLow[m]; if (s < 0 || day[m] !== day[s] + 1) continue; if (nextTr[s + 1] <= dayEnd[s]) continue; ok[m] = 1; }
  return ok;
}

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

/** Un an civil, mêmes règles que comboG.runYear. 'f2' = contrôle (balayage W=32) ; 'j' = f2 OU report au lendemain. Renvoie aussi les trades admis UNIQUEMENT par le report. */
export function runYearJ(all, Y, variants = ['f2', 'j']) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1);
  const start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((s, x) => s + x.c, 0) / (c.length - start), k = px / RULES.REF;
  const o = { start, spread: RULES.spread * k, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W }), cy = carryOk(c, RULES.N), out = {};
  for (const v of variants) {
    const viaCarry = new Set();
    const filter = (a) => { if (!(a.z.dir > 0)) return false; if (sw(a)) return true; if (v === 'j' && cy[a.z.created] === 1) { viaCarry.add(a.z.created); return true; } return false; };
    const T = backtest(c, { ...o, filter }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
    out[v] = { Y, trades: T.map((t) => t.r), carry: T.filter((t) => viaCarry.has(t.zCreated)).map((t) => t.r) };
  }
  return out;
}

const WEEKS_TEST = 155;
const pool = (res, v, key, a, b) => { const rs = []; for (let Y = a; Y <= b; Y++) if (res[Y]?.[v]) rs.push(...res[Y][v][key]); return rs; };

if (process.argv[1].endsWith('comboJ.mjs') && process.argv[3] !== 'noop') {
  const mode = process.argv[3] || 'train', all = loadAll(), res = {};
  const years = mode === 'train' ? [...Array(12).keys()].map((i) => 2011 + i).concat([2023, 2024, 2025]) : [2023, 2024, 2025, 2026];
  for (const Y of years) { const r = runYearJ(all, Y, mode === 'train' ? ['f2', 'j'] : ['j']); if (r) res[Y] = r; }
  if (mode === 'train') {
    console.log('Étape 1 (test 2023-25 masqué : seul le nombre de trades est lu)');
    for (const v of ['f2', 'j']) {
      const a = summarize(pool(res, v, 'trades', 2011, 2016)), b = summarize(pool(res, v, 'trades', 2017, 2022)), t = summarize(pool(res, v, 'trades', 2011, 2022)), cr = summarize(pool(res, v, 'carry', 2011, 2022));
      console.log(v.padEnd(3), '| 2011-16', fmt(a), '\n    | 2017-22', fmt(b), '\n    | 2011-22', fmt(t), '\n    | dont admis par le report seul :', fmt(cr), '\n    | trades/sem 2023-25 :', (pool(res, v, 'trades', 2023, 2025).length / WEEKS_TEST).toFixed(2));
    }
    const j = summarize(pool(res, 'j', 'trades', 2011, 2022)), f = summarize(pool(res, 'f2', 'trades', 2011, 2022)), cr = summarize(pool(res, 'j', 'carry', 2011, 2022));
    const rate = pool(res, 'j', 'trades', 2023, 2025).length / WEEKS_TEST;
    const c = { rythme: rate >= 1.5, t: j.t >= 3.0, moitiés: summarize(pool(res, 'j', 'trades', 2011, 2016)).avgR > 0 && summarize(pool(res, 'j', 'trades', 2017, 2022)).avgR > 0, meilleurQueF2: j.avgR > f.avgR, reportPositif: cr.avgR > 0 };
    console.log('\nCritères 1-3 :', JSON.stringify(c), '=> ', Object.values(c).every(Boolean) ? 'PASSE (étape 2 autorisée)' : 'NON VALIDÉE');
  } else {
    console.log('ÉTAPE 2 (lecture unique) : j'); console.log('TEST 2023-2025'.padEnd(20), fmt(summarize(pool(res, 'j', 'trades', 2023, 2025)))); console.log('2026 (descriptif)'.padEnd(20), fmt(summarize(pool(res, 'j', 'trades', 2026, 2026))));
  }
}
