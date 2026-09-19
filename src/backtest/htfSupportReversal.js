// htfSupportReversal.js
// "Support/résistance multi-timeframe + confirmation par pattern de
// renversement" (2026-09-19, Esdras: "T'as entendu parler des daily supports,
// weekly and monthly support? Ensuite confirme par une pattern de renversemet
// genre doji, bullish engolfing etc?"). Deliberately NOT "3 touches = niveau
// plus fort" (a widely-repeated retail claim without real evidence — each
// extra touch consumes some of the resting liquidity at a level, so more
// tests plausibly WEAKEN it rather than strengthen it). What IS a real,
// separate idea worth testing on its own: does requiring confluence across
// several independent timeframes (a bigger, less noisy sample of positioning
// than any single one), confirmed by a reversal candle, do better than the
// project's existing FVG/Judas Swing/CBDR/Silver Bullet combo, or than any
// one of them alone?
//
// Method (fixed BEFORE looking at any result on this project's data - same
// discipline as equalHighsLows.js/starPatterns.js):
//   1. Levels: previous COMPLETED day/week/month's high (resistance) and low
//      (support) - the same PDH/PDL/PWH/PWL definitions already used by
//      dailyLevels.js's "Niveaux du jour" page, extended with a monthly
//      PMH/PML pair computed the same way. Computed ROLLING here (one value
//      per candle, from whatever period had already closed as of that
//      candle) rather than dailyLevels.js's single latest-snapshot use - a
//      backtest needs the level as it stood at every point in time, not just
//      "now".
//   2. Confluence: a level counts as tradeable only if ANOTHER timeframe's
//      level of the same kind (support or resistance) sits within
//      TOLERANCE_PCT of it - i.e. at least 2 of {day, week, month} agree.
//      Same 0.1%-of-price tolerance already used for EQH/EQL's own
//      "equal levels" test (equalHighsLows.js) - not a new number invented
//      for this file.
//   3. Touch: a candle's low reaches within TOLERANCE_PCT of a confluent
//      support (mirror: high reaches a confluent resistance).
//   4. Confirmation: on the SAME touch candle, either a doji (body <=
//      DOJI_BODY_RATIO of its own range - the exact threshold already used
//      by starPatterns.js's "Doji Star" variant) or a bullish/bearish
//      engulfing pattern against the immediately preceding candle (standard
//      textbook definition: opposite colour, body fully covers the prior
//      candle's body - e.g. Bulkowski's "Encyclopedia of Candlestick
//      Charts"/Investopedia, not tuned on this project's data).
//   5. Entry at the OPEN of the candle after confirmation (no-lookahead,
//      same convention as every other mechanism here). Stop beyond the
//      touch candle's own extreme (and the preceding candle's, for the
//      engulfing case - "the candles that created the setup define its own
//      risk", already used by NWOG/Star Patterns). Fixed 1:3 R:R, 480 M15-
//      candle timeout (same conventions as FVG/Judas Swing/NWOG/EQH-EQL).

import { nyDayKey, weekKeyOf, monthKeyOf } from './dailyLevels.js';

export const TOLERANCE_PCT = 0.001; // 0.1% of price - same as equalHighsLows.js's EQUAL_TOLERANCE_PCT
export const DOJI_BODY_RATIO = 0.1; // same as starPatterns.js's DOJI_BODY_RATIO
export const MIN_FULL_DAY_CANDLES = 24; // same as dailyLevels.js
export const MIN_FULL_WEEK_CANDLES = 200; // same as dailyLevels.js
export const MIN_FULL_MONTH_CANDLES = 800; // ~4x the week threshold above (a month is ~4 weeks) - same discipline, not tuned
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

function body(c) { return Math.abs(c.close - c.open); }
function range(c) { return c.high - c.low; }
function isBullish(c) { return c.close > c.open; }
function isBearish(c) { return c.close < c.open; }

/** Exported for direct unit testing (test/htfSupportReversal.test.js) - no candle history needed to check these in isolation. */
export function isDoji(c) {
  const r = range(c);
  return r > 0 && body(c) <= DOJI_BODY_RATIO * r;
}

/** Standard textbook bullish engulfing: prev red, cur green, cur's body fully covers prev's body. */
export function isBullishEngulfing(prev, cur) {
  return isBearish(prev) && isBullish(cur) && cur.open <= prev.close && cur.close >= prev.open;
}

