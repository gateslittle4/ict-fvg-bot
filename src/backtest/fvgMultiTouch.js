// fvgMultiTouch.js
// EXPERIMENTAL variant of FvgEngine (src/engines/fvgEngine.js) — built ONLY
// to test a proposed rule change, NOT wired into production or the live
// bot. See scripts/runFvgMultiTouchAnalysis.js and HANDOFF.md.
//
// Esdras's question (2026-09-12), after finding a real US100 zone whose
// only touch missed the session window by 90 minutes: the PRODUCTION rule
// (fvgEngine.js + every *FilteredFvgEngine wrapper in gridRunner.js) gives
// a zone exactly ONE lifetime touch — accepted or rejected, the zone is
// removed from `active` either way, even if it is nowhere near its own
// maxAgeCandles staleness limit. "C'est comme ça que je tradais" - she
// would keep watching a still-fresh zone and take it on a LATER touch that
// lands in the valid session, instead of discarding it forever on the
// first miss.
//
// This engine tests exactly that alternative: a touch that FAILS the
// filters no longer consumes the zone - it stays active and gets
// re-checked on every subsequent touch, until either one touch passes
// every filter (validated) or the zone reaches maxAgeCandles (expired).
// Same 3-candle detection as fvgEngine.js, same maxAgeCandles staleness
// cutoff, same filter CRITERIA (bias/structure/session/sweep, via the
// exact same lookup builders production uses) - the ONLY thing that
// changes is whether a failed touch is fatal to the zone.
//
// Deliberately NOT built by subclassing/patching FvgEngine or the
// *FilteredFvgEngine wrappers: those wrappers only ever see the ALREADY-
// decided 'validated' event (each filters a stream, per gridRunner.js's
// own header comment - "each wrapper only ever drops or passes a
// 'validated' event"), by which point the inner FvgEngine has unconditionally
// deleted the zone from `active`. Testing "reject this touch but keep
// watching" requires deciding accept/reject BEFORE the zone is removed -
// there is no way to bolt that onto the existing gate-a-stream wrappers
// without changing what they gate, so this is a separate, self-contained
// engine instead, reusing every filter's exact lookup/decision logic.

import { buildHtfBiasSeries, makeBiasLookup, TIMEFRAME_MS } from './htfBias.js';
import { buildStructureBiasSeries, makeStructureBiasLookup } from './marketStructure.js';
import { isInNySessionWindow } from './nySession.js';
import { buildLiquiditySweepEvents, makeSweepLookup } from './liquiditySweep.js';
import { HTF_TIMEFRAMES, NEUTRAL_BAND_PCT, STRUCTURE_LOOKBACK, SWEEP_LOOKBACK, SWEEP_WINDOW_CANDLES, NY_AM_SESSION } from './gridRunner.js';

const DEFAULT_MAX_AGE_CANDLES = 50; // identical default to fvgEngine.js
const DIRECTION_MATCH = { bullish: 'bullish', bearish: 'bearish' };

/**
 * Builds a per-touch filter predicate from the SAME per-symbol config shape
 * buildFilteredEngine() (gridRunner.js) consumes - same lookups, same pass
 * criteria for each of the 4 filters, just callable per-candle instead of
 * only once. Missing/disabled filters are simply skipped (pass by default),
 * exactly like buildFilteredEngine() only wrapping the ones that are enabled.
 * @returns {(candle: object, zone: object) => boolean}
 */
export function buildMultiTouchFilterPredicate(
  candles,
  symbol,
  { variant, structureEnabled = false, sessionEnabled = false, sessionWindow = NY_AM_SESSION, liquiditySweepEnabled = false, structureLookback = STRUCTURE_LOOKBACK, sweepLookback = SWEEP_LOOKBACK, sweepWindowCandles = SWEEP_WINDOW_CANDLES }
) {
  const checks = [];

  if (variant && variant !== 'baseline') {
    const [tfKey, emaLabel] = variant.split('_');
    const tf = HTF_TIMEFRAMES.find((t) => t.key === tfKey);
    const emaPeriod = Number(emaLabel.replace('EMA', ''));
    const biasLookup = makeBiasLookup(buildHtfBiasSeries(candles, { bucketMs: tf.ms, emaPeriod, neutralBandPct: NEUTRAL_BAND_PCT }));
    checks.push((candle, zone) => biasLookup(candle.time) === DIRECTION_MATCH[zone.direction]);
  }

  if (structureEnabled) {
    const structureLookup = makeStructureBiasLookup(buildStructureBiasSeries(candles, { lookback: structureLookback }));
    checks.push((candle, zone) => structureLookup(candle.time) === DIRECTION_MATCH[zone.direction]);
  }

  if (sessionEnabled) {
    checks.push((candle) => isInNySessionWindow(candle.time, sessionWindow.startHour, sessionWindow.endHour));
  }

  if (liquiditySweepEnabled) {
    const sweepLookup = makeSweepLookup(buildLiquiditySweepEvents(candles, { lookback: sweepLookback }), { windowMs: sweepWindowCandles * 15 * 60 * 1000 });
    checks.push((candle, zone) => sweepLookup(candle.time, zone.direction));
  }

  return (candle, zone) => checks.every((check) => check(candle, zone));
}

