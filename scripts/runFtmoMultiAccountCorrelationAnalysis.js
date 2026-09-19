#!/usr/bin/env node
// runFtmoMultiAccountCorrelationAnalysis.js
// Usage: node scripts/runFtmoMultiAccountCorrelationAnalysis.js
//
// Esdras: "donc statistiquement je dois acheter 2 comptes au moins pour
// avoir plus de chance de passer un challenge?" The naive math (13/14 =
// 92.9% per cycle, so 2 accounts -> 1-(1-0.929)^2 = 99.5% chance at least
// one passes) ASSUMES the two accounts are independent draws. They are
// NOT, if bought at the same time: both run the exact same
// LiveStrategyEngine on the exact same market data, so they take the
// SAME signals at the SAME times - a bad stretch (like the March-May 2025
// bust) hits both accounts simultaneously, not one or the other. This
// script tests that directly rather than assuming it either way: replay
// a SINGLE FTMO 1-Step attempt (no reset-and-retry - one real $10k
// purchase) starting on many different calendar dates across 2025, and
// see whether pass/bust outcomes cluster around the same calendar windows
// (correlated - buying a 2nd account doesn't really diversify) or scatter
// independently of start date (buying a 2nd account genuinely helps).
//
// Same Phase-1 method as runFtmo1Step2025FullComboCycle.js (real
// LiveStrategyEngine.warmUp(), all 8 live mechanisms incl. CBDR, full
// 2010-2025 warm-up context, trades filtered to 2025). Phase 2 here is
// different: for each of 26 start dates (every ~2 weeks across 2025), run
// ONE real FTMO 1-Step attempt (buildEffectiveConfig + a real
// GuardrailEngine, canTakeNewTrade() gating every entry) from that date
// forward, stopping at whichever comes first: target reached, drawdown
// breached, or 2025 data runs out (result 'inconclusive' - a real account
// has no FTMO time limit, so running out of THIS script's data isn't a
// real outcome, just a data-window limit, reported honestly as such).

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = 'data/backtest-input';
const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade;
const YEAR_START = Date.parse('2025-01-01T00:00:00Z');
const YEAR_END = Date.parse('2026-01-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const START_OFFSET_DAYS = 14; // one hypothetical account-purchase date every 2 weeks

function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}
function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function runPhase1() {
  const symbols = CONFIG.symbols;
  const candlesBySymbol = {};
  for (const symbol of symbols) {
    const { candles } = loadCandlesFromCsv(path.join(DATA_DIR, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles;
  }
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = candlesBySymbol[s];

  const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);

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
    guardrail: warmupGuardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });

  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      const exitPrice = signal.outcome === 'win' ? open.targetPrice : signal.outcome === 'loss' ? open.stopPrice : candle.close;
      trades.push({
        symbol: signal.symbol, source: open.source, direction: open.direction,
        entryTime: open.entryTime, exitTime: signal.exitTime,
        netRMultiple: netRMultipleOf(open.direction, open.entryPrice, open.distance, exitPrice, signal.symbol),
      });
    },
  });

  return trades.filter((t) => t.entryTime >= YEAR_START && t.entryTime < YEAR_END).sort((a, b) => a.entryTime - b.entryTime);
}

/** One real attempt - no reset-and-retry - starting at `startTime`, using only trades from then on. */
function runOneAttempt(trades2025, startTime, effective) {
  const guardrail = new GuardrailEngine({ ...effective.guardrails });
  guardrail.setBalance(STARTING_BALANCE, startTime);
  let balance = STARTING_BALANCE;
  let tradeCount = 0;

  for (const t of trades2025) {
    if (t.entryTime < startTime) continue;
    if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * t.netRMultiple;
    balance += pnl;
    tradeCount++;
    guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
    const status = guardrail.getStatus(t.exitTime, t.symbol);
    if (status.targetReached) return { outcome: 'pass', endTime: t.exitTime, trades: tradeCount, balance };
    if (status.overallDrawdownBreached) return { outcome: 'bust', endTime: t.exitTime, trades: tradeCount, balance };
  }
  return { outcome: 'inconclusive (fin des données 2025)', endTime: YEAR_END, trades: tradeCount, balance };
}

function main() {
  console.log('Phase 1 : warmUp() sur 2010-2025, les 8 mécanismes live réels...');
  const trades2025 = runPhase1();
  console.log(`Trades 2025 disponibles : ${trades2025.length}\n`);

  const effective = buildEffectiveConfig({
    id: 'ftmo-1step-correlation-sim', propFirmProgramId: 'ftmo-1step', phaseIndex: 0,
    guardrails: CONFIG.guardrails, riskPctPerTrade: RISK_PCT_PER_TRADE,
  });

  const startDates = [];
  for (let d = YEAR_START; d < YEAR_END; d += START_OFFSET_DAYS * DAY_MS) startDates.push(d);

  console.log(`Simulation d'UN SEUL vrai essai (pas de reset-and-retry) démarrant tous les ${START_OFFSET_DAYS} jours sur 2025 (${startDates.length} dates de départ hypothétiques) :\n`);
  console.log('| Date d\'achat | Résultat | Fin | Jours pour conclure | Trades |');
  console.log('|---|---|---|---|---|');
  const results = [];
  for (const start of startDates) {
    const r = runOneAttempt(trades2025, start, effective);
    results.push({ start, ...r });
    const days = Math.round((r.endTime - start) / DAY_MS);
    console.log(`| ${fmtDate(start)} | ${r.outcome} | ${fmtDate(r.endTime)} | ${days} | ${r.trades} |`);
  }

  const passes = results.filter((r) => r.outcome === 'pass').length;
  const busts = results.filter((r) => r.outcome === 'bust').length;
  const inconclusive = results.length - passes - busts;
  console.log(`\n${passes}/${results.length} dates de départ auraient réussi | ${busts} auraient busté | ${inconclusive} inconclusif (données 2025 épuisées)`);

  // Correlation check: do bust outcomes cluster around the same calendar
  // window (correlated - buying a 2nd account bought around the SAME time
  // doesn't diversify) or scatter through the year (independent enough
  // that a 2nd account genuinely helps)?
  const bustDates = results.filter((r) => r.outcome === 'bust').map((r) => fmtDate(r.start));
  if (bustDates.length > 0) {
    console.log(`\nDates de départ qui bustent : ${bustDates.join(', ')}`);
    console.log("-> si ces dates sont regroupées dans une même fenêtre calendaire, ça confirme que le risque n'est PAS indépendant d'un compte à l'autre s'ils tournent en même temps.");
  }
}

main();
