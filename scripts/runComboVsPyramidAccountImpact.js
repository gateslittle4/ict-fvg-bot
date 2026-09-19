#!/usr/bin/env node
// runComboVsPyramidAccountImpact.js
// Usage: node scripts/runComboVsPyramidAccountImpact.js
//
// Esdras: "avec les 8 strategy live, verifie sur [...] leur performance
// globale dans un compte 10k vs la performance sans les derniers ajouts et
// pyramid enable" - then corrected the window to "les 7 mois passé plutot +
// la semaine derniere" (same real-data window as
// runFtmo1StepFullComboAccountImpact.js).
//
// Two scenarios, same data, same account rules, ONE deliberate difference:
//   - "8 mécanismes" (current production combo, pyramid OFF - today's
//     actual default/deployed state): FVG, Divergence, NWOG, Judas Swing,
//     Weekly Sweep, Breaker Block, Silver Bullet, CBDR.
//   - "sans CBDR + pyramid" (the 7 mechanisms that existed BEFORE CBDR - the
//     most recent addition, wired 2026-09-18 - see HANDOFF.md - swapped for
//     the pyramid add-on, PYRAMID_ENABLED=true equivalent).
//
// Both runs use the SAME real GuardrailEngine (FTMO 1-Step Challenge rules,
// via accountRegistry.buildEffectiveConfig - see
// runFtmo1StepFullComboAccountImpact.js's own header for why this beats
// hand-copying values) but with targetPct DISABLED for both (this is a
// straight performance comparison over a fixed window, not a "did it pass"
// check - a target-reached stop would truncate one run differently from the
// other depending on which happens to hit +10% first, making the comparison
// unfair). Daily loss (3%) and max drawdown (10%, trailing end-of-day) stay
// fully active and reported.
//
// Pyramid is NOT resolvable via LiveStrategyEngine.warmUp() alone - once a
// pyramid add-on is requested, the engine's own comments say it becomes "an
// ordinary broker-managed bracket position" that "this engine has nothing
// left to track for it" (real resolution happens via broker execution
// events in production, outside this class entirely). This script instead:
// simulates an immediate fill at the computed entryPrice (no slippage/
// rejection modeling, consistent with how every other mechanism's entry is
// already treated in this project's backtests), immediately calls
// engine.markPyramidOrderFilled() to free the per-symbol pyramid slot back
// up (otherwise _maybeRequestPyramid's own "already requested" guard would
// silently allow only ONE pyramid trade per symbol for the entire run), and
// resolves the outcome itself by scanning forward through that symbol's own
// candle array (stop/target/480-candle timeout) - the same simple
// resolution loop every backtest module in this project already uses.
//
// Data: same merged, deduped real cTrader window as
// runFtmo1StepFullComboAccountImpact.js - data/real-data-2026-02-to-09/
// (2026-02-13 -> 2026-09-16) + data/real-data-2026-09-17/ (2026-07-02 ->
// 2026-09-17, most recent) -> 2026-02-10 -> 2026-09-17 continuous.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = 0.5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PYRAMID_MAX_HOLDING_CANDLES = 480; // project-wide default every mechanism uses (see liveStrategyEngine.js's ADOPTED_POSITION_MAX_HOLDING_M15_CANDLES comment)

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}
function fmtMoney(n) { return '$' + n.toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

/** Scans forward from `fromIndex+1` in `candles` for stop/target/timeout. */
function resolveForward(candles, fromIndex, { direction, stopPrice, targetPrice }) {
  const bullish = direction === 'bullish';
  for (let i = fromIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const hitStop = bullish ? c.low <= stopPrice : c.high >= stopPrice;
    const hitTarget = bullish ? c.high >= targetPrice : c.low <= targetPrice;
    const timedOut = i - fromIndex >= PYRAMID_MAX_HOLDING_CANDLES;
    if (hitStop || hitTarget || timedOut) {
      const outcome = hitStop ? 'loss' : hitTarget ? 'win' : 'timeout';
      const exitPrice = hitStop ? stopPrice : hitTarget ? targetPrice : c.close;
      return { outcome, exitPrice, exitTime: c.time };
    }
  }
  return null; // never resolved within available data - dropped, same "insufficient data" convention as everywhere else
}

function runScenario({ label, candlesBySymbol, timeIndexBySymbol, symbols, effective, includeCbdr, includePyramid, globalStart, globalEnd }) {
  const guardrail = new GuardrailEngine({ ...effective.guardrails, targetPct: null });
  guardrail.setBalance(STARTING_BALANCE, globalStart);

  const pyramidConfig = includePyramid ? { ...effective.pyramid, enabled: true } : null;

  const engine = new LiveStrategyEngine({
    symbols,
    fvgConfig: effective.fvg.perSymbol,
    divergenceConfig: effective.divergence,
    nwogConfig: effective.nwog,
    judasSwingConfig: effective.judasSwing,
    weeklySweepConfig: effective.weeklySweep,
    breakerBlockConfig: effective.breakerBlock,
    silverBulletConfig: effective.silverBullet,
    cbdrConfig: includeCbdr ? effective.cbdr : null,
    pyramidConfig,
    guardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });
  engine.setBalance(STARTING_BALANCE);

  let balance = STARTING_BALANCE;
  const pendingOpen = new Map();
  const trades = [];
  let firstDrawdownBreach = null;
  const dailyLossDays = new Set();

  function settle(symbol, source, direction, entryPrice, distance, riskAmount, entryTime, outcome, exitPrice, exitTime) {
    const bullish = direction === 'bullish';
    const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
    const grossRMultiple = signedMove / distance;
    const spread = DEFAULT_SPREADS[symbol] ?? 0;
    const costR = spread > 0 ? spread / distance : 0;
    const netRMultiple = grossRMultiple - costR;
    const pnl = riskAmount * netRMultiple;

    balance += pnl;
    engine.setBalance(balance);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance, symbol });

    trades.push({ symbol, source, direction, entryTime, exitTime, outcome, netRMultiple, pnl, balanceAfter: balance });

    const status = guardrail.getStatus(exitTime, symbol);
    if (status.overallDrawdownBreached && !firstDrawdownBreach) {
      firstDrawdownBreach = { time: exitTime, balance, floor: status.overallDrawdownFloor };
    }
    if (status.blockReasons.includes('daily_loss_limit_reached')) dailyLossDays.add(status.dayKey);
  }

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
      if (signal.type === 'closed') {
        const open = pendingOpen.get(signal.symbol);
        pendingOpen.delete(signal.symbol);
        if (!open) return;
        let exitPrice;
        if (signal.outcome === 'win') exitPrice = open.targetPrice;
        else if (signal.outcome === 'loss') exitPrice = open.stopPrice;
        else exitPrice = candle.close;
        settle(signal.symbol, open.source, open.direction, open.entryPrice, open.distance, open.riskAmount, open.entryTime, signal.outcome, exitPrice, signal.exitTime);
        return;
      }
      if (signal.type === 'pyramid-order-requested') {
        // Simulated immediate fill (see header) - free the per-symbol slot
        // right away so a later +1R move can request again.
        engine.markPyramidOrderFilled(signal.symbol);
        const fromIndex = timeIndexBySymbol[signal.symbol].get(candle.time);
        const resolved = resolveForward(candlesBySymbol[signal.symbol], fromIndex, {
          direction: signal.direction, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
        });
        if (!resolved) return; // ran off the end of available data - dropped
        settle(signal.symbol, 'pyramid', signal.direction, signal.entryPrice, signal.distance, signal.riskAmount, candle.time, resolved.outcome, resolved.exitPrice, resolved.exitTime);
      }
    },
  });

  return { label, trades, finalBalance: balance, firstDrawdownBreach, dailyLossDays, finalStatus: guardrail.getStatus(globalEnd) };
}

