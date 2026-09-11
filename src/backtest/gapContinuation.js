// gapContinuation.js
// "Gap and Go" — the OPPOSITE bet from NWOG/NDOG (nwog.js/ndog.js): those
// two bet on the gap FILLING (fade). This bets on the gap CONTINUING in the
// same direction it opened — a real, cited concept (general TA, not ICT-
// specific; commonly named "gap and go" in retail/prop trading education
// for index futures specifically) that has never been tested in this
// project, despite the fill/fade direction being tested twice (NWOG and
// NDOG both only ever bet on the fill).
//
// Deliberately a NEW, self-contained module rather than a modification of
// nwog.js/ndog.js: those two files are relied on elsewhere (NWOG is LIVE in
// production), and the only thing genuinely new here is the BETTING
// DIRECTION, not the gap-detection itself. Duplicating the tiny detection
// logic locally (same convention already used by weeklyLiquiditySweep.js
// for nwog.js) keeps this a pure addition, zero risk to the live file.
//
// Same gap thresholds as the two existing gap studies - NOT re-derived,
// since this bets on the SAME real gaps NWOG/NDOG already found in this
// project's own timestamp histograms, just in the opposite direction:
//   - "daily" gap: 1-3h (ndog.js's own MIN/MAX_GAP_HOURS)
//   - "weekly" gap: 20-100h (nwog.js's own MIN/MAX_GAP_HOURS)
//
// Method:
//   - Direction bets WITH the gap: gapped UP -> bullish continuation;
//     gapped DOWN -> bearish continuation (the exact mirror of NWOG/NDOG's
//     "bet on the fill" rule).
//   - Entry at the open of the candle AFTER the gap candle (no-lookahead,
//     same convention as everywhere else).
//   - Stop beyond the gap candle's OWN extreme, on the side that now makes
//     sense for the FLIPPED direction (a bullish continuation trade's stop
//     sits below the gap candle's low - if the gap reverses that hard, the
//     continuation idea failed).
//   - Fixed 1:3 R:R target, 480 M15-candle timeout (same conventions as
//     everywhere else). Same validStopSide guard as nwog.js/ndog.js
//     (SMT Divergence's lesson).
//
// Tested on all 6 available instruments, both gap scales, same TRAIN/TEST
// discipline as everywhere else in this project.

const MS_PER_HOUR = 60 * 60 * 1000;

export const DAILY_GAP_HOURS = { minGapHours: 1, maxGapHours: 3 }; // same as ndog.js
export const WEEKLY_GAP_HOURS = { minGapHours: 20, maxGapHours: 100 }; // same as nwog.js
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/** @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number}>} */
export function detectGapContinuationEvents(candles, { minGapHours, maxGapHours }) {
  const events = [];
  for (let i = 1; i < candles.length; i++) {
    const dtHours = (candles[i].time - candles[i - 1].time) / MS_PER_HOUR;
    if (dtHours < minGapHours || dtHours > maxGapHours) continue;
    const prevClose = candles[i - 1].close;
    const newOpen = candles[i].open;
    if (newOpen === prevClose) continue; // time break with no actual price gap
    const direction = newOpen > prevClose ? 'bullish' : 'bearish'; // bet WITH the gap (continuation)
    events.push({
      index: i,
      direction,
      stopReference: direction === 'bullish' ? candles[i].low : candles[i].high,
    });
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runGapContinuationBacktest(candles, opts) {
  const { minGapHours, maxGapHours, rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectGapContinuationEvents(candles, { minGapHours, maxGapHours });
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
        if (hitStop) { outcome = 'loss'; exitPrice = open.stopPrice; }
        else if (hitTarget) { outcome = 'win'; exitPrice = open.targetPrice; }
        else { outcome = 'timeout'; exitPrice = candle.close; }
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
