// mockDataSource.js
// Generates a plausible synthetic M15 candle stream per symbol so the
// dashboard is fully demonstrable before the real cTrader connection is
// wired up (see cTraderClient.js / task: "Scaffold cTrader Open API client").
//
// This is CLEARLY a demo/offline data source: prices are a random walk with
// occasional impulsive candles (to produce FVGs to look at), not real market
// data. The dashboard must keep the "DEMO MODE" banner visible whenever this
// source is active - see store.mode.

import { store, pushSignalEvents, setBalance } from '../store.js';
import { CONFIG } from '../config.js';

// Demo push is OFF by default (nobody wants their phone buzzing over fake
// trades). Set DEMO_PUSH_NOTIFICATIONS=true to test the ntfy.sh wiring
// before going live.
const DEMO_PUSH_ENABLED = process.env.DEMO_PUSH_NOTIFICATIONS === 'true';

function notifyDemo(event) {
  if (!DEMO_PUSH_ENABLED || !CONFIG.notifications.ntfyTopic) return;
  // Divergence-sourced signals have no `zone` (that's an FVG-only concept) - describe generically.
  const range = event.zone ? ` (${event.zone.bottom.toFixed(2)}-${event.zone.top.toFixed(2)})` : '';
  const label = event.source === 'divergence' ? 'divergence' : 'FVG rempli';
  const text = `[DEMO] ${event.suggestedSide.toUpperCase()} ${event.symbol} — ${label}${range}`;
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

let started = false;
let intervalHandle = null;

export function startMockDataSource({ candleIntervalMs = 4000 } = {}) {
  if (started) return;
  started = true;
  store.mode = 'demo';

  const sims = new Map(CONFIG.symbols.map((s) => [s, new SymbolSimulator(s)]));
  store.strategyEngine.setBalance(store.balance);

  // Warm up with some history immediately so the dashboard isn't empty on first load.
  // Not enough candles here to ever pass the HTF-EMA/structure/session/sweep filters for
  // real (those need hundreds of candles of warm-up) - this is only to populate
  // lastCandleBySymbol/"watching" gaps for a non-empty first paint, same as before.
  for (let i = 0; i < 30; i++) {
    for (const symbol of CONFIG.symbols) {
      const candle = sims.get(symbol).nextCandle();
      const events = store.strategyEngine.ingestCandle(symbol, candle);
      pushSignalEvents(events);
      store.lastCandleBySymbol.set(symbol, candle);
      for (const e of events) {
        if (e.type === 'validated' && !e.blockedReason) maybeSimulateTradeOutcome();
      }
    }
  }

  intervalHandle = setInterval(() => {
    for (const symbol of CONFIG.symbols) {
      const candle = sims.get(symbol).nextCandle();
      const events = store.strategyEngine.ingestCandle(symbol, candle);
      pushSignalEvents(events);
      store.lastCandleBySymbol.set(symbol, candle);
      for (const e of events) {
        if (e.type === 'validated' && !e.blockedReason) {
          maybeSimulateTradeOutcome();
          notifyDemo(e);
        }
      }
    }
  }, candleIntervalMs);
}

export function stopMockDataSource() {
  if (intervalHandle) clearInterval(intervalHandle);
  started = false;
}

// Purely cosmetic for the demo: pretends the user took ~60% of validated
// signals and resolves them win/loss shortly after, so the guardrail engine
// (cooldown / daily loss / trade count) has something real to react to.
// This NEVER happens once mode === 'live' - live trades come only from the
// broker's own closed-position feed (see cTraderClient.js).
function maybeSimulateTradeOutcome() {
  if (store.mode !== 'demo') return;
  if (Math.random() > 0.6) return;

  setTimeout(() => {
    if (store.mode !== 'demo') return;
    const win = Math.random() < 0.45; // slightly losing-biased on purpose, to demo cooldown/loss-limit
    const pnl = win ? rand(40, 120) : -rand(40, 140);
    setBalance(store.balance + pnl);
    store.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: store.balance });
  }, rand(2000, 6000));
}
