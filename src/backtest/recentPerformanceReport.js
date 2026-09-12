// recentPerformanceReport.js
// "What would the bot have done over the last N days?" - at the user's
// request, after realizing the warm-up replay already computes every signal
// over the retained history but throws the result away once it's not the
// newest 20 entries (see accountRuntime.js's MAX_LOG_LENGTH / getActionableSignals()).
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

// PERFORMANCE (2026-09-09, real production incident - see HANDOFF.md):
// this used to call engine.ingestCandle() once per historical candle. Each
// such call rebuilds the whole filtered engine and replays the entire
// retained history (liveStrategyEngine.js's "rebuild-and-replay" design) -
// O(n) per call, so O(n^2) for the window: ~8600 candles x 3 symbols is
// ~224 MILLION inner steps. On Render's free tier (0.15 CPU) that pegged
// the CPU indefinitely, and because the cache is only written once the
// report FINISHES, the dashboard's 120s poller kept stacking additional
// concurrent runs on top - the service became permanently unreachable the
// moment the dashboard was opened.
//
// warmUp({ onEvent }) reconstructs the identical event stream in ONE pass
// (proven bit-for-bit equivalent to sequential ingestCandle() replay by
// test/liveStrategyEngine.test.js's own equivalence test) - the same fix
// already applied to the boot warm-up and to chartOverlays.js, which this
// file was simply never migrated to. O(n^2) -> O(n): ~26k steps instead of
// ~224M, fast enough that the old YIELD_EVERY event-loop yielding is no
// longer needed at all.

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

  // Window each symbol against ITS OWN latest candle (unchanged from the
  // per-symbol loop this replaced - symbols can have different last bars).
  const windowed = {};
  for (const symbol of CONFIG.symbols) {
    const all = historyBySymbol[symbol] || [];
    if (all.length === 0) continue;
    const latestTime = all[all.length - 1].time;
    windowed[symbol] = all.filter((c) => c.time >= latestTime - windowMs);
  }

  const openById = new Map();
  const trades = [];

  engine.warmUp(windowed, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) {
        openById.set(e.id, e);
        return;
      }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return; // this position was already open before our window started - we don't know its real entry, so exclude it rather than guess
      openById.delete(e.id);
      const rMultiple = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
      trades.push({
        symbol: e.symbol,
        source: opened.source,
        direction: opened.direction,
        entryPrice: opened.entryPrice,
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple,
      });
    },
  });

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