function summarize(md, run, weekCutoff) {
  const totalPnl = run.finalBalance - STARTING_BALANCE;
  const totalPct = (totalPnl / STARTING_BALANCE) * 100;
  const wins = run.trades.filter((t) => t.pnl > 0).length;
  const losses = run.trades.filter((t) => t.pnl <= 0).length;

  md.push(`## ${run.label}`);
  md.push('');
  md.push(`- **${run.trades.length} trades** (${wins} gagnants, ${losses} perdants, WR ${run.trades.length ? ((wins / run.trades.length) * 100).toFixed(1) : '—'}%)`);
  md.push(`- Solde final : ${fmtMoney(run.finalBalance)} (${fmtPct(totalPct)})`);
  md.push(
    run.firstDrawdownBreach
      ? `- ❌ **Drawdown max 10% franchi** le ${new Date(run.firstDrawdownBreach.time).toISOString()} (solde ${fmtMoney(run.firstDrawdownBreach.balance)} <= plancher ${fmtMoney(run.firstDrawdownBreach.floor)})`
      : `- ✅ Drawdown max 10% jamais franchi`
  );
  md.push(
    run.dailyLossDays.size > 0
      ? `- ⚠️ Perte quotidienne 3% atteinte ${run.dailyLossDays.size} jour(s) : ${[...run.dailyLossDays].sort().join(', ')}`
      : `- ✅ Perte quotidienne max 3% jamais atteinte`
  );
  md.push('');
  md.push('| Mécanisme | Trades | Gagnants | R net moyen | PnL total |');
  md.push('|---|---|---|---|---|');
  const bySource = new Map();
  for (const t of run.trades) {
    if (!bySource.has(t.source)) bySource.set(t.source, { n: 0, wins: 0, rSum: 0, pnl: 0 });
    const s = bySource.get(t.source);
    s.n++; if (t.pnl > 0) s.wins++; s.rSum += t.netRMultiple; s.pnl += t.pnl;
  }
  for (const [source, s] of [...bySource.entries()].sort((a, b) => b[1].n - a[1].n)) {
    md.push(`| ${source} | ${s.n} | ${s.wins} | ${(s.rSum / s.n).toFixed(2)}R | ${fmtMoney(s.pnl)} |`);
  }
  md.push('');

  const weekTrades = run.trades.filter((t) => t.entryTime >= weekCutoff);
  const weekPnl = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
  const weekWins = weekTrades.filter((t) => t.pnl > 0).length;
  md.push(`**Semaine dernière** (${new Date(weekCutoff).toISOString().slice(0, 10)} → fin) : ${weekTrades.length} trade(s), ${weekWins} gagnant(s), PnL ${fmtMoney(weekPnl)}.`);
  if (weekTrades.length > 0) {
    md.push('');
    md.push('| Date entrée | Symbole | Mécanisme | Direction | Issue | R net | PnL |');
    md.push('|---|---|---|---|---|---|---|');
    for (const t of weekTrades) {
      md.push(`| ${new Date(t.entryTime).toISOString().slice(0, 16).replace('T', ' ')} | ${t.symbol} | ${t.source} | ${t.direction} | ${t.outcome} | ${t.netRMultiple.toFixed(2)}R | ${fmtMoney(t.pnl)} |`);
    }
  }
  md.push('');
}