/** Mirror of isBullishEngulfing. */
export function isBearishEngulfing(prev, cur) {
  return isBullish(prev) && isBearish(cur) && cur.open >= prev.close && cur.close <= prev.open;
}

/**
 * One entry per candle: the previous COMPLETED period's {high, low}, or null
 * before the first full period closes. No lookahead - the value at index i
 * only ever reflects periods that closed strictly before candle i's own period.
 */
function buildRollingLevels(candles, keyOf, minFullCandles) {
  const perCandle = new Array(candles.length).fill(null);
  let currentKey = null;
  let currentGroup = null;
  let prevCompleted = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const k = keyOf(c);
    if (k !== currentKey) {
      if (currentGroup && currentGroup.count >= minFullCandles) {
        prevCompleted = { high: currentGroup.high, low: currentGroup.low };
      }
      currentKey = k;
      currentGroup = { high: c.high, low: c.low, count: 1 };
    } else {
      currentGroup.high = Math.max(currentGroup.high, c.high);
      currentGroup.low = Math.min(currentGroup.low, c.low);
      currentGroup.count++;
    }
    perCandle[i] = prevCompleted;
  }
  return perCandle;
}

/**
 * Among a timeframe-tagged list of levels of the same kind (all supports, or
 * all resistances), find one that BOTH (a) the given price is within
 * tolerance of, and (b) at least one other timeframe's level is also within
 * tolerance of - i.e. a confluent zone actually being touched right now.
 */
function findConfluentTouch(levels, price, tolerancePct) {
  for (const lvl of levels) {
    if (Math.abs(price - lvl.price) / lvl.price > tolerancePct) continue;
    const agreeing = levels.filter((o) => o !== lvl && Math.abs(o.price - lvl.price) / lvl.price <= tolerancePct);
    if (agreeing.length > 0) return { price: lvl.price, timeframes: [lvl.tf, ...agreeing.map((o) => o.tf)] };
  }
  return null;
}

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @param {number} [opts.tolerancePct]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number, pattern:string, timeframes:string[]}>}
 */
export function detectHtfConfluenceReversalEvents(candles, { tolerancePct = TOLERANCE_PCT } = {}) {
  const dayLevels = buildRollingLevels(candles, (c) => nyDayKey(c.time), MIN_FULL_DAY_CANDLES);
  const weekLevels = buildRollingLevels(candles, (c) => weekKeyOf(nyDayKey(c.time)), MIN_FULL_WEEK_CANDLES);
  const monthLevels = buildRollingLevels(candles, (c) => monthKeyOf(nyDayKey(c.time)), MIN_FULL_MONTH_CANDLES);

  const events = [];
  for (let i = 1; i < candles.length; i++) {
    const d = dayLevels[i];
    const w = weekLevels[i];
    const m = monthLevels[i];
    if (!d || !w || !m) continue; // not enough history yet for all three timeframes

    const c = candles[i];
    const prev = candles[i - 1];

    const supports = [{ tf: 'day', price: d.low }, { tf: 'week', price: w.low }, { tf: 'month', price: m.low }];
    const resistances = [{ tf: 'day', price: d.high }, { tf: 'week', price: w.high }, { tf: 'month', price: m.high }];

    const supportTouch = findConfluentTouch(supports, c.low, tolerancePct);
    if (supportTouch) {
      const doji = isDoji(c);
      const engulfing = isBullishEngulfing(prev, c);
      if (doji || engulfing) {
        events.push({
          index: i,
          direction: 'bullish',
          stopReference: Math.min(c.low, prev.low),
          pattern: doji ? 'doji' : 'bullish-engulfing',
          timeframes: supportTouch.timeframes,
        });
        continue; // one event per candle - don't also test resistance on the same bar
      }
    }

    const resistanceTouch = findConfluentTouch(resistances, c.high, tolerancePct);
    if (resistanceTouch) {
      const doji = isDoji(c);
      const engulfing = isBearishEngulfing(prev, c);
      if (doji || engulfing) {
        events.push({
          index: i,
          direction: 'bearish',
          stopReference: Math.max(c.high, prev.high),
          pattern: doji ? 'doji' : 'bearish-engulfing',
          timeframes: resistanceTouch.timeframes,
        });
      }
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runHtfSupportReversalBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectHtfConfluenceReversalEvents(candles, opts);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

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

    if (!open) {
      const signalIndex = i - 1;
      const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;
      if (event) {
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
            pattern: event.pattern,
            timeframes: event.timeframes,
          };
        }
      }
    }
  }
  return trades;
}
