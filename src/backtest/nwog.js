// nwog.js
// ICT "NWOG" (New Week Opening Gap) — the price discontinuity between the
// last M15 candle before trading pauses for the weekend and the first
// candle once it resumes. Detected directly from the data's own
// timestamps (a gap far larger than the normal 15-minute candle spacing),
// not from a hardcoded Friday/Sunday NY-hour assumption — this works
// regardless of this broker's specific weekend session boundary and
// naturally excludes any smaller weekday pause. The actual gap
// distribution was checked on this project's own CSVs before picking the
// threshold: every real weekly gap on all 5 instruments clusters tightly
// between ~24h and ~80h (holiday long weekends included), with a single
// outlier (~1-year gap in the XAUUSD CSV — a data-quality issue, not a
// real weekend) safely excluded by the upper bound.
//
// Method (published ICT concept — anthonyjohnson.dev, liquidityscan.io,
// icttraders.net, innercircletrader.net all converge on the same
// mechanical description; gaps filled with this project's existing
// conventions, nothing invented or tuned on this project's own data):
//   - Direction bets on the published "high fill rate" claim: gapped UP
//     (new open > previous close) -> bearish (expect price to come back
//     down and fill the gap); gapped DOWN -> bullish.
//   - Entry at the open of the candle AFTER the gap candle (one-candle
//     no-lookahead delay, same next-candle convention used everywhere
//     else in this project — the gap itself is only known once that
//     candle has printed).
//   - Stop beyond the gap candle's OWN extreme (its low for a bullish
//     fill bet, its high for a bearish one) — mirrors the "the range/
//     candle that created the setup defines its own risk" convention
//     already used for Asian Range Breakout's stop, rather than a bare
//     price point.
//   - Fixed 1:3 R:R target, 480 M15-candle timeout (same conventions as
//     every other strategy here).
//   - Same guard learned from smtDivergence.js: the stop is fixed at gap
//     time but entry happens one candle later, so — even though the wait
//     is bounded to a single candle, unlike SMT's unbounded wait — a
//     signal whose resulting stop would land on the wrong side of entry
//     is discarded rather than silently mis-signed.
//
// Tested on all 5 available instruments.

const MIN_GAP_HOURS = 20;
const MAX_GAP_HOURS = 100; // excludes a single ~1-year data-quality gap found in XAUUSD's CSV
const MS_PER_HOUR = 60 * 60 * 1000;

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number}>}
 *   `index` = the gap candle itself (the new session's opening print).
 */
export function detectNwogEvents(candles, { minGapHours = MIN_GAP_HOURS, maxGapHours = MAX_GAP_HOURS } = {}) {
  const events = [];
  for (let i = 1; i < candles.length; i++) {
    const dtHours = (candles[i].time - candles[i - 1].time) / MS_PER_HOUR;
    if (dtHours < minGapHours || dtHours > maxGapHours) continue;
    const prevClose = candles[i - 1].close;
    const newOpen = candles[i].open;
    if (newOpen === prevClose) continue; // time break with no actual price gap
    const direction = newOpen > prevClose ? 'bearish' : 'bullish'; // bet on the fill
    events.push({
      index: i,
      direction,
      stopReference: direction === 'bullish' ? candles[i].low : candles[i].high,
    });
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runNwogBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectNwogEvents(candles, opts);
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

    // 2) New entry, one candle after the gap candle.
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
