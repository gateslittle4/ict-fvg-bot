// ndog.js
// ICT "NDOG" (New Day Opening Gap) — the daily sibling of NWOG (nwog.js):
// the price discontinuity between the last M15 candle before the broker's
// daily rollover pause and the first candle once trading resumes, instead
// of the weekly weekend pause. Same published mechanical description
// (icttraders.net, innercircletrader.net, liquidityscan.io, all converge on
// "NWOG/NDOG" as a single family: bet on the gap filling) — genuinely
// tested here for the first time in this project (only the weekly version
// existed before).
//
// Threshold picked from this project's OWN candle-timestamp structure,
// checked BEFORE looking at a single trade outcome (same discipline as
// nwog.js's own gap-distribution check) — NOT tuned on backtest results:
// GBPUSD's raw time-gap histogram shows 169,956 normal 15-min gaps, a
// cluster of 586 75-min gaps (15 scheduled + 60 min missing) and 98
// 135-min gaps (15 + 120 min missing) — a real, recurring ~1-2h daily
// pause, distinct from the ~2895+ min (48h+) weekend gaps NWOG already
// owns. MIN/MAX_GAP_HOURS below bracket exactly that daily cluster and
// nothing else - set once from this histogram, unchanged regardless of
// what the backtest below turns out to show.
//
// Method (identical to nwog.js beyond the threshold - see that file for
// the full rationale on each convention, not repeated here):
//   - Direction bets on the fill: gapped UP -> bearish; gapped DOWN -> bullish.
//   - Entry at the open of the candle AFTER the gap candle.
//   - Stop beyond the gap candle's OWN extreme.
//   - Fixed 1:3 R:R target, 480 M15-candle timeout.
//   - Same validStopSide guard as nwog.js (SMT Divergence's lesson).
//
// Tested on all 5 available instruments, same TRAIN/TEST discipline as
// everywhere else in this project.

const MIN_GAP_HOURS = 1; // 60 min - excludes the trivial 30-min bucket seen in the raw histogram (not a real pause)
const MAX_GAP_HOURS = 3; // 180 min - safely above the 135-min bucket, safely below NWOG's own 20h floor (no overlap between the two event sets)
const MS_PER_HOUR = 60 * 60 * 1000;

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number}>}
 *   `index` = the gap candle itself (the new day's opening print).
 */
export function detectNdogEvents(candles, { minGapHours = MIN_GAP_HOURS, maxGapHours = MAX_GAP_HOURS } = {}) {
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
export function runNdogBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectNdogEvents(candles, opts);
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
