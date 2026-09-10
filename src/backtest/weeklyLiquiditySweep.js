// weeklyLiquiditySweep.js
// ICT "Previous Week High/Low" (PWH/PWL) liquidity sweep — a genuinely new
// concept, not yet tried in this project: PWH/PWL work "identically to
// PDH/PDL" (see sources below) but carry more institutional weight, since
// the liquidity resting there accumulated over 5 trading days instead of
// one. Distinct from Judas Swing (judasSwing.js), which uses the same
// wick-then-reclaim mechanic but on the PREVIOUS DAY's high/low, scoped to
// one specific killzone (02:00-05:00 NY) — this uses the PREVIOUS WEEK's
// high/low, with NO time-of-day restriction (no canonical ICT killzone for
// weekly liquidity specifically turned up in research, and inventing one
// after the fact would be exactly the kind of untested, undecided
// parameter this project's discipline avoids — see sources below, none of
// which name a specific hour).
//
// Method (published ICT concept — road2fundedtrading-style sources,
// tradingfinder.com, ghosttraders.co, luxalgo.com all converge on the same
// mechanical description; gaps filled with conventions ALREADY used
// elsewhere in this project, nothing invented or tuned on this project's
// own data):
//   1. Week boundaries detected directly from the data's own timestamps —
//      the SAME technique already used and proven in nwog.js (a time gap
//      between consecutive M15 candles far larger than the normal 15
//      minutes, bounded to [MIN_GAP_HOURS, MAX_GAP_HOURS] to catch real
//      weekend closures only, excluding smaller weekday pauses and the one
//      known data-quality outlier). Deliberately NOT re-exported from
//      nwog.js to avoid touching that file's logic while it's live in
//      production — this is a small, independent copy of the same idea,
//      not a shared dependency.
//   2. PWH/PWL = the high/low of every M15 candle within one complete week
//      segment (from one boundary to the next) — becomes the reference
//      level for the FOLLOWING week's candles.
//   3. Signal = the FIRST candle in a week whose wick pierces PWH/PWL but
//      whose CLOSE reclaims back inside it (same same-candle wick-then-
//      reclaim definition already used by liquiditySweep.js/judasSwing.js
//      — not a new convention), at most one signal per direction per week
//      (mirrors Judas Swing's "one per direction per day", scaled to the
//      week this concept operates on).
//   4. Entry at the OPEN of the next candle after the reclaim (no-
//      lookahead, same next-candle convention as everywhere else). Stop
//      beyond the sweep's own extreme. Fixed 1:3 R:R target, 480 M15-
//      candle timeout (same conventions as FVG/Judas Swing/NWOG).
//   5. Same guard learned from smtDivergence.js: a signal whose resulting
//      stop would land on the wrong side of entry is discarded rather
//      than silently mis-signed (belt-and-suspenders — the wait here is
//      bounded to one candle, the same low-risk shape already checked
//      safe for Judas Swing/Asian Range Breakout/NWOG).
//
// Tested on all 5 available instruments, same as every other exploratory
// script here.

const MIN_GAP_HOURS = 20; // same threshold already validated in nwog.js against this project's real data
const MAX_GAP_HOURS = 100; // excludes the same ~1-year data-quality outlier already found in XAUUSD's CSV
const MS_PER_HOUR = 60 * 60 * 1000;

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/** @returns {number[]} candle indices where a new week begins (i.e. the gap candle itself) */
export function detectWeekBoundaryIndices(candles, { minGapHours = MIN_GAP_HOURS, maxGapHours = MAX_GAP_HOURS } = {}) {
  const boundaries = [];
  for (let i = 1; i < candles.length; i++) {
    const dtHours = (candles[i].time - candles[i - 1].time) / MS_PER_HOUR;
    if (dtHours >= minGapHours && dtHours <= maxGapHours) boundaries.push(i);
  }
  return boundaries;
}

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', sweepExtreme:number}>}
 */
export function detectWeeklySweepEvents(candles, opts = {}) {
  const boundaries = detectWeekBoundaryIndices(candles, opts);
  if (boundaries.length === 0) return [];

  // Segment candles into weeks: [0, b0), [b0, b1), [b1, b2), ...
  const segments = [];
  let start = 0;
  for (const b of boundaries) {
    segments.push({ start, end: b }); // end exclusive
    start = b;
  }
  segments.push({ start, end: candles.length });

  const events = [];
  for (let s = 1; s < segments.length; s++) {
    const prevSeg = segments[s - 1];
    if (prevSeg.end <= prevSeg.start) continue;
    let pwh = -Infinity;
    let pwl = Infinity;
    for (let i = prevSeg.start; i < prevSeg.end; i++) {
      if (candles[i].high > pwh) pwh = candles[i].high;
      if (candles[i].low < pwl) pwl = candles[i].low;
    }

    const curSeg = segments[s];
    let firedBearish = false;
    let firedBullish = false;
    for (let i = curSeg.start; i < curSeg.end; i++) {
      const candle = candles[i];
      if (!firedBearish && candle.high > pwh && candle.close < pwh) {
        events.push({ index: i, direction: 'bearish', sweepExtreme: candle.high });
        firedBearish = true;
      }
      if (!firedBullish && candle.low < pwl && candle.close > pwl) {
        events.push({ index: i, direction: 'bullish', sweepExtreme: candle.low });
        firedBullish = true;
      }
      if (firedBearish && firedBullish) break;
    }
  }

  events.sort((a, b) => a.index - b.index);
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runWeeklySweepBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectWeeklySweepEvents(candles, opts);
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

    // 2) New entry, one candle after the sweep+reclaim candle.
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = event.sweepExtreme;
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
