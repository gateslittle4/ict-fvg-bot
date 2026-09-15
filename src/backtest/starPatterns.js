// starPatterns.js
// Classic (non-ICT) candlestick reversal patterns: Morning Star (bullish) and
// Evening Star (bearish), with an optional stricter "Doji Star" variant -
// Esdras, explicit request after asking about known chart patterns for gold:
// "pour lor, pourquoi pas des patterns connus? Comme diament, etoile etc?"
// Diamond top/bottom deliberately NOT implemented alongside this - it needs
// several subjective peak/trough-detection parameters (window size,
// tolerance) chosen before any result is seen, which is exactly the kind of
// free-parameter surface this project avoids (see HANDOFF.md's running
// data-snooping discipline). Star patterns are a 3-candle OHLC relationship,
// no windowing/peak-detection needed - a much smaller, textbook-defined
// parameter surface.
//
// Definitions (standard technical-analysis textbook definitions - e.g.
// Bulkowski's "Encyclopedia of Candlestick Charts", Investopedia/StockCharts
// - not tuned on this project's own data, same discipline as every ICT
// concept here being taken from published sources first):
//   - Morning Star (bullish reversal): candle 1 bearish with a real body,
//     candle 2 a small "star" body (optionally a doji), candle 3 bullish
//     closing back above the midpoint of candle 1's body.
//   - Evening Star (bearish reversal): exact mirror.
//   - One documented adaptation for M15 intraday data (textbook patterns are
//     usually described on daily charts, where a genuine gap between
//     candles is common): the classic "must gap away" requirement is
//     relaxed to "the star's body sits mostly outside candle 1's body"
//     instead of a literal price gap, since real intracandle gaps are rare
//     on M15 forex/CFD data (same kind of adaptation NWOG/Judas Swing's
//     ICT-daily-chart origins already needed here).
//   - Entry at the open of the candle AFTER the pattern's 3rd candle
//     (one-candle no-lookahead delay, same convention used everywhere else
//     in this project). Stop beyond the 3-candle pattern's own extreme low/
//     high ("the range that created the setup defines its own risk",
//     already used for NWOG/Asian Range Breakout). Fixed 1:3 R:R, 480 M15-
//     candle timeout (same conventions as every other strategy here).
//
// STAR_BODY_RATIO/DOJI_BODY_RATIO below are the only two free parameters,
// both standard textbook thresholds fixed BEFORE running this against any
// of this project's data - not tuned to these results.

const STAR_BODY_RATIO = 0.3; // candle 2's body must be <= 30% of candle 1's body to count as a "small" star
const DOJI_BODY_RATIO = 0.1; // stricter "doji star" variant: candle 2's body must be <= 10% of ITS OWN range

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

function body(c) { return Math.abs(c.close - c.open); }
function range(c) { return c.high - c.low; }
function isBullish(c) { return c.close > c.open; }
function isBearish(c) { return c.close < c.open; }

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @param {boolean} [opts.requireDoji=false] - stricter "Doji Star" variant
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number}>}
 *   `index` = the 3rd (confirmation) candle of the pattern.
 */
export function detectStarPatternEvents(candles, { requireDoji = false } = {}) {
  const events = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const body1 = body(c1);
    if (body1 <= 0) continue; // candle 1 must have a real body to define a midpoint
    const body2 = body(c2);
    if (body2 > STAR_BODY_RATIO * body1) continue; // candle 2 not "small" enough
    if (requireDoji) {
      const range2 = range(c2);
      if (range2 <= 0 || body2 > DOJI_BODY_RATIO * range2) continue;
    }
    const midpoint1 = (c1.open + c1.close) / 2;

    // Morning Star: c1 bearish, c3 bullish closing back above c1's midpoint,
    // c2's body sitting mostly at/below c1's close (the "gap down" adaptation).
    if (isBearish(c1) && isBullish(c3) && c3.close > midpoint1 && Math.max(c2.open, c2.close) <= c1.close) {
      const low3 = Math.min(c1.low, c2.low, c3.low);
      events.push({ index: i, direction: 'bullish', stopReference: low3 });
      continue;
    }
    // Evening Star: exact mirror.
    if (isBullish(c1) && isBearish(c3) && c3.close < midpoint1 && Math.min(c2.open, c2.close) >= c1.close) {
      const high3 = Math.max(c1.high, c2.high, c3.high);
      events.push({ index: i, direction: 'bearish', stopReference: high3 });
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runStarPatternsBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectStarPatternEvents(candles, opts);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const signalIndex = i - 1;
    const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;

    // 1) Resolve an open position: stop, target, or timeout.
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingCandles;
      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice;
        if (hitStop) {
          outcome = 'loss';
          exitPrice = open.stopPrice;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = open.targetPrice;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
        }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    // 2) New entry, one candle after the pattern's confirmation candle.
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = event.stopReference;
      const distance = Math.abs(entryPrice - stopPrice);
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      if (distance > 0 && validStopSide) {
        const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        open = {
          direction: event.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple,
        };
      }
    }
  }
  return trades;
}
