// forwardTest.js
// Forward-test validation: split historical candles at a cutoff date,
// replay the strategy before and after, and compare performance.
//
// This answers: "Does the strategy perform consistently on data it hasn't
// seen before?" If performance degrades sharply in the forward period,
// it may indicate overfitting or regime change.
//
// Reuses buildRecentPerformanceReport's core logic (LiveStrategyEngine
// replay) to guarantee alignment with the live signal production.

import { LiveStrategyEngine } from '../liveStrategyEngine.js';
import { GuardrailEngine } from '../engines/guardrailEngine.js';
import { CONFIG } from '../config.js';

/**
 * Replay strategy on a specific candle slice and return trade summary.
 * @private
 */
async function replayOnSlice(historyBySymbol, startMs, endMs) {
  const guardrail = new GuardrailEngine({});
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    guardrail,
  });

  const sliced = {};
  for (const symbol of CONFIG.symbols) {
    const all = historyBySymbol[symbol] || [];
    if (all.length === 0) continue;
    sliced[symbol] = all.filter((c) => c.time >= startMs && c.time < endMs);
  }

  const openById = new Map();
  const trades = [];

  // Same O(n^2) -> O(n) fix as recentPerformanceReport.js (see its own
  // comment for the production incident this caused): one bulk warm-up pass
  // instead of a per-candle ingestCandle() loop that rebuilt and replayed
  // the whole history on every single candle.
  engine.warmUp(sliced, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) {
        openById.set(e.id, e);
        return;
      }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
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
  const decided = wins + losses;

  return {
    trades,
    summary: {
      count: trades.length,
      wins,
      losses,
      timeouts,
      winRatePct: decided > 0 ? (wins / decided) * 100 : null,
      totalR: Math.round(totalR * 100) / 100,
    },
  };
}

/**
 * @param {Record<string, object[]>} historyBySymbol - symbol -> chronological candle array
 * @param {object} opts
 * @param {number} opts.cutoffMs - split point (milliseconds since epoch)
 * @returns {Promise<{before: object, after: object, cutoffDate: string}>}
 */
export async function buildForwardTest(historyBySymbol, { cutoffMs }) {
  // Find the latest candle time across all symbols to set the end boundary
  let latestMs = 0;
  for (const candles of Object.values(historyBySymbol)) {
    if (candles.length > 0) {
      latestMs = Math.max(latestMs, candles[candles.length - 1].time);
    }
  }

  if (latestMs === 0) {
    return {
      before: { summary: { count: 0, wins: 0, losses: 0, timeouts: 0, winRatePct: null, totalR: 0 }, trades: [] },
      after: { summary: { count: 0, wins: 0, losses: 0, timeouts: 0, winRatePct: null, totalR: 0 }, trades: [] },
      cutoffDate: new Date(cutoffMs).toISOString(),
      reason: 'no candle history available',
    };
  }

  const beforeResult = await replayOnSlice(historyBySymbol, 0, cutoffMs);
  const afterResult = await replayOnSlice(historyBySymbol, cutoffMs, latestMs + 1);

  return {
    before: beforeResult,
    after: afterResult,
    cutoffDate: new Date(cutoffMs).toISOString(),
  };
}
