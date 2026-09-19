#!/usr/bin/env node
// runHaitiForexChallengeSimulation.js
// Usage: node scripts/runHaitiForexChallengeSimulation.js
//
// Esdras: "Fais le test avec toutes ces contraintes sur les 7 mois pour voir
// si j'atteins 10% avant la fin du mois." Follow-up to
// runHaitiForexSameDayComplianceAnalysis.js (2026-09-19), which found that
// FVG/Judas Swing/CBDR/Silver Bullet already resolve same-NY-day-before-16h
// 81-100% of the time, while Divergence/NWOG/Weekly Sweep/Breaker Block
// don't - only the first four are used here.
//
// Models HaitiForex's own rules as read directly off haitiforex.org
// (Open-Account.html/Practice.html, $100,000 tier, the one with the $2,200/
// day cap Esdras asked about): target +10%, max loss 5% of balance (bust),
// max daily GAIN $2,200 (no daily LOSS limit - "AUCUNE LIMITE DE PERTE
// QUOTIDIENNE"), min 5 trading days, max 30 days account duration, every
// position closed by 16:00 NY or the account is cancelled. riskPctPerTrade
// (0.5%) is NOT a HaitiForex rule - it's this project's own validated
// default, used because HaitiForex doesn't specify a risk-per-trade rule.
//
// Two-phase design, kept separate on purpose:
//   Phase 1: replay the REAL production LiveStrategyEngine ONCE via its own
//   warmUp() (the O(n) precomputed-candidates path - see that method's own
//   comment on why calling ingestCandle() per historical candle in a loop
//   is O(n^2) and must be avoided for a multi-month/multi-symbol replay),
//   with ONLY the 4 compliant mechanisms configured. Produces the engine's
//   OWN natural trade list (entry/exit time & price). Then, as a cheap
//   O(trades) POST-PROCESS (not a second engine pass), any trade that
//   didn't naturally resolve same-NY-day-before-15:55 gets its exit
//   replaced with the last retained candle (engine.getHistory(symbol) - a
//   full copy of every candle this run ingested) at/before 15:55 NY on the
//   entry's own NY calendar day - i.e. what a trader forced to flatten by
//   hand every day at 15:55 would actually have realized. A trade whose
//   ENTRY itself already lands at/after 15:55 NY (mainly possible for CBDR,
//   whose entry window runs 14:00-20:00 NY) is vetoed outright - opening a
//   position already too late to legally hold is not something a real
//   trader following this rule would do.
//   Phase 2: replay that SAME (now rule-compliant) trade list into several
//   independent 30-calendar-day "challenge attempt" windows (a fresh $100k
//   account each, as if Esdras bought a new challenge every ~30 days across
//   the 7 months), applying THIS window's own compounding balance, its own
//   daily gain-cap tracker, and its own bust/target checks. This is where
//   the daily cap actually matters: the same trade can be a keeper in one
//   window and get vetoed (skipped, zero P&L) in another, depending on that
//   window's own cumulative realized gain for that NY day.
//
// KNOWN APPROXIMATIONS, stated up front:
//   - The Phase 1 forced-close post-process does NOT re-open the netting
//     slot for a different signal that might have fired on that symbol
//     between the forced-close time and the natural exit time - the engine
//     already decided nothing else could open while it believed this
//     position was live. Conservative in one direction (a real trader
//     forced flat at 15:55 WOULD have been free to take a new signal that
//     afternoon) and simply not modeled here.
//   - The Phase 2 daily-gain-cap veto does not re-open netting either, same
//     caveat, for the same reason (Phase 1's trade list is fixed input).
//   - Unverified: whether HaitiForex's daily cap counts GROSS realized gain
//     only (this script's reading, the conservative one - a same-day loss
//     does NOT buy back cap room) or NET of same-day losses - their site
//     doesn't say either way.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS, toRealNyHourMinute } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';
const DAY_MS = 24 * 60 * 60 * 1000;

// --- HaitiForex $100,000 tier, read off haitiforex.org 2026-09-19 --------
const STARTING_BALANCE = 100000;
const TARGET_PCT = 10; // MAXIMUM $10000 GAIN
const BUST_PCT = 5; // MINIMUM PERDU=$5000 DANS LE CAPITAL
const DAILY_GAIN_CAP_USD = 2200; // MAXIMUM GAIN PAR JOUR $2200
const MIN_TRADING_DAYS = 5;
const MAX_WINDOW_DAYS = 30;
const FORCED_CLOSE_NY_HOUR = 15 + 55 / 60; // 15:55 - 5min safety margin before their 16:00 cutoff
// this project's own default (0.5) - NOT a HaitiForex rule. Overridable via
// argv for sensitivity testing (e.g. `node ... 0.25`) - see HANDOFF.md
// 2026-09-19 for why a SMALLER risk-per-trade was tested here: the daily
// $2,200 cap throws away entire trades once hit, so fewer $ per trade
// should let more trades fit under the same daily ceiling.
const RISK_PCT_PER_TRADE = process.argv[2] ? Number(process.argv[2]) : 0.5;

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}
function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}
const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
function toRealNyDateKey(engineTimeMs) {
  return nyDateFormatter.format(new Date(engineTimeMs + FIXED_EST_TO_UTC_OFFSET_MS));
}
function nyDecimalHour(engineTimeMs) {
  const { hour, minute } = toRealNyHourMinute(engineTimeMs);
  return hour + minute / 60;
}

