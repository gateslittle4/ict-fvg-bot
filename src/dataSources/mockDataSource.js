// mockDataSource.js
// Generates a plausible synthetic M15 candle stream per symbol so the
// dashboard is fully demonstrable before the real cTrader connection is
// wired up (see cTraderClient.js / task: "Scaffold cTrader Open API client").
//
// This is CLEARLY a demo/offline data source: prices are a random walk with
// occasional impulsive candles (to produce FVGs to look at), not real market
// data. The dashboard must keep the "DEMO MODE" banner visible whenever this
// source is active - see AccountRuntime.mode.
//
// Multi-account rollout (2026-09, Phase 2 - see HANDOFF.md/accountRegistry.js):
// this used to be module-level singleton functions (a single `started`
// boolean/`intervalHandle`) that could only ever drive ONE account. Now
// `startMockDataSource(account, opts)`/`stopMockDataSource(account)` take
// the AccountRuntime to drive explicitly and track their interval PER
// account id, so several mock accounts can run concurrently in the same
// process (used by the multi-account integration test).

import { getDefaultAccount } from '../accountRegistry.js';
import { CONFIG } from '../config.js';

const DEMO_PUSH_ENABLED = process.env.DEMO_PUSH_NOTIFICATIONS === 'true';

function notifyDemo(account, event) {
  if (!DEMO_PUSH_ENABLED || !CONFIG.notifications.ntfyTopic) return;
  // Divergence-sourced signals have no `zone` (that's an FVG-only concept) - describe generically.
  const range = event.zone ? ` (${event.zone.bottom.toFixed(2)}-${event.zone.top.toFixed(2)})` : '';
  const label = event.source === 'divergence' ? 'divergence' : 'FVG rempli';
  const text = `[DEMO ${account.label}] ${event.suggestedSide.toUpperCase()} ${event.symbol} — ${label}${range}`;
  fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch(() => {});
}

const SEED_PRICES = {
  US100: 19500,
  US500: 5500,
  EURUSD: 1.1000,
  GBPUSD: 1.2700,
  XAUUSD: 2600,
};

const PRICE_SCALE = {
  // rough per-candle "normal" wiggle size, in price units
  US100: 8,
  US500: 3,
  EURUSD: 0.0006,
  GBPUSD: 0.0007,
  XAUUSD: 3.5,
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

class SymbolSimulator {
  constructor(symbol) {
    this.symbol = symbol;
    this.price = SEED_PRICES[symbol];
    this.time = Date.now();
  }

  nextCandle() {
    const scale = PRICE_SCALE[this.symbol];
    const open = this.price;

    // ~1 in 6 candles is an "impulsive" move, more likely to leave a gap behind it
    const impulsive = Math.random() < 0.16;
    const move = impulsive ? rand(2.5, 4) * scale * (Math.random() < 0.5 ? 1 : -1) : rand(-1, 1) * scale;

    const close = open + move;
    const wick = scale * rand(0.2, 0.6);
    const high = Math.max(open, close) + wick * Math.random();
    const low = Math.min(open, close) - wick * Math.random();

    this.time += 15 * 60 * 1000; // advance one M15 bar
    this.price = close;

    return { time: this.time, open, high, low, close };
  }
}

// account.id -> intervalHandle - lets several mock accounts run concurrently
// (each with its own independent random-walk simulators) instead of a single
// module-level "started" guard that only ever supported one.
const intervalByAccountId = new Map();

export function startMockDataSource(account = getDefaultAccount(), { candleIntervalMs = 4000, symbols = CONFIG.symbols } = {}) {
  if (intervalByAccountId.has(account.id)) return; // already running for this account
  account.mode = 'demo';

  const sims = new Map(symbols.map((s) => [s, new SymbolSimulator(s)]));
  account.strategyEngine.setBalance(account.balance);

  // Warm up with some history immediately so the dashboard isn't empty on first load.
  // Not enough candles here to ever pass the HTF-EMA/structure/session/sweep filters for
  // real (those need hundreds of candles of warm-up) - this is only to populate
  // lastCandleBySymbol/"watching" gaps for a non-empty first paint, same as before.
  for (let i = 0; i < 30; i++) {
    for (const symbol of symbols) {
      const candle = sims.get(symbol).nextCandle();
      const events = account.strategyEngine.ingestCandle(symbol, candle);
      account.pushSignalEvents(events);
      account.lastCandleBySymbol.set(symbol, candle);
      for (const e of events) {
        if (e.type === 'validated' && !e.blockedReason) maybeSimulateTradeOutcome(account);
      }
    }
  }

  const intervalHandle = setInterval(() => {
    for (const symbol of symbols) {
      const candle = sims.get(symbol).nextCandle();
      const events = account.strategyEngine.ingestCandle(symbol, candle);
      account.pushSignalEvents(events);
      account.lastCandleBySymbol.set(symbol, candle);
      for (const e of events) {
        if (e.type === 'validated' && !e.blockedReason) {
          maybeSimulateTradeOutcome(account);
          notifyDemo(account, e);
        }
      }
    }
  }, candleIntervalMs);
  intervalByAccountId.set(account.id, intervalHandle);
}

export function stopMockDataSource(account = getDefaultAccount()) {
  const handle = intervalByAccountId.get(account.id);
  if (handle) clearInterval(handle);
  intervalByAccountId.delete(account.id);
}

// Purely cosmetic for the demo: pretends the user took ~60% of validated
// signals and resolves them win/loss shortly after, so the guardrail engine
// (cooldown / daily loss / trade count) has something real to react to.
// This NEVER happens once mode === 'live' - live trades come only from the
// broker's own closed-position feed (see cTraderClient.js).
function maybeSimulateTradeOutcome(account) {
  if (account.mode !== 'demo') return;
  if (Math.random() > 0.6) return;

  setTimeout(() => {
    if (account.mode !== 'demo') return;
    const win = Math.random() < 0.45; // slightly losing-biased on purpose, to demo cooldown/loss-limit
    const pnl = win ? rand(40, 120) : -rand(40, 140);
    account.setBalance(account.balance + pnl);
    account.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: account.balance });
  }, rand(2000, 6000));
}
