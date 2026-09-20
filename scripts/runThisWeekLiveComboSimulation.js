#!/usr/bin/env node
// runThisWeekLiveComboSimulation.js
// Usage: node scripts/runThisWeekLiveComboSimulation.js <candlesDir>
//
// Esdras: "donne moi la semaine cette semaine uniquement, avec tous les
// strategy du combo code avec tous les gardefours comme si il tradais de
// facon reel, donc tout ce qui est vraiment code dans le bot avec un
// compte de 10k. Commence du lundi a ce vendredi." Follow-up to
// runThisWeekComboPerformance.js (2026-09-19), whose repo-bundled data
// only reached 2026-09-17 - this one uses FRESH candles pulled live from
// the real broker via /admin/export-candles (ADMIN_EXPORT_TOKEN provided
// directly by Esdras this session), covering through Friday evening.
//
// Exactly the real production combo, nothing hand-picked: ALL 8 currently
// live mechanisms (FVG, Divergence, NWOG, Judas Swing, Weekly Sweep,
// Breaker Block, Silver Bullet, CBDR - straight from CONFIG, same object
// accountRuntime.js builds) AND the real guardrails (CONFIG.guardrails -
// maxTradesPerDay/cooldownMinutesAfterLoss/dailyLossLimitPct exactly as
// deployed, no propFirmProgramId override since the live account
// currently has none assigned - see accountRegistry.js). Every
// blockedReason the guardrail actually issues (netting, cooldown,
// max_trades_per_day, daily_loss_limit_reached) is respected - a blocked
// signal never opens a position, same as live.
//
// Data: candlesDir (argv[2]) must contain <SYMBOL>.csv files in the SAME
// raw shape /admin/export-candles returns (time,open,high,low,close,
// genuine broker UTC) - NOT this repo's historical CSVs (fixed-EST
// convention). Defaults to the scratchpad dir this session already
// populated via curl. 90 days pulled (not just the target week) so H4
// EMA200/structure bias has real context to warm up on before Monday,
// exactly like every other real-data forward-test script in this project.
//
// Window: Monday 2026-09-14 00:00 -> Saturday 2026-09-19 00:00, in REAL
// UTC (Esdras said "du lundi a ce vendredi" - NY-local Monday/Friday
// boundaries would shift by a few hours depending on DST; UTC calendar
// days is the simpler, stated convention here, close enough that it
// doesn't change which trading days are included).

import fs from 'node:fs';
import path from 'node:path';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const CANDLES_DIR = process.argv[2] || '/tmp/claude-0/-home-user-ict-fvg-bot/cb3d1f02-6656-5a7b-9569-21842547ce54/scratchpad/thisweek';
const STARTING_BALANCE = 10000;
const WEEK_START_UTC = Date.parse('2026-09-14T00:00:00Z');
const WEEK_END_UTC = Date.parse('2026-09-19T00:00:00Z'); // exclusive - through end of Friday