function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossRMultiple = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossRMultiple - costR;
}

// --- Phase 1: one warmUp() replay, compliant mechanisms only, then a cheap forced-close post-process
function runPhase1() {
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

  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(STARTING_BALANCE, candlesBySymbolRaw[orderedSymbols[0]][0].time);

  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: null, // excluded - runHaitiForexSameDayComplianceAnalysis.js: 30.4% compliant, 20.5h median
    nwogConfig: null, // excluded - 0% compliant (resolves same-day but consistently AFTER 16h)
    judasSwingConfig: CONFIG.judasSwing, // 100% compliant
    weeklySweepConfig: null, // excluded - grey zone, 59.3% compliant
    breakerBlockConfig: null, // excluded - grey zone, 69.7% compliant
    silverBulletConfig: CONFIG.silverBullet, // 80.9% compliant
    cbdrConfig: CONFIG.cbdr, // 92.5% compliant
    guardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });

  const pendingOpen = new Map();
  const rawTrades = [];
  engine.warmUp(candlesBySymbol, {
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
      rawTrades.push({ symbol: signal.symbol, ...open, exitTime: signal.exitTime, exitPrice });
    },
  });

  // Cheap post-process: enforce the 15:55-NY-same-day rule using the
  // engine's own retained history (already in memory, no re-ingestion).
  const historyBySymbol = {};
  for (const s of orderedSymbols) historyBySymbol[s] = engine.getHistory(s);

  const trades = [];
  let vetoedLateEntry = 0;
  let forcedCount = 0;
  for (const t of rawTrades) {
    const entryHour = nyDecimalHour(t.entryTime);
    if (entryHour >= FORCED_CLOSE_NY_HOUR) {
      vetoedLateEntry++; // opening a position already too late to legally hold - not taken
      continue;
    }
    const entryDate = toRealNyDateKey(t.entryTime);
    const exitDate = toRealNyDateKey(t.exitTime);
    const exitHour = nyDecimalHour(t.exitTime);
    const compliant = entryDate === exitDate && exitHour <= FORCED_CLOSE_NY_HOUR;
    if (compliant) {
      const r = netRMultipleOf(t.direction, t.entryPrice, t.distance, t.exitPrice, t.symbol);
      trades.push({ symbol: t.symbol, source: t.source, entryTime: t.entryTime, exitTime: t.exitTime, netRMultiple: r, naturalNetRMultiple: r, forced: false });
      continue;
    }
    // Find the last candle for this symbol, on the entry's own NY date, at/before the cutoff.
    const hist = historyBySymbol[t.symbol];
    let forcedCandle = null;
    for (const c of hist) {
      if (c.time < t.entryTime) continue;
      if (toRealNyDateKey(c.time) !== entryDate) break; // history is time-sorted - once we leave entryDate we're done
      if (nyDecimalHour(c.time) > FORCED_CLOSE_NY_HOUR) break;
      forcedCandle = c;
    }
    if (!forcedCandle) { vetoedLateEntry++; continue; } // defensive - shouldn't happen given the entryHour guard above
    forcedCount++;
    const naturalR = netRMultipleOf(t.direction, t.entryPrice, t.distance, t.exitPrice, t.symbol); // what the engine's own stop/target/timeout would have realized - for reporting only, never used for P&L
    trades.push({
      symbol: t.symbol, source: t.source, entryTime: t.entryTime, exitTime: forcedCandle.time,
      netRMultiple: netRMultipleOf(t.direction, t.entryPrice, t.distance, forcedCandle.close, t.symbol),
      naturalNetRMultiple: naturalR, forced: true,
    });
  }

  trades.sort((a, b) => a.exitTime - b.exitTime);
  return { trades, vetoedLateEntry, forcedCount, rawCount: rawTrades.length };
}

