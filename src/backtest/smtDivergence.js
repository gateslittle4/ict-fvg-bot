// smtDivergence.js
// ICT "SMT Divergence" (Smart Money Technique) — a genuinely different
// mechanism from the two things already in this project that involve the
// US100/US500 pair:
//   - NOT the existing statistical Divergence (mean-reversion on the
//     US100/US500 log-ratio z-score) — that trades the SPREAD between the
//     two instruments directly. This trades ONE instrument directionally,
//     using the other only as a structural confirmation/non-confirmation
//     check at swing points — the two mechanisms don't overlap.
//   - NOT the already-tested/rejected cross-pair liquidity-sweep confluence
//     (cross-pair-sweep-confluence-analysis.md) — that required a sweep on
//     BOTH instruments as confluence bolted onto an FVG entry. This is a
//     standalone entry mechanism with no FVG involved, and compares swing
//     EXTENSION (higher high / lower low), not sweep-and-reclaim.
//
// Method (published ICT concept — converged description across
// road2fundedtrading.com, litefinance.org, fxopen.com and tradingfinder.com;
// gaps filled with conventions ALREADY used elsewhere in this project,
// nothing invented or tuned on this project's own data):
//   1. Swing highs/lows on BOTH instruments via the EXISTING symmetric
//      fractal detector (detectSwingPoints(), marketStructure.js,
//      lookback=5 — the same convention already used for the
//      structure-bias and liquidity-sweep filters, not a new parameter).
//   2. For two consecutive confirmed swing highs on instrument A (prevA ->
//      newA): if newA's price exceeds prevA's (A prints a higher high),
//      look at B's swing highs that occurred in the same window (after
//      prevA's time, at/before newA's time — "the same swing point" per
//      ICT's own description). If NONE of B's swings in that window
//      exceed B's own prior confirmed high, A's higher high has no
//      confirmation from its correlated partner — bearish SMT divergence.
//      Mirror construction on swing lows -> bullish divergence. If B has
//      no swing at all in the window, no claim is made (skipped, never
//      fabricated).
//   3. A divergence is a WARNING, not an entry — every source above agrees
//      the trade needs its own Market Structure Shift (MSS) confirmation:
//      reusing the EXACT BOS rule already in marketStructure.js (a candle's
//      close breaks the most recently confirmed opposite-side swing point
//      on instrument A itself). Only one divergence armed per direction at
//      a time; a fresh same-direction divergence arriving before MSS fires
//      replaces the stale one (decided up front, not data-driven).
//   4. Entry at the open of the candle after the MSS close (same
//      next-candle, no-lookahead convention used everywhere else in this
//      project). Stop beyond the swept extreme (A's own new high/low that
//      triggered the divergence — "stop loss beyond the swept extreme" per
//      road2fundedtrading.com). Fixed 1:3 R:R target, 480 M15-candle
//      timeout (same conventions as FVG/OTE/Judas Swing/Asian Range
//      Breakout — no new exit rule invented for this one either).
//   5. Found while validating this file against real data, kept as a
//      permanent guard: the swept extreme (fixed at divergence time) and
//      the opposite confirmed swing that triggers MSS (tracked completely
//      independently) are NOT guaranteed to stay correctly ordered by the
//      time MSS actually fires — in ~11% of raw signals on real data, the
//      resulting "stop" landed on the wrong side of the entry price (e.g.
//      above entry on a long), which is not a placeable stop-loss order,
//      not a real trade. Such signals are discarded at entry construction
//      (validStopSide check) rather than silently mis-signed.
//
// No-lookahead: every divergence event carries `eligibleTime`, the LATEST
// of (a) when A's own new swing extreme became confirmable and (b) when
// every B swing used to judge "did B confirm too" became confirmable on
// B's own clock. The event is only armed once a candle's time reaches
// eligibleTime — so this can never use information not yet knowable by a
// live trader at that instant, exactly like every other filter here.
//
// Scope: intrinsically limited to a correlated PAIR — same documented
// limitation as the existing statistical Divergence strategy. US100/US500
// reused as the pair (already the correlated pair used everywhere else in
// this project, not cherry-picked for this test). Both assignments (US100
// as the diverging instrument checked against US500, and the mirror) are
// tested and reported — decided up front, never picking the better one
// after seeing results.

import { detectSwingPoints } from './marketStructure.js';

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;
export const DEFAULT_LOOKBACK = 5;

/**
 * @param {Array} candlesA - the instrument whose divergences/entries we compute
 * @param {Array} candlesB - the correlated partner, confirmation only
 * @param {object} [opts]
 * @param {number} [opts.lookback]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', extreme:number, eligibleTime:number}>}
 *   `index` refers to candlesA — the location of A's own divergent swing extreme.
 */