export class MultiTouchFvgEngine {
  /**
   * @param {object} opts
   * @param {string} opts.symbol
   * @param {number} [opts.maxAgeCandles]
   * @param {(candle: object, zone: object) => boolean} [opts.checkFilters] - from buildMultiTouchFilterPredicate(); defaults to "always pass" (baseline, no filters)
   */
  constructor({ symbol, maxAgeCandles = DEFAULT_MAX_AGE_CANDLES, checkFilters = () => true } = {}) {
    if (!symbol) throw new Error('MultiTouchFvgEngine requires a symbol');
    this.symbol = symbol;
    this.maxAgeCandles = maxAgeCandles;
    this.checkFilters = checkFilters;
    this.history = [];
    this.active = [];
    this._idCounter = 0;
  }

  processCandle(candle) {
    const events = [];
    const stillActive = [];

    for (const fvg of this.active) {
      fvg.candlesSinceFormed += 1;
      const enteredZone = fvg.direction === 'bullish' ? candle.low <= fvg.top : candle.high >= fvg.bottom;

      if (enteredZone) {
        const zoneRef = { direction: fvg.direction, top: fvg.top, bottom: fvg.bottom };
        if (this.checkFilters(candle, zoneRef)) {
          fvg.touchAttempts += 1;
          events.push({
            type: 'validated',
            symbol: this.symbol,
            direction: fvg.direction,
            zone: { top: fvg.top, bottom: fvg.bottom },
            id: fvg.id,
            formedAt: fvg.formedAt,
            validatedAt: candle.time,
            suggestedSide: fvg.direction === 'bullish' ? 'buy' : 'sell',
            touchAttempts: fvg.touchAttempts, // how many rejected touches this zone survived before this one - the whole point of this experiment
          });
          continue; // consumed - accepted on this touch
        }
        // Touch failed the filters - THE experimental change: stay active
        // rather than being consumed, so a later touch still in-range gets
        // its own chance. Falls through to the age check below.
        fvg.touchAttempts += 1;
      }

      if (fvg.candlesSinceFormed >= this.maxAgeCandles) {
        events.push({ type: 'expired', symbol: this.symbol, direction: fvg.direction, zone: { top: fvg.top, bottom: fvg.bottom }, id: fvg.id, touchAttempts: fvg.touchAttempts });
        continue;
      }
      stillActive.push(fvg);
    }
    this.active = stillActive;

    this.history.push(candle);
    if (this.history.length > 3) this.history.shift();

    if (this.history.length === 3) {
      const [c1, , c3] = this.history;
      if (c1.high < c3.low) {
        const fvg = { id: `${this.symbol}-${++this._idCounter}`, direction: 'bullish', top: c3.low, bottom: c1.high, formedAt: c3.time, candlesSinceFormed: 0, touchAttempts: 0 };
        this.active.push(fvg);
        events.push({ type: 'watching', symbol: this.symbol, direction: fvg.direction, zone: { top: fvg.top, bottom: fvg.bottom }, id: fvg.id, formedAt: fvg.formedAt });
      } else if (c1.low > c3.high) {
        const fvg = { id: `${this.symbol}-${++this._idCounter}`, direction: 'bearish', top: c1.low, bottom: c3.high, formedAt: c3.time, candlesSinceFormed: 0, touchAttempts: 0 };
        this.active.push(fvg);
        events.push({ type: 'watching', symbol: this.symbol, direction: fvg.direction, zone: { top: fvg.top, bottom: fvg.bottom }, id: fvg.id, formedAt: fvg.formedAt });
      }
    }

    return events;
  }

  getActiveFvgs() {
    return [...this.active];
  }
}
