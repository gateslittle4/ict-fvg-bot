// Exporte des trades du bot (sans leur issue) pour un jugement à l'aveugle. Usage : node exportKrysTrades.mjs <csv> <sortie.json> <offset> <pas> <nombre>
import fs from 'node:fs';
import { loadCsv, run } from './runKrysValidation.mjs';
import { h4Sweeps } from './lib/krysBacktest.js';
const [csv, out, offset = 0, step = 9, count = 10] = process.argv.slice(2);
const c = loadCsv(csv), r = run(c), sw = h4Sweeps(c, 6);
const pick = [];
for (let i = +offset; i < r.trades.length && pick.length < +count; i += +step) pick.push(r.trades[i]);
const rows = pick.map((t, n) => ({ n: n + 1, dir: t.dir, entry: t.entry, stop: t.stop, tp: t.tp, risk: t.risk, rr: Math.abs(t.tp - t.entry) / t.risk, placedIdx: t.placedIdx, zone0: t.zone0, zoneNow: t.zoneNow, zCreated: t.zCreated, target: t.target, targetCreated: t.targetCreated,
  sweepIdx: t.dir > 0 ? sw.lastLow[t.zCreated] : sw.lastHigh[t.zCreated], outcome_hidden: { r: +t.r.toFixed(2), why: t.why } }));
fs.writeFileSync(out, JSON.stringify(rows));
console.log(rows.length, 'trades exportés');
