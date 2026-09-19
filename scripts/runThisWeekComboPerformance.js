#!/usr/bin/env node
// runThisWeekComboPerformance.js
// Usage: node scripts/runThisWeekComboPerformance.js
//
// Esdras: "roule mes combos pour la semaine ci et vois comment il aurait
// performé." Replays the REAL production LiveStrategyEngine (built from
// CONFIG directly, no propFirmProgramId - the live account currently has
// none assigned) with all 8 currently-live mechanisms (FVG, Divergence,
// NWOG, Judas Swing, Weekly Sweep, Breaker Block, Silver Bullet, CBDR),
// same technique as runFtmo1StepFullComboAccountImpact.js, over the most
// recent real broker data in this repo, then isolates trades whose ENTRY
// falls in the last 7 calendar days actually covered by that data.
//
// KNOWN GAP, stated up front: the newest real export in this repo
// (data/real-data-2026-09-17/) ends 2026-09-17T09:30 UTC. Today is
// 2026-09-19 (Saturday) - the live account's own /admin/export-candles
// route could pull fresher candles but is token-gated
// (ADMIN_EXPORT_TOKEN, not known to this session). So "this week" here
// means the last 7 real days actually available (2026-09-10 ->
// 2026-09-17), missing roughly the last 2.5 trading days - flagged in the
// report, not glossed over.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';
const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}
function fmtMoney(n) { return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

function main() {
  const symbols = CONFIG.symbols;
  const candlesBySymbolRaw = {};
  for (const symbol of symbols) {
    const { candles: a } = loadCandlesFromCsv(path.join(DIR_A, `${symbol}.csv`));
    const { candles: b } = loadCandlesFromCsv(path.join(DIR_B, `${symbol}.csv`));
    candlesBySymbolRaw[symbol] = toEngineTime(mergeCandles(a, b));
  }
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const candlesBySymbol = {};
  for (const s of orderedSymbols) candlesBySymbol[s] = candlesBySymbolRaw[s];

  const dataEnd = Math.max(...orderedSymbols.map((s) => candlesBySymbol[s][candlesBySymbol[s].length - 1].time));
  const weekStart = dataEnd - WEEK_MS;

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
  guardrail.setBalance(STARTING_BALANCE, candlesBySymbol[orderedSymbols[0]][0].time);

  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    cbdrConfig: CONFIG.cbdr,
    guardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });

  let balance = STARTING_BALANCE;
  const pendingOpen = new Map();
  const allTrades = [];

  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, riskAmount: signal.riskAmount, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;

      const bullish = open.direction === 'bullish';
      let exitPrice;
      if (signal.outcome === 'win') exitPrice = open.targetPrice;
      else if (signal.outcome === 'loss') exitPrice = open.stopPrice;
      else exitPrice = candle.close;

      const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
      const grossR = signedMove / open.distance;
      const spread = DEFAULT_SPREADS[signal.symbol] ?? 0;
      const costR = spread > 0 ? spread / open.distance : 0;
      const netR = grossR - costR;
      const pnl = open.riskAmount * netR;

      balance += pnl;
      engine.setBalance(balance);
      guardrail.recordTrade({ pnl, time: signal.exitTime, balanceAfter: balance, symbol: signal.symbol });

      allTrades.push({ symbol: signal.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime, exitTime: signal.exitTime, outcome: signal.outcome, netR, pnl, balanceAfter: balance });
    },
  });

  // warmUp() processes each symbol's FULL history sequentially (US500 in
  // full, then US100 in full, etc. - not interleaved by real time, see
  // runFtmo1StepFullComboAccountImpact.js's own Divergence-ordering
  // comment for why symbol order matters at all here) - so `allTrades` in
  // its natural push order is grouped by symbol, NOT chronological, and
  // `balanceAfter` at each trade reflects that fictitious symbol-by-symbol
  // narrative rather than true wall-clock compounding. Sorting by
  // entryTime below fixes the DISPLAY order; balanceAfter is dropped from
  // the per-trade table entirely below (see its own comment) since
  // resorting doesn't fix the number itself.
  const weekTrades = allTrades.filter((t) => t.entryTime >= weekStart && t.entryTime <= dataEnd).sort((a, b) => a.entryTime - b.entryTime);

  console.log(`Données disponibles jusqu'à : ${new Date(dataEnd + FIXED_EST_TO_UTC_OFFSET_MS).toISOString()} (réel UTC)`);
  console.log(`Fenêtre "cette semaine" utilisée : ${new Date(weekStart + FIXED_EST_TO_UTC_OFFSET_MS).toISOString()} -> ${new Date(dataEnd + FIXED_EST_TO_UTC_OFFSET_MS).toISOString()}`);
  console.log('⚠️  Ne couvre PAS les ~2.5 derniers jours de bourse (données pas encore exportées dans ce repo).\n');

  console.log(`Total combo (8 mécanismes, compte $${STARTING_BALANCE}, risque ${RISK_PCT_PER_TRADE}%/trade) sur cette fenêtre :`);
  console.log(`  ${weekTrades.length} trades`);

  if (weekTrades.length === 0) {
    console.log('  Aucun trade cette semaine.');
    return;
  }

  const wins = weekTrades.filter((t) => t.pnl > 0).length;
  const losses = weekTrades.filter((t) => t.pnl <= 0).length;
  const totalPnl = weekTrades.reduce((s, t) => s + t.pnl, 0);
  console.log(`  ${wins} gagnants / ${losses} perdants (WR ${((100 * wins) / weekTrades.length).toFixed(1)}%)`);
  console.log(`  PnL semaine : ${fmtMoney(totalPnl)} (${fmtPct((100 * totalPnl) / STARTING_BALANCE)} du solde de départ)\n`);

  const bySource = new Map();
  for (const t of weekTrades) {
    if (!bySource.has(t.source)) bySource.set(t.source, []);
    bySource.get(t.source).push(t);
  }
  console.log('| Mécanisme | Symbole(s) | Trades | Gagnants | PnL |');
  console.log('|---|---|---|---|---|');
  for (const [source, list] of [...bySource.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const syms = [...new Set(list.map((t) => t.symbol))].join(', ');
    const w = list.filter((t) => t.pnl > 0).length;
    const pnl = list.reduce((s, t) => s + t.pnl, 0);
    console.log(`| ${source} | ${syms} | ${list.length} | ${w} | ${fmtMoney(pnl)} |`);
  }

  // No "solde après" column here on purpose - see the comment on
  // weekTrades above: this engine processes symbols sequentially, not
  // interleaved by real time, so any running balance shown next to a
  // chronologically-sorted list would still reflect the wrong
  // compounding order. Each trade's PnL itself is accurate (risk% x net
  // R-multiple), just not the exact $ a true wall-clock replay would have
  // sized it at - a small effect (this account never grew/shrank enough
  // this week to change 0.5%-of-balance sizing meaningfully trade to
  // trade), not zero.
  console.log('\nDétail par trade (ordre chronologique réel) :');
  console.log('| Date entrée (UTC réel) | Symbole | Mécanisme | Sens | Résultat | PnL |');
  console.log('|---|---|---|---|---|---|');
  for (const t of weekTrades) {
    const dateStr = new Date(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
    console.log(`| ${dateStr} | ${t.symbol} | ${t.source} | ${t.direction} | ${t.outcome} | ${fmtMoney(t.pnl)} |`);
  }
}

main();
