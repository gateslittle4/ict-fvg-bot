#!/usr/bin/env node
// runFtmo1Step2025FullComboCycle.js
// Usage: node scripts/runFtmo1Step2025FullComboCycle.js
//
// Esdras: "avant le combo code avec les gardefous, les contraintes dis moi
// comment le systeme aurait performe pour l'annee 2025 avec un compte 10k
// ftmo... fais le avec le cycle 10% pour voir combien de fois j'aurais
// passe le challenge avec toutes les contraintes de ftmo 1 step challenge."
//
// Uses the REAL production LiveStrategyEngine (built straight from CONFIG -
// same object accountRuntime.js instantiates) with ALL 8 currently-live
// mechanisms (FVG, Divergence, NWOG, Judas Swing, Weekly Sweep, Breaker
// Block, Silver Bullet, CBDR - CBDR is new since the last full-combo cycle
// scripts in this project, none of which include it), replayed on the full
// 2010-2025 historical CSVs (data/backtest-input/) for real multi-year
// warm-up context (H4/EMA200 bias, structure, CBDR's own 15-year depth
// requirement - see HANDOFF.md), then isolates 2025 for the actual FTMO
// 1-Step cycle simulation.
//
// Two-phase design (same method as the HaitiForex scripts this session -
// see those for the fuller rationale):
//   Phase 1: engine.warmUp() ONCE over 2010-2025 (the O(n) precomputed
//   path), with a fully permissive guardrail (never blocks) so signal
//   generation/netting through the pre-2025 years isn't distorted by
//   guardrail limits that don't matter for warm-up purposes. Produces the
//   engine's own natural trade list (entry/exit time, net R-multiple after
//   spread cost) for the WHOLE window - filtered to 2025 entries only
//   right after.
//   Phase 2: replay the 2025-only trade list, in true chronological order,
//   against REAL FTMO 1-Step cycles: a fresh $10,000 GuardrailEngine each
//   cycle, built via accountRegistry.buildEffectiveConfig({propFirmProgramId:
//   'ftmo-1step'}) - the EXACT real merge of CONFIG.guardrails (maxTradesPerDay
//   3, cooldown 30min after a loss) with FTMO's own real rules
//   (src/propFirms/ftmo.js: target +10%, daily loss 3%, max drawdown 10%
//   trailing end-of-day) - not hand-copied numbers. Before taking each
//   trade, guardrail.canTakeNewTrade(entryTime, symbol) is checked (the
//   REAL gate function, not a reimplementation) - a blocked trade is
//   vetoed (skipped entirely, no P&L), exactly matching what the live bot
//   itself would refuse to open. guardrail.recordTrade() is called after
//   every taken trade, same as production. The cycle ends (pass or bust)
//   the moment getStatus() reports profit_target_reached or
//   overall_drawdown_breached - a fresh cycle starts immediately after
//   with the remaining 2025 trades.
//
// KNOWN LIMITATION, stated up front: like every other full-combo script in
// this project, warmUp() processes each symbol's FULL history sequentially
// (not interleaved by real wall-clock time) - trade PnL is accurate
// per-trade (risk% x net R-multiple), but the exact $ a trade is sized at
// can differ slightly from a true minute-by-minute replay, since balance
// compounds in symbol-processing order within Phase 1. This does NOT
// affect Phase 2's cycle math (which recomputes P&L fresh, in true
// chronological order, off each cycle's own real compounding balance) -
// only the (unused here) Phase-1-native balance would have this caveat.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = 'data/backtest-input';
const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade; // 0.5% - 'challenge' mode default, the validated real-attempt value
const YEAR_START = Date.parse('2025-01-01T00:00:00Z');
const YEAR_END = Date.parse('2026-01-01T00:00:00Z');

function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}

