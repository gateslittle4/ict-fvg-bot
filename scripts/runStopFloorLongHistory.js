#!/usr/bin/env node
// runStopFloorLongHistory.js
// Usage: node --max-old-space-size=4096 scripts/runStopFloorLongHistory.js
//
// Esdras (2026-09-20): "fais le test sur toutes les annees, c'est le moment decisif pour voir si on va continuer
// avec le trading ou non". The 7 real months suggested that a WIDER stop (floor of k x ATR14 on M15, same R:R)
// beats the structure stop the mechanisms use today (+7 % -> +26 % / +40 %), but that was 7 months, 7 variants
// tried, no train/test split. This runs the same question on the whole 2010-2025 history.
//
// What is run: the bot's 8 mechanisms on the pairs where each really trades (replaySignals.js BOT_MECHANISMS ->
// raw trades: entry time/price, structure stop, target). Every trade is then RE-RESOLVED here with one honest
// rule for every variant:
//   - entry at the trade's entry price, judged from its OWN candle on (a stop touched in the entry candle is a
//     loss; when stop and target are in the same candle the stop wins - the project's rule);
//   - stop distance d = max(structure stop distance, k x ATR14(M15) before the entry); target = same R:R as the
//     mechanism's own (target distance scales with d); a trade is only taken if d >= 3 x spread (the bot's own
//     viability filter); spread paid once as spread / d (the project's cost convention);
//   - a light version of the live guardrails, identical for every variant: one open position per symbol, at most
//     3 trades a day, 30 min pause after a loss, no new trade once the day is at -4R (= -2 % at 0.5 % risk).
// k = 0 is today's stop. Results: trades, win rate, total net R, R per year, train (<= 2023) vs test (2024+),
// max drawdown in R, and the account at 0.5 % risk compounded (no ceiling).
//
// Limits (also printed): raw entries come from the backtest modules (a limit entry is assumed filled at its price);
// constant spreads; concurrency/guard is approximate; results are net of nothing else (no slippage/rollover
// widening).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { BOT_MECHANISMS, runReplayStrategy } from '../src/backtest/replaySignals.js';
import { CONFIG } from '../src/config.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';

const DIR = 'data/backtest-input';
const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const KS = [0, 1, 2, 3];
const CUT = Date.UTC(2024, 0, 1);
const DAY = 86400000;
const PRIORITY = Object.fromEntries(BOT_MECHANISMS.map((m, i) => [`bot-${m.id.replace('bot-', '')}`, i]));

const rrOf = (id) => ({ 'bot-fvg': null, 'bot-divergence': CONFIG.divergence?.rrMultiple ?? 3 }[id] ?? null);

const effective = buildEffectiveConfig({ id: 'stop-floor', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 });
// FTMO 1-Step attempts over the trade list (project GuardrailEngine: +10 % target, trailing end-of-day 10 % max loss), 10 000 $ each, 0.5 % risk
function ftmoAttempts(list) {
  let g = null, bal = 10000, pass = 0, fail = 0, cur = null; const durations = [];
  for (const t of list) {
    if (!g) { g = new GuardrailEngine({ ...effective.guardrails, targetPct: 10 }); bal = 10000; g.setBalance(bal, t.exit); cur = t.exit; }
    const pnl = bal * 0.005 * t.net; bal += pnl;
    g.recordTrade({ pnl, time: t.exit, balanceAfter: bal, symbol: t.symbol });
    const st = g.getStatus(t.exit, t.symbol);
    if (st.targetReached) { pass++; durations.push((t.exit - cur) / DAY); g = null; }
    else if (st.overallDrawdownBreached) { fail++; g = null; }
  }
  durations.sort((a, b) => a - b);
  return { pass, fail, medDays: durations.length ? durations[Math.floor(durations.length / 2)] : null };
}
const load = (s) => loadCandlesFromCsv(path.join(DIR, `${s}.csv`)).candles;

