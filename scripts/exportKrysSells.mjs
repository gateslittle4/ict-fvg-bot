// Exporte des ventes du bot v3 (stop c1, TP moitié du FVG cible/3R, filtre H4 balayage) sans issue, pour revue à l'aveugle.
// Usage : node exportKrysSells.mjs <csv> <sortie.json> <offset> <pas> <nombre> [dir=-1|1]
import fs from 'node:fs';
import { loadCsv } from './runKrysValidation.mjs';
import { backtest, h4Sweeps, h4SweepFilter } from './lib/krysBacktest.js';
const [csv, out, offset = 0, step = 8, count = 10, dir = -1] = process.argv.slice(2);
const c = loadCsv(csv), px = c.slice(700).reduce((a, x) => a + x.c, 0) / (c.length - 700), k = px / 8200;
const t = backtest(c, { start: 700, spread: 0.6 * k, stopMargin: 3 * k, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: h4SweepFilter(c, { N: 6, W: 32 }) }).trades.filter((x) => x.dir === +dir);
const sw = h4Sweeps(c, 6), pick = [];
for (let i = +offset; i < t.length && pick.length < +count; i += +step) pick.push(t[i]);
fs.writeFileSync(out, JSON.stringify(pick.map((x, n) => ({ n: n + 1, dir: x.dir, entry: x.entry, stop: x.stop, tp: x.tp, risk: x.risk, rr: Math.abs(x.tp - x.entry) / x.risk, placedIdx: x.placedIdx, zone0: x.zone0, zoneNow: x.zoneNow, zCreated: x.zCreated, target: x.target, targetCreated: x.targetCreated, sweepIdx: x.dir > 0 ? sw.lastLow[x.zCreated] : sw.lastHigh[x.zCreated], outcome_hidden: { r: +x.r.toFixed(2), why: x.why } }))));
console.log(t.length, 'ventes au total,', pick.length, 'exportées');
