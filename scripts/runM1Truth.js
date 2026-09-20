#!/usr/bin/env node
// runM1Truth.js
// Usage: node --max-old-space-size=4096 scripts/runM1Truth.js
//
// Esdras (2026-09-20) connected the bot's cTrader feed: real ONE-MINUTE candles (data/real-m1/, exported through
// /admin/export-candles?timeframe=M1, ~4 months, 5 pairs, real UTC). The biggest uncertainty of every earlier test was
// the order of a stop and a target inside one 15-minute candle. Here the SAME trades (bot mechanisms on the real M15
// series of 2026) are resolved twice on the M1 window:
//   - "M15 prudent" : the rule used so far (entry candle judged, stop wins ties inside a 15-min candle);
//   - "M1 exact"    : the entry fills at the first minute of its candle that reaches the entry price; from that minute on the
//                     stop/target are judged minute by minute (stop wins only inside the SAME minute).
// for today's configuration (all mechanisms, own stops) and the recommended one (2 mechanisms dropped, ATR floors).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildTrades, makeSimulator, ftmoAttempts, RECOMMENDED, DROPPED } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const shift = (cs) => cs.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
const merge15 = (s) => { const m = new Map(); for (const dir of ['data/real-data-2026-02-to-09', 'data/real-data-2026-09-17']) { try { for (const c of loadCandlesFromCsv(path.join(dir, `${s}.csv`)).candles) m.set(c.time, c); } catch {} } return shift([...m.values()].sort((a, b) => a.time - b.time)); };
const real = buildTrades(SYMBOLS, merge15, () => {});
const sim = makeSimulator(real);

// M1 series per symbol (engine time), typed arrays for a fast scan
const m1 = {};
for (const s of SYMBOLS) {
  const cs = shift(loadCandlesFromCsv(path.join('data/real-m1', `${s}.csv`)).candles);
  m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), o: Float64Array.from(cs, (c) => c.open), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}
const from = Math.max(...SYMBOLS.map((s) => m1[s].t[0])) + 86400000; // every pair covered
const lower = (arr, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (arr[m] >= x) hi = m; else lo = m + 1; } return lo; };
let unfilled = 0;
function resolveM1(t, d) {
  const S = m1[t.symbol];
  const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const start = lower(S.t, S.n, real.cache[t.symbol][t.i0].time);
  const end = Math.min(S.n, lower(S.t, S.n, real.cache[t.symbol][t.i0].time + 15 * 60000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
  if (fill < 0) { unfilled++; return null; }
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    const hitS = t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop;
    const hitT = t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp;
    if (hitS) return { r: -1, exit: S.t[i] };
    if (hitT) return { r: t.rr, exit: S.t[i] };
  }
  const i = maxI - 1;
  return { r: (t.dir * (S.c[i] - t.entry)) / d, exit: S.t[i] };
}


// diagnostic: where do "unfilled" entries actually touch their price?
{
  const pos = { prev: 0, later1: 0, later2_8: 0, never8: 0 }; const by = {}; let n = 0;
  for (const t of real.all) {
    if (t.time < from) continue;
    const S = m1[t.symbol]; const c0 = real.cache[t.symbol][t.i0].time;
    const touch = (a, b) => { const st = lower(S.t, S.n, a), en = Math.min(S.n, lower(S.t, S.n, b)); for (let i = st; i < en; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) return true; return false; };
    if (touch(c0, c0 + 15 * 60000)) continue; // filled in its own candle
    n++; const key = t.id.replace('bot-', ''); by[key] = (by[key] ?? 0) + 1;
    if (touch(c0 - 15 * 60000, c0)) pos.prev++; else if (touch(c0 + 15 * 60000, c0 + 30 * 60000)) pos.later1++; else if (touch(c0 + 30 * 60000, c0 + 8 * 15 * 60000)) pos.later2_8++; else pos.never8++;
  }
  console.error('entrées non remplies dans leur bougie (toutes stratégies, sans garde-fous):', n, JSON.stringify(pos), JSON.stringify(by));
}
const recK = (u) => RECOMMENDED[u] ?? 0, recSet = new Set(Object.keys(RECOMMENDED));
const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const money = (n) => `$${n.toFixed(0)}`;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const md = [];
md.push('# La vérité à la minute : mêmes trades, règlement M15 prudent vs M1 exact', '');
md.push(`Fenêtre couverte par les bougies d'1 minute du broker sur les 5 paires : ${day(from)} → ${day(Math.min(...SYMBOLS.map((s) => m1[s].t[m1[s].n - 1])))} (environ 4 mois, données réelles). 10 000 $, 0,5 % de risque, sans plafond d'objectif, garde-fous simplifiés, spread inclus, filtre « stop ≥ 3× le spread ».`, '');
md.push('| Configuration | Règlement | Trades | Gagnants | R net | Compte final | Pire baisse | Défis FTMO 1-Step (réussis / échoués / en cours) |', '|---|---|---|---|---|---|---|---|');
const rows = [];
for (const [name, kOf, inc] of [['Aujourd\'hui (15 mécanismes, stops d\'origine)', () => 0, null], ['Recommandé (13 mécanismes, planchers ATR)', recK, recSet]]) {
  for (const [rule, resolver] of [['M15 prudent', null], ['M1 exact', resolveM1]]) {
    unfilled = 0;
    const list = sim(kOf, inc, { fromTime: from, resolver });
    const s = [...list].sort((a, b) => a.exit - b.exit);
    let bal = 10000, peak = 10000, dd = 0; for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
    const f = ftmoAttempts(list);
    rows.push({ name, rule, list });
    md.push(`| ${name} | ${rule}${resolver && unfilled ? ` (${unfilled} entrées jamais remplies, écartées)` : ''} | ${list.length} | ${(list.filter((t) => t.net > 0).length / list.length * 100).toFixed(0)} % | ${fmt(list.reduce((a, t) => a + t.net, 0))} | **${money(bal)}** (${fmt((bal - 10000) / 100)} %) | ${dd.toFixed(0)} % | ${f.pass} / ${f.fail} / ${f.attempts.filter((a) => a.result === 'EN COURS').length} |`);
  }
}
// where the two rules disagree, on the recommended config's trades
const a = new Map(rows[2].list.map((t) => [`${t.symbol}|${t.id}|${t.time}`, t])), b = new Map(rows[3].list.map((t) => [`${t.symbol}|${t.id}|${t.time}`, t]));
let both = 0, sameSign = 0, m15LossM1Win = 0, m15WinM1Loss = 0;
for (const [k, t] of a) { const u = b.get(k); if (!u) continue; both++; if ((t.net > 0) === (u.net > 0)) sameSign++; else if (t.net <= 0 && u.net > 0) m15LossM1Win++; else m15WinM1Loss++; }
md.push('', `Sur les ${both} trades pris par les deux règlements (configuration recommandée) : même issue (gain/perte) pour ${sameSign} (${(sameSign / both * 100).toFixed(0)} %) ; **perte en M15 mais gain en M1 : ${m15LossM1Win}** ; gain en M15 mais perte en M1 : ${m15WinM1Loss}.`, '');
md.push('## Limites', '', '- Les entrées viennent des modules de backtest (bougies M15) ; un ordre limite est supposé rempli au premier minute de sa bougie M15 qui touche son prix.', '- Bid uniquement (le spread est ajouté comme coût fixe) ; pas de glissement, pas d\'élargissement du spread au rollover.', '- Environ 4 mois : un échantillon, pas une preuve.');
const out = path.join('data', 'real-m1', 'm1-truth-report.md');
fs.writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
