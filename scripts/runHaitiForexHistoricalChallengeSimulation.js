#!/usr/bin/env node
// runHaitiForexHistoricalChallengeSimulation.js
// Usage: node scripts/runHaitiForexHistoricalChallengeSimulation.js [riskPct]
//
// Esdras (2026-09-19, after the 7-month version of this simulation): "c'est
// le plus petit challenge qu'on pourrait prendre. Avant tout, teste le combo
// actuel sur plusieurs années pour voir les chances statistiques d'arriver à
// 10% dans un mois." The 7-month real-data version
// (runHaitiForexChallengeSimulation.js) only had 8 independent 30-day
// windows to draw from - not enough to trust a success rate. This is the
// SAME two-phase design (see that script's own header for the full method:
// Phase 1 replays LiveStrategyEngine ONCE via warmUp() with only the 4
// same-day-compliant mechanisms - FVG/Judas Swing/CBDR/Silver Bullet - then
// force-closes anything still open at 15:55 NY; Phase 2 replays that trade
// list into independent 30-calendar-day challenge windows), run instead on
// the full 2019-2025 historical CSVs already used by every other backtest
// in this project (data/backtest-input/) - up to ~15 years of M15 candles
// for US100/GER40/XAUUSD, giving 100+ independent monthly windows instead
// of 8.
//
// Historical CSVs are already in this project's "engine time" convention
// (fixed EST-as-UTC - see nySession.js's own header) - unlike the 7-month
// real-data export (genuine UTC from cTrader), NO toEngineTime() conversion
// is needed or applied here. Everything else (constants, the forced-close
// post-process, the daily-gain-cap Phase 2 logic, the known approximations
// listed in the 7-month script) is IDENTICAL and not re-derived here - see
// that script's header for the full list of caveats, which apply here too.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { toRealNyHourMinute } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = 'data/backtest-input';
const DAY_MS = 24 * 60 * 60 * 1000;

// --- HaitiForex $100,000 tier, read off haitiforex.org 2026-09-19 - IDENTICAL to runHaitiForexChallengeSimulation.js
const STARTING_BALANCE = 100000;
const TARGET_PCT = 10;
const BUST_PCT = 5;
const DAILY_GAIN_CAP_USD = 2200;
const MIN_TRADING_DAYS = 5;
const MAX_WINDOW_DAYS = 30;
const FORCED_CLOSE_NY_HOUR = 15 + 55 / 60;
const RISK_PCT_PER_TRADE = process.argv[2] ? Number(process.argv[2]) : 0.5;