export function detectSmtDivergenceEvents(candlesA, candlesB, { lookback = DEFAULT_LOOKBACK } = {}) {
  const swingsA = detectSwingPoints(candlesA, lookback);
  const swingsB = detectSwingPoints(candlesB, lookback);

  const highsA = swingsA.filter((p) => p.type === 'high').sort((a, b) => a.index - b.index);
  const lowsA = swingsA.filter((p) => p.type === 'low').sort((a, b) => a.index - b.index);
  const highsB = swingsB.filter((p) => p.type === 'high').sort((a, b) => a.index - b.index);
  const lowsB = swingsB.filter((p) => p.type === 'low').sort((a, b) => a.index - b.index);

  const events = [];

  function scan(swingListA, swingListB, comparator, direction) {
    for (let i = 1; i < swingListA.length; i++) {
      const prevA = swingListA[i - 1];
      const newA = swingListA[i];
      if (!comparator(newA.price, prevA.price)) continue; // A didn't extend its own prior extreme

      const tPrev = candlesA[prevA.index].time;
      const tNew = candlesA[newA.index].time;
      const bWindow = swingListB.filter((p) => {
        const t = candlesB[p.index].time;
        return t > tPrev && t <= tNew;
      });
      if (bWindow.length === 0) continue; // no corresponding swing on B — no claim

      const bBeforeWindow = swingListB.filter((p) => candlesB[p.index].time <= tPrev);
      if (bBeforeWindow.length === 0) continue; // B has no prior reference point either
      const prevB = bBeforeWindow[bBeforeWindow.length - 1];

      const bAlsoExtended = bWindow.some((p) => comparator(p.price, prevB.price));
      if (bAlsoExtended) continue; // B confirmed too — no divergence

      const eligibleTime = Math.max(
        candlesA[newA.confirmedIndex].time,
        candlesB[prevB.confirmedIndex].time,
        ...bWindow.map((p) => candlesB[p.confirmedIndex].time)
      );
      events.push({ index: newA.index, direction, extreme: newA.price, eligibleTime });
    }
  }

  scan(highsA, highsB, (a, b) => a > b, 'bearish');
  scan(lowsA, lowsB, (a, b) => a < b, 'bullish');

  events.sort((a, b) => a.eligibleTime - b.eligibleTime);
  return events;
}

/**
 * @param {Array} candlesA
 * @param {Array} candlesB
 * @param {object} [opts]
 * @returns {Array} raw (pre-cost) trades, on candlesA's own bars
 */
export function runSmtDivergenceBacktest(candlesA, candlesB, opts = {}) {
  const { lookback = DEFAULT_LOOKBACK, rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectSmtDivergenceEvents(candlesA, candlesB, { lookback });

  const swingsA = detectSwingPoints(candlesA, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingsA) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  let eventPtr = 0;
  let pendingBearish = null;
  let pendingBullish = null;
  let pendingEntry = null;
  let lastConfirmedHigh = null;
  let lastConfirmedLow = null;

  const trades = [];
  let open = null;

  for (let i = 0; i < candlesA.length; i++) {
    const candle = candlesA[i];

    // 1) Resolve an open position: stop, target, or timeout (same convention as judasSwing.js).
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

    // 2) Enter on a signal whose MSS confirmed on the PREVIOUS candle.
    if (!open && pendingEntry && pendingEntry.readyAtIndex === i) {
      const bullish = pendingEntry.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = pendingEntry.stopPrice;
      const distance = Math.abs(entryPrice - stopPrice);
      // The divergence's swept extreme (stopPrice) is a level from BEFORE
      // the wait for MSS — an unrelated, independently-tracked reference
      // swing on the OTHER side is what actually confirms entry, so nothing
      // guarantees the two stay correctly ordered by the time MSS fires.
      // A long can only carry a stop BELOW its entry (mirror for a short) —
      // anything else is not a placeable stop-loss order, not a real trade,
      // so it must be discarded here rather than silently mis-signed.
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      if (distance > 0 && validStopSide) {
        const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        open = {
          direction: pendingEntry.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple,
        };
      }
      pendingEntry = null;
    }

    // 3) Arm any newly-eligible divergence (replaces a stale same-direction one).
    while (eventPtr < events.length && events[eventPtr].eligibleTime <= candle.time) {
      const e = events[eventPtr];
      if (e.direction === 'bearish') pendingBearish = { extreme: e.extreme };
      else pendingBullish = { extreme: e.extreme };
      eventPtr++;
    }

    // 4) Update A's own confirmed swing levels (for MSS detection) — same
    //    ordering as buildStructureBiasSeries: a pivot confirmed AT candle i
    //    is already usable against candle i's own close.
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') lastConfirmedHigh = p.price;
        else lastConfirmedLow = p.price;
      }
    }

    // 5) Market Structure Shift: does this candle's close confirm a pending divergence?
    if (!open && !pendingEntry) {
      if (pendingBearish && lastConfirmedLow !== null && candle.close < lastConfirmedLow) {
        pendingEntry = { direction: 'bearish', stopPrice: pendingBearish.extreme, readyAtIndex: i + 1 };
        pendingBearish = null;
      } else if (pendingBullish && lastConfirmedHigh !== null && candle.close > lastConfirmedHigh) {
        pendingEntry = { direction: 'bullish', stopPrice: pendingBullish.extreme, readyAtIndex: i + 1 };
        pendingBullish = null;
      }
    }
  }
  return trades;
}