// ---- 1) raw trades per symbol, with the ATR14 at entry and the entry candle index
const all = [];
const cache = {};
for (const symbol of SYMBOLS) {
  cache[symbol] ??= load(symbol);
  const candles = cache[symbol];
  const ids = BOT_MECHANISMS.filter((m) => m.symbolsOf().includes(symbol));
  const tr = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  const atrAt = (i) => { let a = 0, k = 0; for (let j = Math.max(1, i - 13); j <= i; j++) { a += tr[j]; k++; } return k ? a / k : 0; };
  const indexOf = new Map(candles.map((c, i) => [c.time, i]));
  for (const m of ids) {
    let partner = null;
    if (m.needsPartner) { const p = m.partnerOf(symbol); cache[p] ??= load(p); partner = cache[p]; }
    const list = runReplayStrategy(m.id, candles, symbol, partner) ?? [];
    let kept = 0;
    for (const t of list) {
      const i0 = indexOf.get(t.entryTime);
      if (i0 === undefined || i0 < 20) continue;
      const dist = Math.abs(t.entryPrice - t.stopPrice);
      if (!(dist > 0)) continue;
      let tdist = Number.isFinite(t.targetPrice) && t.targetPrice !== null ? Math.abs(t.targetPrice - t.entryPrice) : null;
      if (tdist === null) { const rr = rrOf(m.id) ?? 3; tdist = rr * dist; }
      all.push({ symbol, id: m.id, dir: t.direction === 'bullish' ? 1 : -1, time: t.entryTime, i0, entry: t.entryPrice, dist, rr: tdist / dist, atr: atrAt(i0 - 1) });
      kept++;
    }
    console.error(`  ${symbol} ${m.id}: ${list.length} raw trades, ${kept} usable`);
  }
}
all.sort((a, b) => a.time - b.time || PRIORITY[a.id] - PRIORITY[b.id]);
console.error(`total raw trades: ${all.length}`);

// ---- 2) resolve one trade under a stop distance
function resolve(t, d) {
  const cs = cache[t.symbol];
  const stop = t.entry - t.dir * d;
  const tp = t.entry + t.dir * d * t.rr;
  for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
    const c = cs[i];
    if (t.dir === 1 ? c.low <= stop : c.high >= stop) return { r: -1, exit: c.time };
    if (t.dir === 1 ? c.high >= tp : c.low <= tp) return { r: t.rr, exit: c.time };
  }
  const c = cs[Math.min(cs.length - 1, t.i0 + 479)];
  return { r: (t.dir * (c.close - t.entry)) / d, exit: c.time };
}

// ---- 3) one variant, with the light guardrails
function simulate(k) {
  const openUntil = {}; // symbol -> exit time of the last taken trade
  const dayCount = new Map(); const dayR = new Map();
  const closedLosses = []; // exit times of losses, ascending insertion is not guaranteed -> checked by scan of recent ones
  const out = [];
  for (const t of all) {
    const d = k ? Math.max(t.dist, k * t.atr) : t.dist;
    const spread = DEFAULT_SPREADS[t.symbol] ?? 0;
    if (spread > 0 && d < 3 * spread) continue;
    if ((openUntil[t.symbol] ?? -1) > t.time) continue; // one open position per symbol
    const day = Math.floor(t.time / DAY);
    if ((dayCount.get(day) ?? 0) >= 3) continue;
    if ((dayR.get(day) ?? 0) <= -4) continue;
    if (closedLosses.some((x) => x <= t.time && t.time < x + 30 * 60000)) continue;
    const res = resolve(t, d);
    const net = res.r - spread / d;
    openUntil[t.symbol] = res.exit;
    dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
    dayR.set(day, (dayR.get(day) ?? 0) + (res.exit - t.time < DAY ? net : 0));
    if (net < 0) { closedLosses.push(res.exit); if (closedLosses.length > 400) closedLosses.splice(0, 200); }
    out.push({ ...t, net, exit: res.exit });
  }
  return out;
}

