#!/usr/bin/env node
// runFtmo1Step2026Real7MonthsCycle.js
// Usage: node scripts/runFtmo1Step2026Real7MonthsCycle.js
//
// Esdras: "fais le test alors pour les 7 derniers mois de 2026 avec les
// memes cycles, meme parametre pour voir comment la strategie aurait
// performe pour 2026." Direct sibling of runFtmo1Step2025FullComboCycle.js
// (same method, same FTMO 1-Step rules, same $10k/0.5%-per-trade, same all-
// 8-live-mechanisms combo including CBDR) but on REAL broker data instead
// of the 2010-2025 historical CSVs: data/real-data-2026-02-to-09/ (merged
// with the newer data/real-data-2026-09-17/ export, same dedup-by-timestamp
// technique as runFtmo1StepFullComboAccountImpact.js) - real UTC broker
// candles, 2026-02-13 -> 2026-09-17, ~7 months.
//
// Same two-phase method as the 2025 script (see its own header for the
// fuller rationale): Phase 1 replays engine.warmUp() ONCE with a
// permissive guardrail to get the engine's natural trade list; Phase 2
// replays that list through real FTMO 1-Step cycles (buildEffectiveConfig
// + a real GuardrailEngine per cycle, canTakeNewTrade() gating every
// entry, a cycle ending the instant profit_target_reached or
// overall_drawdown_breached is reported).
//
// HONEST CAVEAT specific to this run, absent from the 2025 script: warm-up
// context here is only the ~7 months of real data itself (no 2010-2025
// history prepended) - H4 EMA200 bias/structure/CBDR's own depth
// preference (15 years, per HANDOFF.md) don't have their usual long
// runway. Same simplification already accepted by
// runFtmo1StepFullComboReal7MonthsCycle.js (the older 7-mechanism version
// of this same idea) - the very first weeks (mid-February 2026) are
// therefore a bit less reliable than the rest of the window, flagged
// rather than glossed over.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';
const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade; // 0.5% - 'challenge' mode default

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}
function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}
function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function fmtMoney(n) { return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

// --- Phase 1 ---------------------------------------------------------------
function runPhase1() {
  const symbols = CONFIG.symbols;
  const candlesBySymbolRaw = {};
  for (const symbol of symbols) {
    const { candles: a } = loadCandlesFromCsv(path.join(DIR_A, `${symbol}.csv`));
    const { candles: b } = loadCandlesFromCsv(path.join(DIR_B, `${symbol}.csv`));
    candlesBySymbolRaw[symbol] = toEngineTime(mergeCandles(a, b));
  }
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = candlesBySymbolRaw[s];

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

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

// --- Phase 2: real FTMO 1-Step cycles ---------------------------------------
function runPhase2(trades) {
  const effective = buildEffectiveConfig({
    id: 'ftmo-1step-2026-7months-cycle', propFirmProgramId: 'ftmo-1step', phaseIndex: 0,
    guardrails: CONFIG.guardrails, riskPctPerTrade: RISK_PCT_PER_TRADE,
  });

  const cycles = [];
  let cycle = null;
  let vetoedByGuardrail = 0;

  function startCycle(startTime) {
    const guardrail = new GuardrailEngine({ ...effective.guardrails });
    guardrail.setBalance(STARTING_BALANCE, startTime);
    cycle = { n: cycles.length + 1, startTime, endTime: null, outcome: 'en cours', trades: [], balance: STARTING_BALANCE, guardrail };
  }

  startCycle(trades.length > 0 ? trades[0].entryTime : Date.now());

  for (const t of trades) {
    if (!cycle.guardrail.canTakeNewTrade(t.entryTime, t.symbol)) {
      vetoedByGuardrail++;
      continue;
    }
    const riskAmount = cycle.balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * t.netRMultiple;
    cycle.balance += pnl;
    cycle.trades.push({ ...t, pnl, balanceAfter: cycle.balance });
    cycle.guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: cycle.balance, symbol: t.symbol });

    const status = cycle.guardrail.getStatus(t.exitTime, t.symbol);
    if (status.targetReached || status.overallDrawdownBreached) {
      cycle.endTime = t.exitTime;
      cycle.outcome = status.targetReached ? 'RÉUSSI (+10%)' : 'RATÉ (drawdown -10%)';
      cycles.push(cycle);
      startCycle(t.exitTime);
    }
  }
  if (cycle.trades.length > 0 || cycles.length === 0) {
    cycle.endTime = trades.length > 0 ? trades[trades.length - 1].exitTime : Date.now();
    cycle.outcome = `en cours (${fmtPct(((cycle.balance - STARTING_BALANCE) / STARTING_BALANCE) * 100)})`;
    cycles.push(cycle);
  }

  return { cycles, vetoedByGuardrail, effective };
}