function fmtMoney(n) { return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

// --- Phase 1: one warmUp() replay over the full historical window, all 8 live mechanisms
function runPhase1() {
  const symbols = CONFIG.symbols;
  const candlesBySymbol = {};
  for (const symbol of symbols) {
    const { candles } = loadCandlesFromCsv(path.join(DATA_DIR, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles; // already in engine-time convention - no shift needed (see header)
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

// --- Phase 2: replay 2025 trades through real FTMO 1-Step cycles
function runPhase2(trades2025) {
  const effective = buildEffectiveConfig({
    id: 'ftmo-1step-2025-cycle-sim',
    propFirmProgramId: 'ftmo-1step',
    phaseIndex: 0,
    guardrails: CONFIG.guardrails,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
  });

  const cycles = [];
  let cycle = null;
  let vetoedByGuardrail = 0;

  function startCycle(startTime) {
    const guardrail = new GuardrailEngine({ ...effective.guardrails });
    guardrail.setBalance(STARTING_BALANCE, startTime);
    cycle = { n: cycles.length + 1, startTime, endTime: null, outcome: 'en cours', trades: [], balance: STARTING_BALANCE, guardrail };
  }

  startCycle(trades2025.length > 0 ? trades2025[0].entryTime : YEAR_START);

  for (const t of trades2025) {
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
    cycle.endTime = trades2025.length > 0 ? trades2025[trades2025.length - 1].exitTime : YEAR_END;
    cycle.outcome = `en cours (${fmtPct(((cycle.balance - STARTING_BALANCE) / STARTING_BALANCE) * 100)})`;
    cycles.push(cycle);
  }

  return { cycles, vetoedByGuardrail, effective };
}

function main() {
  console.log('Phase 1 : warmUp() sur 2010-2025 (15 ans de contexte), les 8 mécanismes live réels...');
  const trades2025 = runPhase1();
  console.log(`Trades avec entrée en 2025 : ${trades2025.length}\n`);

  console.log('Phase 2 : simulation des cycles FTMO 1-Step réels (buildEffectiveConfig, GuardrailEngine réel)...\n');
  const { cycles, vetoedByGuardrail, effective } = runPhase2(trades2025);

  console.log(`Compte $${STARTING_BALANCE} | risque ${RISK_PCT_PER_TRADE}%/trade | cible +${effective.guardrails.targetPct}% | perte quotidienne max ${effective.guardrails.dailyLossLimitPct}% | drawdown max ${effective.guardrails.maxDrawdownPct}% (${effective.guardrails.maxDrawdownType}) | maxTradesPerDay=${effective.guardrails.maxTradesPerDay} | cooldown ${effective.guardrails.cooldownMinutesAfterLoss}min\n`);

  const passes = cycles.filter((c) => c.outcome.startsWith('RÉUSSI'));
  const busts = cycles.filter((c) => c.outcome.startsWith('RATÉ'));
  const inProgress = cycles.filter((c) => c.outcome.startsWith('en cours'));

  console.log(`**${passes.length} challenge(s) réussi(s)** sur 2025 | ${busts.length} raté(s) | ${inProgress.length} en cours en fin d'année`);
  console.log(`Signaux bloqués par un garde-fou (jamais ouverts) : ${vetoedByGuardrail}\n`);

  console.log('| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |');
  console.log('|---|---|---|---|---|---|---|');
  for (const c of cycles) {
    const days = Math.round((c.endTime - c.startTime) / (24 * 60 * 60 * 1000));
    console.log(`| ${c.n} | ${fmtDate(c.startTime)} | ${fmtDate(c.endTime)} | ${days} | ${c.trades.length} | ${c.outcome} | $${c.balance.toFixed(2)} |`);
  }

  console.log('\nDétail des trades du premier cycle (exemple) :');
  console.log('| Date entrée | Symbole | Mécanisme | Sens | PnL | Solde après |');
  console.log('|---|---|---|---|---|---|');
  for (const t of cycles[0].trades) {
    console.log(`| ${fmtDate(t.entryTime)} | ${t.symbol} | ${t.source} | ${t.direction} | ${fmtMoney(t.pnl)} | $${t.balanceAfter.toFixed(2)} |`);
  }
}

main();