const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const rows = {};
const yearsSet = new Set();
for (const k of KS) {
  const tr = simulate(k).sort((a, b) => a.exit - b.exit);
  const byYear = {};
  let sum = 0, wins = 0, peak = 0, dd = 0, run = 0, bal = 10000, balPeak = 10000, balDd = 0, train = 0, test = 0, nTrain = 0, nTest = 0;
  for (const t of tr) {
    const y = new Date(t.time).getUTCFullYear(); yearsSet.add(y);
    byYear[y] = (byYear[y] ?? 0) + t.net;
    sum += t.net; if (t.net > 0) wins++;
    run += t.net; peak = Math.max(peak, run); dd = Math.max(dd, peak - run);
    bal *= 1 + 0.005 * t.net; balPeak = Math.max(balPeak, bal); balDd = Math.max(balDd, (balPeak - bal) / balPeak * 100);
    if (t.time < CUT) { train += t.net; nTrain++; } else { test += t.net; nTest++; }
  }
  rows[k] = { ftmo: ftmoAttempts(tr), n: tr.length, wr: wins / tr.length * 100, sum, dd, bal, balDd, train, test, nTrain, nTest, byYear };
}

const years = [...yearsSet].sort();
const md = [];
md.push('# Plancher de stop en ATR — 2010-2025, 8 mécanismes du bot', '');
md.push('Chaque trade est re-résolu avec la même règle pour toutes les variantes (voir l\'en-tête de `scripts/runStopFloorLongHistory.js`) : entrée jugée dès sa bougie, stop = max(stop de structure, k × ATR14 M15), même R:R, filtre « stop ≥ 3× le spread », garde-fous simplifiés identiques (1 position par paire, 3 trades/jour, pause 30 min après une perte, stop du jour à −4R). **k = 0 = le stop d\'aujourd\'hui.**', '');
md.push('| Plancher | Trades | Gagnants | R net total | Entraînement ≤ 2023 (R) | Test 2024+ (R) | Pire baisse (R) | Compte 10 000 $ à 0,5 % | Pire baisse du compte | Défis FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|---|---|');
for (const k of KS) { const r = rows[k]; md.push(`| ${k ? `${k}× ATR` : 'stop d\'origine'} | ${r.n} | ${r.wr.toFixed(0)} % | ${fmt(r.sum)} | ${fmt(r.train)} (${r.nTrain}) | ${fmt(r.test)} (${r.nTest}) | ${r.dd.toFixed(0)} | $${r.bal.toFixed(0)} | ${r.balDd.toFixed(0)} % | **${r.ftmo.pass} / ${r.ftmo.fail}**${r.ftmo.medDays ? ` (médiane ${r.ftmo.medDays.toFixed(0)} j pour réussir)` : ''} |`); }
md.push('', '## R net par année', '', `| Année | ${KS.map((k) => (k ? `${k}× ATR` : 'origine')).join(' | ')} |`, `|---|${KS.map(() => '---').join('|')}|`);
for (const y of years) md.push(`| ${y} | ${KS.map((k) => fmt(rows[k].byYear[y] ?? 0)).join(' | ')} |`);
const better = years.filter((y) => (rows[2].byYear[y] ?? 0) > (rows[0].byYear[y] ?? 0)).length;
md.push('', `Années où « 2× ATR » fait mieux que le stop d'origine : ${better} sur ${years.length}.`, '');
md.push('## Limites', '', '- Entrées issues des modules de backtest (un ordre limite est supposé rempli à son prix) ; spread constant ; pas de glissement ni d\'élargissement du spread au rollover.', '- Garde-fous approximés (pas le moteur complet) mais identiques pour toutes les variantes : la comparaison est équitable, le niveau absolu est indicatif.', '- Seuls 4 réglages (k) ont été essayés : peu de risque de surajustement, mais la séparation ≤ 2023 / 2024+ reste la vraie preuve.');
const out = path.join('data', 'backtest-input', 'stop-floor-atr-2010-2025.md');
fs.writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
console.error(`Wrote ${out}`);
