#!/usr/bin/env node
// runMaxTradesPerDayRealismCheck.js
// Usage: node scripts/runMaxTradesPerDayRealismCheck.js [startISO] [endISO]
//
// Esdras (2026-09-21, après un weekend qui a vu 3 signaux propres tomber en
// moins de 2h30 - NWOG US100+GER40 dimanche 22:15 UTC, Weekly Sweep US500
// lundi 00:15 UTC) : "donc une quantite pareil de trade deja ouvert, le max
// 3 trades par jour nest pas realiste?" - vérifie empiriquement, sur le
// combo réel (importé de src/config.js) et le VRAI GuardrailEngine
// (CONFIG.guardrails), à quelle fréquence maxTradesPerDay=3 bloque
// réellement un signal qui aurait sinon été pris, plutôt que de juger sur
// un seul weekend.
//
// Même méthode 2 passes que runFtmo1Step2025FullComboCycle.js (voir son
// en-tête pour le détail) : Phase 1 = un seul warmUp() sur 2010-2025 (les
// 8 mécanismes live réels, guardrail permissif pour ne biaiser que le
// netting naturel, pas les limites) -> liste chronologique de trades avec
// entryTime/exitTime/outcome. Phase 2 = rejeu chronologique de la fenêtre
// demandée à travers UN SEUL GuardrailEngine réel et persistant (comme en
// production - pas un cycle qui se réinitialise), classifiant CHAQUE veto
// par sa raison réelle (getStatus() juste avant le rejet).

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = 'data/backtest-input';
const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade;

function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}

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

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

function main() {
  const startArg = process.argv[2] || '2024-01-01T00:00:00Z';
  const endArg = process.argv[3] || '2026-01-01T00:00:00Z';
  const startMs = Date.parse(startArg);
  const endMs = Date.parse(endArg);

  console.log('Phase 1 : warmUp() sur 2010-2025 (contexte), les 8 mécanismes live réels...');
  const allTrades = runPhase1();
  const trades = allTrades.filter((t) => t.entryTime >= startMs && t.entryTime < endMs);
  console.log(`Trades avec entrée dans la fenêtre : ${trades.length}\n`);

  console.log(`Phase 2 : rejeu à travers UN SEUL GuardrailEngine réel et persistant (maxTradesPerDay=${CONFIG.guardrails.maxTradesPerDay}, cooldown=${CONFIG.guardrails.cooldownMinutesAfterLoss}min, dailyLossLimitPct=${CONFIG.guardrails.dailyLossLimitPct}%)...\n`);

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
  guardrail.setBalance(STARTING_BALANCE, trades.length > 0 ? trades[0].entryTime : startMs);
  let balance = STARTING_BALANCE;

  const vetoReasonCounts = {};
  const vetoedTrades = [];
  let accepted = 0;

  for (const t of trades) {
    if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) {
      const status = guardrail.getStatus(t.entryTime, t.symbol);
      for (const reason of status.blockReasons) {
        vetoReasonCounts[reason] = (vetoReasonCounts[reason] || 0) + 1;
      }
      vetoedTrades.push({ ...t, reasons: status.blockReasons });
      continue;
    }
    accepted++;
    const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * t.netRMultiple;
    balance += pnl;
    guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
  }

  console.log(`Trades pris : ${accepted} / ${trades.length} (${((accepted / trades.length) * 100).toFixed(1)}%)`);
  console.log(`Trades vétoés (au moins une raison) : ${vetoedTrades.length} (${((vetoedTrades.length / trades.length) * 100).toFixed(1)}%)\n`);
  console.log('Répartition des raisons de veto (un trade vétoé peut cumuler plusieurs raisons) :');
  for (const [reason, count] of Object.entries(vetoReasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(28)} ${count} (${((count / trades.length) * 100).toFixed(1)}% de tous les trades candidats)`);
  }

  const maxTradesOnly = vetoedTrades.filter((t) => t.reasons.length === 1 && t.reasons[0] === 'max_trades_reached');
  console.log(`\nVétoés PAR max_trades_reached SEUL (aucune autre raison en jeu) : ${maxTradesOnly.length} (${((maxTradesOnly.length / trades.length) * 100).toFixed(1)}% de tous les trades candidats)`);

  // Days where max_trades_reached fired at least once, purely on its own.
  const daysHit = new Set(maxTradesOnly.map((t) => new Date(t.entryTime).toISOString().slice(0, 10)));
  const daysActive = new Set(trades.map((t) => new Date(t.entryTime).toISOString().slice(0, 10)));
  console.log(`Jours où max_trades_reached (seul) a coûté au moins 1 trade : ${daysHit.size} / ${daysActive.size} jours actifs (${((daysHit.size / daysActive.size) * 100).toFixed(1)}%)`);

  if (maxTradesOnly.length > 0) {
    console.log('\nExemples (jusqu\'à 10) :');
    for (const t of maxTradesOnly.slice(0, 10)) {
      console.log(`  ${new Date(t.entryTime).toISOString()} ${t.source}/${t.symbol} netR=${t.netRMultiple.toFixed(2)}`);
    }
  }
}

main();
