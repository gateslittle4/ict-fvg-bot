// recentPerformanceReport.js
// "What would the bot have done over the last N days?" - at the user's
// request, after realizing the warm-up replay already computes every signal
// over the retained history but throws the result away once it's not the
// newest 20 entries (see store.js's MAX_LOG_LENGTH / getActionableSignals()).
//
// Deliberately reuses LiveStrategyEngine itself - the SAME class already
// running live (and already fixed for the NY-session-timezone bug) - fed a
// FRESH, isolated instance so this has zero side effects on the real live
// engine/guardrail. This guarantees the report matches exactly what the live
// bot would have flagged, rather than a separately-maintained simulation
// that could quietly drift from the real signal logic over time.
//
// Timeout trades' rMultiple is intentionally left null rather than
// reconstructed from a candle close: the 'closed' event does not carry an
// exit price for the timeout case, and estimating one from history here
// would be the same kind of fabrication this project avoids elsewhere
// (see dealPairing.js's stop/target omission for the same reason).

import { LiveStrategyEngine } from '../liveStrategyEngine.js';
import { GuardrailEngine } from '../engines/guardrailEngine.js';
import { CONFIG } from '../config.js';

// ingestCandle() rebuilds the whole filtered engine from scratch per candle
// (see liveStrategyEngine.js's "rebuild-and-replay" header comment and
// HANDOFF.md) - O(n) per call, so O(n^2) to replay a ~90-day window, the
// same cost the live connector's warm-up pays at boot. Run this
// synchronously inside an HTTP request handler and it blocks Node's event
// loop for the same multi-minute stretch that starved the cTrader heartbeat
// during warm-up (see cTraderDataSource.js's _toEngineCandle/YIELD_EVERY
// fix for that exact bug). Yielding every YIELD_EVERY candles here keeps
// this endpoint from re-introducing that failure mode.
const YIELD_EVERY = 200;

/**
 * @param {Record<string, object[]>} historyBySymbol - symbol -> chronological
 *   candle array (as retained by LiveStrategyEngine.getHistory()).
 * @param {object} [opts]
 * @param {number} [opts.days=90]
 * @returns {Promise<{trades: object[], summary: object}>}
 */
export async function buildRecentPerformanceReport(historyBySymbol, { days = 90 } = {}) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const guardrail = new GuardrailEngine({});
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    guardrail,
  });

  const openById = new Map();
  const trades = [];

  for (const symbol of CONFIG.symbols) {
    const all = historyBySymbol[symbol] || [];
    if (all.length === 0) continue;
    const latestTime = all[all.length - 1].time;
    const candles = all.filter((c) => c.time >= latestTime - windowMs);

    for (let i = 0; i < candles.length; i++) {
      const events = engine.ingestCandle(symbol, candles[i]);
      for (const e of events) {
        if (e.type === 'validated' && !e.blockedReason) {
          openById.set(e.id, e);
        }
        if (e.type === 'closed') {
          const opened = openById.get(e.id);
          if (!opened) continue; // this position was already open before our window started - we don't know its real entry, so exclude it rather than guess
          openById.delete(e.id);
          const rMultiple = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
          trades.push({
            symbol,
            source: opened.source,
            direction: opened.direction,
            entryPrice: opened.entryPrice,
            entryTime: opened.validatedAt,
            exitTime: e.exitTime,
            outcome: e.outcome,
            rMultiple,
          });
        }
      }
      if (i % YIELD_EVERY === YIELD_EVERY - 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  trades.sort((a, b) => b.exitTime - a.exitTime);

  const wins = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome === 'loss').length;
  const timeouts = trades.filter((t) => t.outcome === 'timeout').length;
  const totalR = trades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
  const decided = wins + losses; // timeouts excluded from win rate - neither a win nor a loss

  return {
    trades,
    summary: {
      windowDays: days,
      count: trades.length,
      wins,
      losses,
      timeouts,
      winRatePct: decided > 0 ? (wins / decided) * 100 : null,
      totalR: Math.round(totalR * 100) / 100,
    },
  };
}