const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
function toRealNyDateKey(engineTimeMs) {
  // Historical CSV .time is ALREADY fixed-EST-as-UTC ("engine time") - no
  // +FIXED_EST_TO_UTC_OFFSET_MS pre-conversion here, unlike the 7-month
  // real-data script (genuine UTC there, needs converting IN first).
  return nyDateFormatter.format(new Date(engineTimeMs));
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

// --- Phase 1: one warmUp() replay over the full historical CSVs, compliant mechanisms only, then the same forced-close-15:55-NY post-process
function runPhase1() {
  const symbols = CONFIG.symbols;
  const candlesBySymbol = {};
  for (const symbol of symbols) {
    const { candles } = loadCandlesFromCsv(path.join(DATA_DIR, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles;
  }

  const earliestStart = Math.min(...symbols.map((s) => candlesBySymbol[s][0].time));
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(STARTING_BALANCE, earliestStart);

  const engine = new LiveStrategyEngine({
    symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: null,
    nwogConfig: null,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: null,
    breakerBlockConfig: null,
    silverBulletConfig: CONFIG.silverBullet,
    cbdrConfig: CONFIG.cbdr,
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

  const historyBySymbol = {};
  for (const s of symbols) historyBySymbol[s] = engine.getHistory(s);

  const trades = [];
  let vetoedLateEntry = 0;
  let forcedCount = 0;
  for (const t of rawTrades) {
    const entryHour = nyDecimalHour(t.entryTime);
    if (entryHour >= FORCED_CLOSE_NY_HOUR) {
      vetoedLateEntry++;
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
    const hist = historyBySymbol[t.symbol];
    let forcedCandle = null;
    for (const c of hist) {
      if (c.time < t.entryTime) continue;
      if (toRealNyDateKey(c.time) !== entryDate) break;
      if (nyDecimalHour(c.time) > FORCED_CLOSE_NY_HOUR) break;
      forcedCandle = c;
    }
    if (!forcedCandle) { vetoedLateEntry++; continue; }
    forcedCount++;
    const naturalR = netRMultipleOf(t.direction, t.entryPrice, t.distance, t.exitPrice, t.symbol);
    trades.push({
      symbol: t.symbol, source: t.source, entryTime: t.entryTime, exitTime: forcedCandle.time,
      netRMultiple: netRMultipleOf(t.direction, t.entryPrice, t.distance, forcedCandle.close, t.symbol),
      naturalNetRMultiple: naturalR, forced: true,
    });
  }

  trades.sort((a, b) => a.exitTime - b.exitTime);
  return { trades, vetoedLateEntry, forcedCount, rawCount: rawTrades.length };
}

// --- Phase 2: replay the canonical trade list into independent 30-day windows - IDENTICAL logic to the 7-month script
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

    for (const t of trades) {
      if (t.entryTime < w.start || t.entryTime >= w.end) continue;
      if (bustDay) continue;
      calendarDaysElapsed = Math.ceil((t.exitTime - w.start) / DAY_MS);

      const dateKey = toRealNyDateKey(t.exitTime);
      const soFarToday = dailyGain.get(dateKey) || 0;
      const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
      if (soFarToday >= DAILY_GAIN_CAP_USD) {
        tradesVetoed++;
        continue;
      }

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
      finalPct: (100 * (balance - STARTING_BALANCE)) / STARTING_BALANCE,
      targetDay,
      bustDay,
      tradesTaken,
      tradesVetoed,
      tradingDaysCount: tradingDays.size,
      metMinTradingDays: tradingDays.size >= MIN_TRADING_DAYS,
    });
  }
  return results;
}

function main() {
  console.log(`Risque/trade utilisé : ${RISK_PCT_PER_TRADE}%`);
  console.log('Phase 1: warmUp() replay sur les CSV historiques complets (jusqu\'à ~15 ans), FVG + Judas Swing + CBDR + Silver Bullet, puis clôture forcée 15h55 NY...');
  const { trades, vetoedLateEntry, forcedCount, rawCount } = runPhase1();
  console.log(`Trades naturellement produits: ${rawCount} | clôturés de force: ${forcedCount} | vétés (entrée déjà >=15h55 NY): ${vetoedLateEntry} | liste finale conforme: ${trades.length}\n`);

  console.log(`Phase 2: rejeu dans des fenêtres indépendantes de ${MAX_WINDOW_DAYS} jours...\n`);
  const windows = runPhase2(trades);

  let passed = 0;
  let busted = 0;
  let neither = 0;
  let metMinDaysAmongPassed = 0;
  for (const r of windows) {
    const reallyPassed = r.targetDay && (!r.bustDay || r.targetDay <= r.bustDay);
    if (reallyPassed) {
      passed++;
      if (r.metMinTradingDays) metMinDaysAmongPassed++;
    } else if (r.bustDay) {
      busted++;
    } else {
      neither++;
    }
  }

  console.log(`Total de fenêtres de 30 jours indépendantes testées : ${windows.length}`);
  console.log(`✅ Cible +10% atteinte : ${passed} (${(100 * passed / windows.length).toFixed(1)}%) — dont ${metMinDaysAmongPassed} avec >=5 jours de trading réellement respectés`);
  console.log(`❌ Compte annulé (-5%) : ${busted} (${(100 * busted / windows.length).toFixed(1)}%)`);
  console.log(`➖ Ni l'un ni l'autre en 30 jours : ${neither} (${(100 * neither / windows.length).toFixed(1)}%)`);
}

main();
