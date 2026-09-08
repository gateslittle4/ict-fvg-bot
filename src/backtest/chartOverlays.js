// chartOverlays.js
// The one thing a broker's chart (MT4, Match-Trader, cTrader's own) can
// never show: THIS bot's reasoning drawn on the price. Rebuilds, for one
// symbol, the FVG zones it detected and the signals it fired over the
// retained history, so the market chart can draw them as boxes and markers.
//
// Same discipline as recentPerformanceReport.js: replay through a FRESH,
// isolated LiveStrategyEngine - the same class running live - so what the
// chart draws is by construction what the bot actually detects, not a
// separately-maintained lookalike that could drift.
//
// Unlike that report, this uses warmUp()'s optional onEvent hook rather than
// ingestCandle() per candle, so it costs O(n) instead of O(n^2) (see
// HANDOFF.md's "découverte de performance"): a ~90-day window builds in
// well under a second instead of tens of seconds, which is what makes it
// viable to serve from an HTTP endpoint at all.

import { LiveStrategyEngine } from '../liveStrategyEngine.js';
import { GuardrailEngine } from '../engines/guardrailEngine.js';
import { CONFIG } from '../config.js';

// The FvgEngine drops an unmitigated zone after this many candles (its own
// DEFAULT_MAX_AGE_CANDLES). Note CONFIG.fvg.maxAgeCandles exists and holds
// the same 50, but is dead config - buildFilteredEngine() constructs
// `new FvgEngine({ symbol })` without passing it, so the engine default is
// what actually applies. Same value today, so nothing behaves wrongly, but
// editing the CONFIG one expecting an effect would do nothing.
const FVG_MAX_AGE_CANDLES = 50;
const M15_MS = 15 * 60 * 1000;
const FVG_MAX_AGE_MS = FVG_MAX_AGE_CANDLES * M15_MS;

function lastCandleTime(candles) {
  return candles && candles.length > 0 ? candles[candles.length - 1].time : null;
}

/**
 * @param {Record<string, object[]>} historyBySymbol - symbol -> chronological candles, as LiveStrategyEngine.getHistory() returns them
 * @param {object} opts
 * @param {string} opts.symbol - which symbol's overlays to return
 * @param {number} [opts.timeOffsetMs=0] - added to every emitted time, to undo the data source's candle-time convention (see /api/candles)
 * @param {number} [opts.maxZones=60] - keep only the most recent N zones; hundreds of boxes stop being readable long before they stop rendering (250 was tried first and buried the candles completely)
 * @param {number} [opts.maxSignals=200]
 * @returns {{zones: object[], signals: object[]}}
 */
export function buildChartOverlays(historyBySymbol, { symbol, timeOffsetMs = 0, maxZones = 60, maxSignals = 200 } = {}) {
  const guardrail = new GuardrailEngine({});
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    guardrail,
  });

  const zonesById = new Map();
  const signalsById = new Map();

  engine.warmUp(historyBySymbol, {
    onEvent: (event, candle) => {
      if (!event || event.symbol !== symbol) return;

      if (event.type === 'watching') {
        // A zone starts life open-ended: it is drawn from formation up to
        // whenever it later validates or expires, and if neither ever
        // happens it is simply still live at the right edge (endedAt null).
        zonesById.set(event.id, {
          id: event.id,
          direction: event.direction,
          top: event.zone.top,
          bottom: event.zone.bottom,
          formedAt: event.formedAt + timeOffsetMs,
          endedAt: null,
          status: 'watching',
        });
        return;
      }

      if (event.type === 'expired') {
        const zone = zonesById.get(event.id);
        // 'expired' carries no timestamp of its own - hence the candle
        // passed alongside every event by warmUp()'s onEvent hook.
        if (zone) {
          zone.endedAt = candle.time + timeOffsetMs;
          zone.status = 'expired';
        }
        return;
      }

      if (event.type === 'validated') {
        const zone = zonesById.get(event.id);
        if (zone) {
          zone.endedAt = (event.validatedAt ?? candle.time) + timeOffsetMs;
          zone.status = 'validated';
        }
        signalsById.set(event.id, {
          id: event.id,
          source: event.source,
          direction: event.direction,
          time: (event.validatedAt ?? candle.time) + timeOffsetMs,
          entryPrice: event.entryPrice ?? null,
          stopPrice: event.stopPrice ?? null,
          targetPrice: event.targetPrice ?? null,
          // A signal the bot reported but did NOT act on (netting, guardrail,
          // spread too tight) is kept and flagged rather than hidden: "why
          // didn't it take that one?" is exactly the question this chart
          // should be able to answer.
          blockedReason: event.blockedReason ?? null,
          outcome: null,
          exitTime: null,
        });
        return;
      }

      if (event.type === 'closed') {
        const signal = signalsById.get(event.id);
        if (signal) {
          signal.outcome = event.outcome;
          signal.exitTime = event.exitTime + timeOffsetMs;
        }
      }
    },
  });

  // A zone whose life we never saw end is NOT necessarily still live. When a
  // filter wrapper (HTF bias / structure / session / sweep) rejects a
  // validation, the inner FvgEngine still consumes the zone, but the
  // 'validated' event is dropped before it reaches this collector - so the
  // zone goes quiet rather than reporting an end. Measured on real data:
  // 2258 of 2535 zones stayed nominally 'watching', median age 92 DAYS,
  // against an engine max age of 50 candles. Drawn literally, they each
  // stretch to the right edge and bury the chart.
  //
  // So: past the engine's own max-age horizon a zone cannot be live whatever
  // we did or didn't observe, and it is closed off at that horizon and
  // labelled 'stale' - distinct from a confirmed 'expired', because the
  // difference is "we watched it die" vs "we know it cannot still be alive".
  const now = lastCandleTime(historyBySymbol[symbol]);
  const zones = [...zonesById.values()]
    .map((z) => {
      if (z.endedAt !== null) return z;
      const horizon = z.formedAt + FVG_MAX_AGE_MS;
      if (now !== null && now + timeOffsetMs > horizon) {
        return { ...z, endedAt: horizon, status: 'stale' };
      }
      return z; // young enough to genuinely still be live - left open-ended
    })
    .sort((a, b) => a.formedAt - b.formedAt)
    .slice(-maxZones);
  const signals = [...signalsById.values()].sort((a, b) => a.time - b.time).slice(-maxSignals);
  return { zones, signals };
}