// --- Phase 2: replay the canonical trade list into independent 30-day windows
function runPhase2(trades) {
  if (trades.length === 0) return [];
  const dataStart = Math.min(...trades.map((t) => t.entryTime));
  const dataEnd = Math.max(...trades.map((t) => t.exitTime));

  const windows = [];
  for (let start = dataStart; start < dataEnd; start += MAX_WINDOW_DAYS * DAY_MS) {
    windows.push({ start, end: start + MAX_WINDOW_DAYS * DAY_MS });
  }

  const results = [];
  for (const w of windows) {
    let balance = STARTING_BALANCE;
    const dailyGain = new Map();
    const tradingDays = new Set();
    let bustDay = null;
    let targetDay = null;
    let tradesTaken = 0;
    let tradesVetoed = 0;
    let calendarDaysElapsed = 0;
    let missedUsdFromCap = 0; // what vetoed trades WOULD have earned, at that day's balance - diagnostic only
    let lostUsdFromForcedClose = 0; // (natural R - forced R) * riskAmount, summed - diagnostic only

    for (const t of trades) {
      if (t.entryTime < w.start || t.entryTime >= w.end) continue;
      if (bustDay) continue;
      calendarDaysElapsed = Math.ceil((t.exitTime - w.start) / DAY_MS);

      const dateKey = toRealNyDateKey(t.exitTime);
      const soFarToday = dailyGain.get(dateKey) || 0;
      const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
      if (soFarToday >= DAILY_GAIN_CAP_USD) {
        tradesVetoed++;
        missedUsdFromCap += Math.max(0, riskAmount * t.netRMultiple);
        continue;
      }

      if (t.forced) lostUsdFromForcedClose += riskAmount * (t.naturalNetRMultiple - t.netRMultiple);

      const pnl = riskAmount * t.netRMultiple;
      balance += pnl;
      tradesTaken++;
      tradingDays.add(dateKey);
      dailyGain.set(dateKey, soFarToday + Math.max(0, pnl));

      if (!bustDay && balance <= STARTING_BALANCE * (1 - BUST_PCT / 100)) bustDay = calendarDaysElapsed;
      if (!targetDay && balance >= STARTING_BALANCE * (1 + TARGET_PCT / 100)) targetDay = calendarDaysElapsed;
    }

    results.push({
      windowStart: toRealNyDateKey(w.start),
      finalBalance: balance,
      finalPct: (100 * (balance - STARTING_BALANCE)) / STARTING_BALANCE,
      targetDay,
      bustDay,
      tradesTaken,
      tradesVetoed,
      tradingDaysCount: tradingDays.size,
      metMinTradingDays: tradingDays.size >= MIN_TRADING_DAYS,
      missedUsdFromCap,
      lostUsdFromForcedClose,
    });
  }
  return results;
}

function main() {
  console.log('Phase 1: warmUp() replay, FVG + Judas Swing + CBDR + Silver Bullet, then forced-close-15:55-NY post-process...');
  const { trades, vetoedLateEntry, forcedCount, rawCount } = runPhase1();
  console.log(`Trades naturally produced: ${rawCount} | forced-closed early: ${forcedCount} | vetoed (entry already >=15:55 NY): ${vetoedLateEntry} | final compliant list: ${trades.length}\n`);

  console.log(`Phase 2: replaying into independent ${MAX_WINDOW_DAYS}-day HaitiForex $100k challenge windows...\n`);
  const windows = runPhase2(trades);

  console.log('| Fenêtre (début) | Résultat | Jour (sur 30) | Trades pris | Vétés (plafond) | $ manqué (plafond) | $ perdu (clôture forcée) | Solde final |');
  console.log('|---|---|---|---|---|---|---|---|');
  let passed = 0;
  for (const r of windows) {
    let outcome;
    let day;
    if (r.targetDay && (!r.bustDay || r.targetDay <= r.bustDay)) {
      outcome = r.metMinTradingDays ? '✅ CIBLE ATTEINTE' : '⚠️ cible atteinte MAIS <5j trading';
      day = r.targetDay;
      passed++;
    } else if (r.bustDay) {
      outcome = '❌ COMPTE ANNULÉ (perte 5%)';
      day = r.bustDay;
    } else {
      outcome = "➖ ni l'un ni l'autre en 30j";
      day = '—';
    }
    console.log(
      `| ${r.windowStart} | ${outcome} | ${day} | ${r.tradesTaken} | ${r.tradesVetoed} | $${r.missedUsdFromCap.toFixed(0)} | $${r.lostUsdFromForcedClose.toFixed(0)} | $${r.finalBalance.toFixed(2)} (${r.finalPct >= 0 ? '+' : ''}${r.finalPct.toFixed(2)}%) |`
    );
  }
  console.log(`\nRésultat global : ${passed}/${windows.length} fenêtres de 30 jours auraient atteint +10%.`);
}

main();