function loadRawCsv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').slice(1);
  return lines.map((line) => {
    const [time, open, high, low, close] = line.split(',');
    return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}
function toEngineTime(candles) {
  // These are genuine broker UTC (from /admin/export-candles, same
  // convention as every other cTrader real-data export in this project) -
  // same conversion as runFtmo1StepFullComboAccountImpact.js's toEngineTime().
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}
function fmtMoney(n) { return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

function main() {
  const symbols = CONFIG.symbols;
  const candlesBySymbolRaw = {};
  for (const symbol of symbols) {
    candlesBySymbolRaw[symbol] = toEngineTime(loadRawCsv(path.join(CANDLES_DIR, `${symbol}.csv`)));
  }
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const candlesBySymbol = {};
  for (const s of orderedSymbols) candlesBySymbol[s] = candlesBySymbolRaw[s];

  // Engine time = real UTC - 5h, so the window bounds need the same shift.
  const engineWeekStart = WEEK_START_UTC - FIXED_EST_TO_UTC_OFFSET_MS;
  const engineWeekEnd = WEEK_END_UTC - FIXED_EST_TO_UTC_OFFSET_MS;

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails }); // real deployed guardrails, no prop-firm overlay - none assigned today
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
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
  });

  let balance = STARTING_BALANCE;
  const pendingOpen = new Map();
  const allTrades = [];
  const blockedInWeek = [];

  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated') {
        if (signal.blockedReason) {
          if (candle.time >= engineWeekStart && candle.time < engineWeekEnd) {
            blockedInWeek.push({ symbol: signal.symbol, source: signal.source, reason: signal.blockedReason, time: candle.time });
          }
          return;
        }
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

      allTrades.push({ symbol: signal.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime, exitTime: signal.exitTime, outcome: signal.outcome, netR, pnl });
    },
  });

  const weekTrades = allTrades.filter((t) => t.entryTime >= engineWeekStart && t.entryTime < engineWeekEnd).sort((a, b) => a.entryTime - b.entryTime);

  console.log(`Fenêtre : lundi 2026-09-14 00:00 UTC -> vendredi 2026-09-18 23:59 UTC (réel)`);
  console.log(`Combo réel : les 8 mécanismes actuellement live (FVG, Divergence, NWOG, Judas Swing, Weekly Sweep, Breaker Block, Silver Bullet, CBDR)`);
  console.log(`Garde-fous réels : maxTradesPerDay=${CONFIG.guardrails.maxTradesPerDay}, cooldownMinutesAfterLoss=${CONFIG.guardrails.cooldownMinutesAfterLoss}, dailyLossLimitPct=${CONFIG.guardrails.dailyLossLimitPct}%`);
  console.log(`Compte de départ : $${STARTING_BALANCE}, risque ${CONFIG.risk.riskPctPerTrade}%/trade\n`);

  console.log(`${weekTrades.length} trades pris (après garde-fous) | ${blockedInWeek.length} signaux bloqués par un garde-fou cette semaine\n`);

  if (weekTrades.length === 0) {
    console.log('Aucun trade cette semaine.');
  } else {
    const wins = weekTrades.filter((t) => t.pnl > 0).length;
    const totalPnl = weekTrades.reduce((s, t) => s + t.pnl, 0);
    console.log(`${wins} gagnants / ${weekTrades.length - wins} perdants (WR ${((100 * wins) / weekTrades.length).toFixed(1)}%)`);
    console.log(`PnL semaine : ${fmtMoney(totalPnl)} (${fmtPct((100 * totalPnl) / STARTING_BALANCE)} du solde de départ) -> solde final $${(STARTING_BALANCE + totalPnl).toFixed(2)}\n`);

    // Daily breakdown (Esdras: "donne-le moi pour chaque jour, avec le %
    // ou l'argent gagné par jour, le nombre de trades aussi, avec tous les
    // garde-fous actuels"). Day key = real UTC calendar date, matching
    // GuardrailEngine's own dayBoundaryHourUTC=0 (midnight UTC) - the same
    // boundary the real guardrails actually use to reset
    // tradesToday/dailyLossPct. % is additive (day PnL / STARTING_BALANCE),
    // not compounded day-over-day - see the comment on weekTrades' sort
    // above: trade PnL amounts already reflect this engine's
    // symbol-sequential (not true-wall-clock) processing order, so a
    // compounded running balance would imply more precision than the
    // underlying numbers actually have. Each day's own $ total is accurate
    // regardless (a plain sum of that day's real trade PnLs).
    const nyDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    const byDay = new Map();
    for (const t of weekTrades) {
      const realUtc = t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS;
      const dayKey = nyDayFormatter.format(new Date(realUtc));
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(t);
    }
    // Every weekday shown even with zero trades - a quiet day is real
    // information (which garde-fou or which lack of signal caused it, see
    // the blocked-signals table further below), not something to omit.
    const allWeekdays = [];
    for (let d = WEEK_START_UTC; d < WEEK_END_UTC; d += 24 * 60 * 60 * 1000) allWeekdays.push(nyDayFormatter.format(new Date(d)));

    console.log('Performance journalière :');
    console.log('| Jour | Trades | Gagnants | PnL du jour | % du solde de départ |');
    console.log('|---|---|---|---|---|');
    for (const dayKey of allWeekdays) {
      const list = byDay.get(dayKey) || [];
      const w = list.filter((t) => t.pnl > 0).length;
      const pnl = list.reduce((s, t) => s + t.pnl, 0);
      console.log(`| ${dayKey} | ${list.length} | ${w} | ${fmtMoney(pnl)} | ${fmtPct((100 * pnl) / STARTING_BALANCE)} |`);
    }
    console.log();

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

    console.log('\nDétail par trade (ordre chronologique réel) :');
    console.log('| Date entrée (UTC réel) | Symbole | Mécanisme | Sens | Résultat | PnL |');
    console.log('|---|---|---|---|---|---|');
    for (const t of weekTrades) {
      const dateStr = new Date(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`| ${dateStr} | ${t.symbol} | ${t.source} | ${t.direction} | ${t.outcome} | ${fmtMoney(t.pnl)} |`);
    }
  }

  if (blockedInWeek.length > 0) {
    console.log('\nSignaux bloqués cette semaine (auraient été des trades SANS les garde-fous) :');
    console.log('| Date (UTC réel) | Symbole | Mécanisme | Raison du blocage |');
    console.log('|---|---|---|---|');
    for (const b of blockedInWeek.sort((a, c) => a.time - c.time)) {
      const dateStr = new Date(b.time + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`| ${dateStr} | ${b.symbol} | ${b.source} | ${b.reason} |`);
    }
  }
}

main();
