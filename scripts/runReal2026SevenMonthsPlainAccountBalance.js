#!/usr/bin/env node
// runReal2026SevenMonthsPlainAccountBalance.js
// Usage: node scripts/runReal2026SevenMonthsPlainAccountBalance.js
//
// Esdras: "donne moi un chiffre, apres les 7 mois, avec 10k, combien serait
// le compte apres les 7 mois?" - ONE number, no FTMO cycle reset (that's a
// different question, already answered in
// runFtmo1Step2026Real7MonthsCycle.js): just the current live combo (8
// mechanisms incl. CBDR) trading a plain $10k account continuously across
// the real 2026-02-13 -> 2026-09-17 window, under the account's OWN real
// guardrails (CONFIG.guardrails - maxTradesPerDay/cooldown/dailyLossLimitPct,
// no FTMO target-stop or drawdown-bust), same data/method as every other
// real-2026 script this session.

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

function toEngineTime(candles) { return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS })); }
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}
function fmtDate(ms) { return new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10); }

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

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails }); // the account's REAL guardrails, no FTMO overlay
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
  let trades = 0, wins = 0;
  let firstTime = null, lastTime = null;

  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice, distance: signal.distance, riskAmount: signal.riskAmount, entryTime: candle.time,
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
      const pnl = open.riskAmount * (grossR - costR);

      balance += pnl;
      engine.setBalance(balance);
      guardrail.recordTrade({ pnl, time: signal.exitTime, balanceAfter: balance, symbol: signal.symbol });
      trades++;
      if (pnl > 0) wins++;
      if (firstTime === null) firstTime = open.entryTime;
      lastTime = signal.exitTime;
    },
  });

  const pct = (100 * (balance - STARTING_BALANCE)) / STARTING_BALANCE;
  console.log(`Combo actuel (8 mécanismes incl. CBDR), compte $${STARTING_BALANCE}, ${RISK_PCT_PER_TRADE}%/trade, garde-fous réels (pas de règle FTMO, pas de reset) :`);
  console.log(`Fenêtre : ${fmtDate(firstTime)} -> ${fmtDate(lastTime)} (données réelles 2026-02-13 -> 2026-09-17)`);
  console.log(`${trades} trades, ${wins} gagnants (${((100 * wins) / trades).toFixed(1)}% WR)`);
  console.log(`\nSolde final : $${balance.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);
}

main();