function main() {
  console.log("Phase 1 : warmUp() sur les 7 mois réels de 2026 (2026-02-13 -> 2026-09-17), les 8 mécanismes live réels...");
  const trades = runPhase1();
  console.log(`Trades produits : ${trades.length}\n`);

  console.log('Phase 2 : simulation des cycles FTMO 1-Step réels (buildEffectiveConfig, GuardrailEngine réel)...\n');
  const { cycles, vetoedByGuardrail, effective } = runPhase2(trades);

  console.log(`Compte $${STARTING_BALANCE} | risque ${RISK_PCT_PER_TRADE}%/trade | cible +${effective.guardrails.targetPct}% | perte quotidienne max ${effective.guardrails.dailyLossLimitPct}% | drawdown max ${effective.guardrails.maxDrawdownPct}% (${effective.guardrails.maxDrawdownType}) | maxTradesPerDay=${effective.guardrails.maxTradesPerDay} | cooldown ${effective.guardrails.cooldownMinutesAfterLoss}min\n`);

  const passes = cycles.filter((c) => c.outcome.startsWith('RÉUSSI'));
  const busts = cycles.filter((c) => c.outcome.startsWith('RATÉ'));
  const inProgress = cycles.filter((c) => c.outcome.startsWith('en cours'));

  console.log(`**${passes.length} challenge(s) réussi(s)** sur ces 7 mois de 2026 | ${busts.length} raté(s) | ${inProgress.length} en cours en fin de fenêtre`);
  console.log(`Signaux bloqués par un garde-fou (jamais ouverts) : ${vetoedByGuardrail}\n`);

  console.log('| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |');
  console.log('|---|---|---|---|---|---|---|');
  for (const c of cycles) {
    const days = Math.round((c.endTime - c.startTime) / (24 * 60 * 60 * 1000));
    console.log(`| ${c.n} | ${fmtDate(c.startTime)} | ${fmtDate(c.endTime)} | ${days} | ${c.trades.length} | ${c.outcome} | $${c.balance.toFixed(2)} |`);
  }

  for (const c of busts) {
    console.log(`\n--- Post-mortem cycle ${c.n} (${fmtDate(c.startTime)} -> ${fmtDate(c.endTime)}, ${c.trades.length} trades) ---`);
    const bySource = new Map();
    for (const t of c.trades) {
      if (!bySource.has(t.source)) bySource.set(t.source, []);
      bySource.get(t.source).push(t);
    }
    console.log('| Mécanisme | Symbole(s) | Trades | Gagnants | PnL |');
    console.log('|---|---|---|---|---|');
    for (const [source, list] of [...bySource.entries()].sort((a, b) => a[1].reduce((s, t) => s + t.pnl, 0) - b[1].reduce((s, t) => s + t.pnl, 0))) {
      const syms = [...new Set(list.map((t) => t.symbol))].join(', ');
      const w = list.filter((t) => t.pnl > 0).length;
      const pnl = list.reduce((s, t) => s + t.pnl, 0);
      console.log(`| ${source} | ${syms} | ${list.length} | ${w} | ${fmtMoney(pnl)} |`);
    }
  }
}

main();