function main() {
  const symbols = CONFIG.symbols;
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];

  const candlesBySymbol = {};
  const timeIndexBySymbol = {};
  for (const symbol of symbols) {
    const { candles: a } = loadCandlesFromCsv(path.join(DIR_A, `${symbol}.csv`));
    const { candles: b } = loadCandlesFromCsv(path.join(DIR_B, `${symbol}.csv`));
    const merged = toEngineTime(mergeCandles(a, b));
    candlesBySymbol[symbol] = merged;
    timeIndexBySymbol[symbol] = new Map(merged.map((c, i) => [c.time, i]));
  }
  // reorder object keys to match the Divergence warm-up fix
  const orderedCandlesBySymbol = {};
  for (const s of orderedSymbols) orderedCandlesBySymbol[s] = candlesBySymbol[s];

  const globalStart = Math.min(...symbols.map((s) => candlesBySymbol[s][0].time));
  const globalEnd = Math.max(...symbols.map((s) => candlesBySymbol[s][candlesBySymbol[s].length - 1].time));
  const weekCutoff = globalEnd - WEEK_MS;

  const effective = buildEffectiveConfig({
    id: 'combo-vs-pyramid-verification',
    propFirmProgramId: 'ftmo-1step',
    phaseIndex: 0,
    guardrails: CONFIG.guardrails,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
  });

  const runA = runScenario({
    label: 'A — 8 mécanismes actuels (avec CBDR), pyramidage OFF (état de production actuel)',
    candlesBySymbol: orderedCandlesBySymbol, timeIndexBySymbol, symbols: orderedSymbols, effective,
    includeCbdr: true, includePyramid: false, globalStart, globalEnd,
  });
  const runB = runScenario({
    label: 'B — 7 mécanismes sans CBDR (le dernier ajouté), pyramidage ON',
    candlesBySymbol: orderedCandlesBySymbol, timeIndexBySymbol, symbols: orderedSymbols, effective,
    includeCbdr: false, includePyramid: true, globalStart, globalEnd,
  });

  const md = [];
  md.push('# Comparaison : 8 mécanismes actuels vs 7 mécanismes (sans CBDR) + pyramidage — 7 mois + semaine dernière');
  md.push('');
  md.push(
    `Question d'Esdras : "les 8 strategy live... performance globale dans un compte 10k vs la performance sans les ` +
      `derniers ajouts et pyramid enable", sur les 7 derniers mois + la semaine dernière. Même méthode que la ` +
      `simulation FTMO précédente (\`LiveStrategyEngine.warmUp()\`, config/garde-fous réels via ` +
      `\`accountRegistry.buildEffectiveConfig\`), mêmes données réelles fusionnées ` +
      `(\`data/real-data-2026-02-to-09/\` + \`data/real-data-2026-09-17/\`, dédupliquées) — ` +
      `**${new Date(globalStart).toISOString().slice(0, 10)} → ${new Date(globalEnd).toISOString().slice(0, 10)}**. ` +
      `Solde de départ ${fmtMoney(STARTING_BALANCE)}, risque ${RISK_PCT_PER_TRADE}%/trade. Cible FTMO +10% ` +
      `désactivée dans les DEUX passages (comparaison de performance pure sur fenêtre fixe, pas un test "passe/rate" ` +
      `— sinon celui qui atteint +10% en premier s'arrêterait artificiellement plus tôt que l'autre). Perte ` +
      `quotidienne 3% et drawdown max 10% (trailing fin de journée) restent actifs et rapportés.`
  );
  md.push('');
  md.push(
    '⚠ Le pyramidage n\'est pas résolu par `LiveStrategyEngine` lui-même (une fois la demande envoyée, le moteur ' +
      '"n\'a plus rien à suivre" - la résolution réelle passe par les événements du broker en production, hors de ' +
      'cette classe). Simulé ici : remplissage immédiat au prix calculé (pas de glissement/rejet modélisé, comme ' +
      'pour toutes les autres entrées de ce projet), résolution par scan des bougies suivantes (stop/cible/timeout ' +
      '480 bougies, même convention que tous les autres modules de backtest).'
  );
  md.push('');

  summarize(md, runA, weekCutoff);
  summarize(md, runB, weekCutoff);

  const diffPct = ((runB.finalBalance - runA.finalBalance) / STARTING_BALANCE) * 100;
  md.push('## Écart');
  md.push('');
  md.push(`B − A : ${fmtMoney(runB.finalBalance - runA.finalBalance)} (${fmtPct(diffPct)} du solde de départ), ${runB.trades.length - runA.trades.length} trade(s) de différence.`);

  const outMd = path.join(DIR_A, 'combo-vs-pyramid-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`[A] trades=${runA.trades.length} final=${fmtMoney(runA.finalBalance)}`);
  console.error(`[B] trades=${runB.trades.length} final=${fmtMoney(runB.finalBalance)}`);
}

main();
