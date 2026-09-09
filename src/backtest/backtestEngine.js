// backtestEngine.js
// Replays historical candles through the EXACT SAME FvgEngine used live, then
// simulates trade management (stop-loss / take-profit) to produce real
// statistics: win rate, expectancy, drawdown, profit factor.
//
// Explicit assumptions (read before trusting the numbers):
//   - Entry price = the near edge of the FVG zone (zone.top for a bullish
//     setup, zone.bottom for bearish) - i.e. a resting limit order at the
//     first point price re-enters the gap, which is the realistic ICT
//     re-entry execution, not the candle close.
//   - Exactly ONE open trade per symbol at a time: a new validated signal is
//     ignored while a trade from a previous signal is still open (mirrors
//     "you can only take one setup at a time" and avoids overlapping,
//     hard-to-attribute P&L).
//   - Stop/target resolution is checked starting the candle AFTER entry
//     (avoids look-ahead bias from using the entry candle's own range).
//   - If a single candle's range touches BOTH stop and target, the stop is
//     assumed to have been hit first (conservative — avoids overstating
//     performance from an unknowable intra-candle path).
//   - A trade still open after `maxHoldingCandles` is closed at that
//     candle's close price and marked 'timeout' (counted separately from
//     win/loss in the summary, not silently folded into either).

export function computeStop({ direction, zone, candles, c1Index, stopMode, swingLookback = 10 }) {
  if (stopMode === 'swing' && c1Index >= 0) {
    const start = Math.max(0, c1Index - swingLookback + 1);
    const window = candles.slice(start, c1Index + 1);
    if (window.length > 0) {
      return direction === 'bullish'
        ? Math.min(...window.map((c) => c.low))
        : Math.max(...window.map((c) => c.high));
    }
  }
  // fvg-edge (default / fallback): a small buffer beyond the far edge of the gap
  const zoneHeight = zone.top - zone.bottom;
  const buffer = zoneHeight * 0.1;
  return direction === 'bullish' ? zone.bottom - buffer : zone.top + buffer;
}

/**
 * @param {object} params
 * @param {Array} params.candles - chronological OHLC candles for one symbol
 * @param {string} params.symbol
 * @param {object} params.fvgEngine - a fresh FvgEngine instance for this symbol
 * @param {'fvg-edge'|'swing'} params.stopMode
 * @param {number} params.rrMultiple - e.g. 2 for a 1:2 risk/reward target
 * @param {number} [params.swingLookback]
 * @param {number} [params.maxHoldingCandles]
 */
export function runBacktest({
  candles,
  symbol,
  fvgEngine,
  stopMode,
  rrMultiple,
  swingLookback = 10,
  maxHoldingCandles = 480,
}) {
  const formationIndexByFvgId = new Map();
  const trades = [];
  let openTrade = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1) Resolve an already-open trade using this candle, if it's not the entry candle itself.
    if (openTrade && i > openTrade.entryIndex) {
      const hitStop =
        openTrade.direction === 'bullish' ? candle.low <= openTrade.stopPrice : candle.high >= openTrade.stopPrice;
      const hitTarget =
        openTrade.direction === 'bullish' ? candle.high >= openTrade.targetPrice : candle.low <= openTrade.targetPrice;
      const timedOut = i - openTrade.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, rMultiple;
        if (hitStop) {
          outcome = 'loss'; // stop wins ties, per documented conservative assumption
          exitPrice = openTrade.stopPrice;
          rMultiple = -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = openTrade.targetPrice;
          rMultiple = rrMultiple;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
          const signedMove = openTrade.direction === 'bullish' ? exitPrice - openTrade.entryPrice : openTrade.entryPrice - exitPrice;
          rMultiple = signedMove / openTrade.distance;
        }
        trades.push({ ...openTrade, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        openTrade = null;
      }
    }

    // 2) Feed the candle to the FVG engine and act on its events.
    const events = fvgEngine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexByFvgId.set(e.id, i); // i = index of c3 (the candle that completed the gap)
      } else if (e.type === 'validated' && !openTrade) {
        const c3Index = formationIndexByFvgId.get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({
          direction: e.direction,
          zone: e.zone,
          candles,
          c1Index,
          stopMode,
          swingLookback,
        });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue; // degenerate zone, skip rather than divide by zero downstream
        const targetPrice =
          e.direction === 'bullish' ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;

        openTrade = {
          symbol,
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
        };
      }
    }
  }

  return trades;
}

/**
 * Variant of runBacktest() that lifts the "at most ONE open trade per
 * symbol" netting rule (see the project-wide netting discipline documented
 * in liveStrategyEngine.js / HANDOFF.md) and instead allows up to
 * `maxConcurrentPositions` open at once - answers "how many signals does
 * netting actually block, and is it worth relaxing?" empirically (2026-09,
 * at the user's explicit question after the forward-test's low trade count:
 * "et si on retire le netting, et on accepte 2 positions à la fois?").
 *
 * Same entry/stop/target logic as runBacktest() (identical FvgEngine
 * events, identical no-lookahead resolution order), the ONLY difference is
 * the entry gate: `openTrades.length < maxConcurrentPositions` instead of
 * `!openTrade`. maxConcurrentPositions=1 reproduces runBacktest() exactly
 * (kept as a SEPARATE function rather than folding this into runBacktest()
 * itself, so the heavily-tested original stays untouched and this stays
 * opt-in).
 *
 * Caveat worth knowing before trusting the numbers: summarizeTrades()'s
 * maxDrawdownR walks the trade array in EXIT order and adds one trade's R at
 * a time - a fair approximation when at most one trade is ever open, but an
 * UNDERSTATEMENT here: two positions open at once both carry live risk
 * simultaneously (up to 2R exposed, not 1R) between their entries and
 * whichever exits first. Reported drawdown is therefore a lower bound, not
 * the true worst case, when maxConcurrentPositions > 1.
 */
export function runBacktestMultiPosition({
  candles,
  symbol,
  fvgEngine,
  stopMode,
  rrMultiple,
  maxConcurrentPositions = 1,
  swingLookback = 10,
  maxHoldingCandles = 480,
}) {
  const formationIndexByFvgId = new Map();
  const trades = [];
  let openTrades = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1) Resolve any already-open trade using this candle (skip the entry
    // candle itself, same no-lookahead rule as runBacktest). Iterate over a
    // snapshot since trades close mid-loop.
    const stillOpen = [];
    for (const t of openTrades) {
      if (i <= t.entryIndex) { stillOpen.push(t); continue; }
      const hitStop = t.direction === 'bullish' ? candle.low <= t.stopPrice : candle.high >= t.stopPrice;
      const hitTarget = t.direction === 'bullish' ? candle.high >= t.targetPrice : candle.low <= t.targetPrice;
      const timedOut = i - t.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, rMultiple;
        if (hitStop) {
          outcome = 'loss';
          exitPrice = t.stopPrice;
          rMultiple = -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = t.targetPrice;
          rMultiple = rrMultiple;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
          const signedMove = t.direction === 'bullish' ? exitPrice - t.entryPrice : t.entryPrice - exitPrice;
          rMultiple = signedMove / t.distance;
        }
        trades.push({ ...t, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
      } else {
        stillOpen.push(t);
      }
    }
    openTrades = stillOpen;

    // 2) Feed the candle to the FVG engine and act on its events.
    const events = fvgEngine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexByFvgId.set(e.id, i);
      } else if (e.type === 'validated' && openTrades.length < maxConcurrentPositions) {
        const c3Index = formationIndexByFvgId.get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({
          direction: e.direction,
          zone: e.zone,
          candles,
          c1Index,
          stopMode,
          swingLookback,
        });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        const targetPrice =
          e.direction === 'bullish' ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;

        openTrades.push({
          symbol,
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
        });
      }
    }
  }

  trades.sort((a, b) => a.exitIndex - b.exitIndex);
  return trades;
}

/**
 * Variant of runBacktest() that adds active trade management on top of the
 * same fixed stop/target signals - answers "can we do better within the
 * winners and worse within the losers than a pure fixed 1:3?" empirically
 * instead of assuming. Two modes, both applied only AFTER the entry candle
 * (same no-lookahead discipline as runBacktest):
 *
 *   'breakeven' - once price has moved `breakevenAtR` x the original risk in
 *     the trade's favor (checked via that candle's high/low), the stop is
 *     moved to the entry price for every subsequent candle. A trade that
 *     later reverses exits at 0R (scratch) instead of -1R. A trade that
 *     never pulls back still hits the original `rrMultiple` target unchanged.
 *     Within the SAME candle that first reaches breakevenAtR, the ORIGINAL
 *     stop is still what's checked (conservative - avoids assuming the move
 *     to breakeven happened before an intra-candle stop hit); the new stop
 *     only applies starting the next candle.
 *
 *   'partial' - once price reaches `partialAtR` x the original risk, HALF the
 *     position is closed there (contributing 0.5 * partialAtR to the trade's
 *     blended R), and the stop for the remaining half moves to breakeven
 *     (same conservative same-candle ordering as above). The remaining half
 *     then continues toward the original `rrMultiple` target, or scratches
 *     at breakeven, or times out - contributing 0.5 * that outcome's R.
 *     A trade whose stop is hit before ever reaching `partialAtR` behaves
 *     exactly like the unmanaged baseline: full -1R, no partial taken.
 *
 *   'pyramid' - once price reaches `addAtR` x the original risk, a SECOND
 *     unit of the SAME size is added at that price, and the stop for BOTH
 *     units together moves to the original entry price (breakeven). The
 *     added unit thus risks its own full 1R (from its entry down/up to
 *     breakeven) exactly like the original unit did - this is symmetric
 *     pyramiding, not "free" size. Because the added unit's entry sits
 *     `addAtR` above (bullish) the original entry, its R relative to the
 *     SAME risk-unit distance is always (finalLegR - addAtR), whatever the
 *     original leg's final outcome (target/breakeven/timeout) - so the
 *     combined trade R is `2 * finalLegR - addAtR` once pyramided, or just
 *     `finalLegR` (unchanged from baseline) if the stop was hit before ever
 *     reaching `addAtR`. IMPORTANT: a pyramided trade deploys TWICE the
 *     normal dollar risk from the add point onward - its R-multiple is not
 *     directly comparable to a fixed single-unit trade's R without also
 *     accounting for that doubled exposure (see runTradeManagementComparison.js).
 *
 * Trades keep the same shape as runBacktest()'s output (symbol, direction,
 * entryIndex/Time/Price, stopPrice, targetPrice, distance, outcome,
 * rMultiple, exitIndex/Time/Price) so they flow through withNet()/
 * summarizeTrades()/applyTransactionCosts() unchanged. `outcome` reflects
 * the FINAL exit of the (remaining) position; `managementOutcome` records
 * what happened to the first half in 'partial' mode ('partial-then-target' /
 * 'partial-then-breakeven' / 'partial-then-timeout' / null if stopped out
 * before the partial level).
 */
export function runBacktestManaged({
  candles,
  symbol,
  fvgEngine,
  stopMode,
  rrMultiple,
  mode, // 'breakeven' | 'partial' | 'pyramid'
  breakevenAtR = 1,
  partialAtR = 1,
  addAtR = 1,
  swingLookback = 10,
  maxHoldingCandles = 480,
}) {
  const formationIndexByFvgId = new Map();
  const trades = [];
  let openTrade = null;

  const closeTrade = (i, candle, outcome, exitPrice, rMultiple, extra = {}) => {
    trades.push({ ...openTrade, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple, ...extra });
    openTrade = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (openTrade && i > openTrade.entryIndex) {
      const t = openTrade;
      const bullish = t.direction === 'bullish';
      const effectiveStop = t.movedToBreakeven ? t.entryPrice : t.stopPrice;

      const hitStop = bullish ? candle.low <= effectiveStop : candle.high >= effectiveStop;
      const hitTarget = bullish ? candle.high >= t.targetPrice : candle.low <= t.targetPrice;
      const timedOut = i - t.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let finalLegR, outcome, exitPrice;
        if (hitStop) {
          outcome = t.movedToBreakeven ? 'breakeven' : 'loss';
          exitPrice = effectiveStop;
          finalLegR = t.movedToBreakeven ? 0 : -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = t.targetPrice;
          finalLegR = rrMultiple;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - t.entryPrice : t.entryPrice - exitPrice;
          finalLegR = signedMove / t.distance;
        }

        if (mode === 'partial' && t.partialTaken) {
          // First half already closed at partialAtR; remaining half resolves now.
          const blendedR = 0.5 * t.partialLegR + 0.5 * finalLegR;
          const managementOutcome = `partial-then-${outcome}`;
          closeTrade(i, candle, outcome, exitPrice, blendedR, { managementOutcome });
        } else if (mode === 'pyramid' && t.pyramidAdded) {
          // Added unit's entry sits addAtR above/below the original entry, on
          // the SAME risk-unit distance, so its own R is always
          // (finalLegR - addAtR) regardless of which outcome resolved it -
          // both units share the same stop/target/timeout event once pyramided.
          const combinedR = finalLegR + (finalLegR - t.pyramidAddAtR);
          const managementOutcome = `pyramid-then-${outcome}`;
          closeTrade(i, candle, outcome, exitPrice, combinedR, { managementOutcome, unitsDeployed: 2 });
        } else {
          closeTrade(i, candle, outcome, exitPrice, finalLegR, { managementOutcome: null, unitsDeployed: 1 });
        }
        continue; // trade closed this candle - don't also process management triggers below
      }

      // Not closed this candle - check whether a management trigger is newly
      // reached (applies starting NEXT candle, per the conservative
      // same-candle ordering documented above).
      if (mode === 'breakeven' && !t.movedToBreakeven) {
        const favorPrice = bullish ? candle.high : candle.low;
        const moveInFavor = bullish ? favorPrice - t.entryPrice : t.entryPrice - favorPrice;
        if (moveInFavor >= breakevenAtR * t.distance) t.movedToBreakeven = true;
      } else if (mode === 'partial' && !t.partialTaken) {
        const favorPrice = bullish ? candle.high : candle.low;
        const moveInFavor = bullish ? favorPrice - t.entryPrice : t.entryPrice - favorPrice;
        if (moveInFavor >= partialAtR * t.distance) {
          t.partialTaken = true;
          t.partialLegR = partialAtR;
          t.movedToBreakeven = true; // remaining half's stop moves to breakeven
        }
      } else if (mode === 'pyramid' && !t.pyramidAdded) {
        const favorPrice = bullish ? candle.high : candle.low;
        const moveInFavor = bullish ? favorPrice - t.entryPrice : t.entryPrice - favorPrice;
        if (moveInFavor >= addAtR * t.distance) {
          t.pyramidAdded = true;
          t.pyramidAddAtR = addAtR;
          t.movedToBreakeven = true; // BOTH units' stop moves to the original entry
        }
      }
    }

    const events = fvgEngine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexByFvgId.set(e.id, i);
      } else if (e.type === 'validated' && !openTrade) {
        const c3Index = formationIndexByFvgId.get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles, c1Index, stopMode, swingLookback });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        const targetPrice =
          e.direction === 'bullish' ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;

        openTrade = {
          symbol,
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          movedToBreakeven: false,
          partialTaken: false,
          partialLegR: 0,
          pyramidAdded: false,
          pyramidAddAtR: 0,
        };
      }
    }
  }

  return trades;
}

/**
 * runBacktestPyramidIndependentStops() — a SECOND, different pyramid design,
 * built to answer a direct question: is there a better way to pyramid that
 * does NOT move the ORIGINAL unit's stop to breakeven?
 *
 * The 'pyramid' mode in runBacktestManaged() above shares ONE stop between
 * both units once the add triggers (both jump to the original entry price).
 * That has a real cost, confirmed in trade-management-comparison.md and
 * pyramid-account-impact.md: a pullback all the way back to the original
 * entry price closes BOTH units right there - including the ORIGINAL unit,
 * which in the unmanaged baseline would have kept its ORIGINAL (wider) stop
 * and stayed open, free to still recover and hit its target later. Moving
 * the original unit's stop early is what converts some would-be winners
 * into real losses.
 *
 * This mode fixes exactly that: once price reaches `addAtR` x the original
 * risk, a second unit is added (same size, same distance-based risk D as
 * the original), but the two units are now fully INDEPENDENT positions from
 * that point on:
 *   - The ORIGINAL unit's stop and target are NEVER touched - it behaves
 *     exactly as if pyramiding never happened, target `rrMultiple` x D away.
 *   - The ADDED unit is a brand-new, ordinary trade: entered at (original
 *     entry + addAtR x D), with its OWN normal stop exactly D below/above
 *     ITS OWN entry (which numerically lands on the original entry price -
 *     that is just geometry, not a "move to breakeven": it is a fresh
 *     stop-loss for a fresh position, sized the same way every other trade
 *     in this project is sized). Its target is the SAME final target price
 *     as the original unit (so both aim at the same anticipated move).
 *   - The two units are resolved INDEPENDENTLY: the added unit stopping out
 *     does not touch the original unit, and vice versa. A trade record is
 *     only finalized once BOTH legs (or just the original, if the add never
 *     triggered) have resolved.
 *
 * Combined R is reported in the SAME units as the 'pyramid' mode above
 * (both legs' R normalized to the original distance D) so the two designs
 * are directly comparable: a full win on both legs is again 3 + (3-1) = 5;
 * the difference only shows up when the added leg is stopped out while the
 * original later still recovers to its own target - impossible to happen
 * under the shared-stop 'pyramid' mode, since that mode closes both legs
 * the instant EITHER a shared stop or shared target is touched.
 */
export function runBacktestPyramidIndependentStops({
  candles,
  symbol,
  fvgEngine,
  stopMode,
  rrMultiple,
  addAtR = 1,
  swingLookback = 10,
  maxHoldingCandles = 480,
}) {
  const formationIndexByFvgId = new Map();
  const trades = [];
  let original = null; // { entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance, direction, resolved, legR, outcome }
  let added = null; // same shape, or null before the add triggers

  const resolveLeg = (leg, i, candle) => {
    const bullish = leg.direction === 'bullish';
    const hitStop = bullish ? candle.low <= leg.stopPrice : candle.high >= leg.stopPrice;
    const hitTarget = bullish ? candle.high >= leg.targetPrice : candle.low <= leg.targetPrice;
    const timedOut = i - leg.entryIndex >= maxHoldingCandles;
    if (!hitStop && !hitTarget && !timedOut) return false;
    if (hitStop) { leg.outcome = 'loss'; leg.legR = -1; leg.exitPrice = leg.stopPrice; }
    else if (hitTarget) {
      leg.outcome = 'win';
      leg.exitPrice = leg.targetPrice;
      leg.legR = (bullish ? leg.exitPrice - leg.entryPrice : leg.entryPrice - leg.exitPrice) / leg.distance;
    } else {
      leg.outcome = 'timeout';
      leg.exitPrice = candle.close;
      leg.legR = (bullish ? leg.exitPrice - leg.entryPrice : leg.entryPrice - leg.exitPrice) / leg.distance;
    }
    leg.exitIndex = i;
    leg.exitTime = candle.time;
    leg.resolved = true;
    return true;
  };

  const finalizeIfDone = () => {
    if (!original || !original.resolved) return;
    if (added && !added.resolved) return;
    const combinedR = original.legR + (added ? added.legR : 0);
    trades.push({
      symbol,
      direction: original.direction,
      entryIndex: original.entryIndex,
      entryTime: original.entryTime,
      entryPrice: original.entryPrice,
      stopPrice: original.stopPrice,
      targetPrice: original.targetPrice,
      distance: original.distance,
      exitIndex: Math.max(original.exitIndex, added ? added.exitIndex : original.exitIndex),
      exitTime: added && added.exitTime > original.exitTime ? added.exitTime : original.exitTime,
      outcome: original.outcome, // the ORIGINAL unit's own outcome, unaffected by the added unit
      rMultiple: combinedR,
      unitsDeployed: added ? 2 : 1,
      managementOutcome: added ? `pyramid-independent-${original.outcome}-${added.outcome}` : null,
    });
    original = null;
    added = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (original && !original.resolved && i > original.entryIndex) resolveLeg(original, i, candle);
    if (added && !added.resolved && i > added.entryIndex) resolveLeg(added, i, candle);
    finalizeIfDone();

    // Look for a new pyramid add: original must still be open, unresolved, and no add yet this trade.
    if (original && !original.resolved && !added) {
      const bullish = original.direction === 'bullish';
      const favorPrice = bullish ? candle.high : candle.low;
      const moveInFavor = bullish ? favorPrice - original.entryPrice : original.entryPrice - favorPrice;
      if (moveInFavor >= addAtR * original.distance) {
        const addEntryPrice = bullish
          ? original.entryPrice + addAtR * original.distance
          : original.entryPrice - addAtR * original.distance;
        // The added unit's own stop is exactly `distance` away from ITS OWN entry - an ordinary,
        // full-sized stop-loss for a fresh position, not a breakeven move on the original unit.
        // It happens to land on the original entry price, which is just geometry (addAtR=1).
        const addStopPrice = bullish ? addEntryPrice - original.distance : addEntryPrice + original.distance;
        added = {
          direction: original.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice: addEntryPrice,
          stopPrice: addStopPrice,
          targetPrice: original.targetPrice, // aims at the same anticipated move as the original unit
          distance: original.distance,
          resolved: false,
        };
      }
    }

    const events = fvgEngine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexByFvgId.set(e.id, i);
      } else if (e.type === 'validated' && !original) {
        const c3Index = formationIndexByFvgId.get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles, c1Index, stopMode, swingLookback });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        original = {
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          resolved: false,
        };
      }
    }
  }

  return trades;
}

export function summarizeTrades(trades) {
  const resolved = trades.filter((t) => t.outcome !== 'timeout');
  const wins = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome === 'loss').length;
  const timeouts = trades.filter((t) => t.outcome === 'timeout').length;

  const winRate = resolved.length > 0 ? wins / resolved.length : null;

  const sumR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const avgR = trades.length > 0 ? sumR / trades.length : null;

  const grossWinR = trades.filter((t) => t.rMultiple > 0).reduce((s, t) => s + t.rMultiple, 0);
  const grossLossR = Math.abs(trades.filter((t) => t.rMultiple < 0).reduce((s, t) => s + t.rMultiple, 0));
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? Infinity : null;

  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  const equityCurve = [];
  for (const t of trades) {
    equity += t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    equityCurve.push(equity);
  }

  return {
    totalSignals: trades.length,
    wins,
    losses,
    timeouts,
    winRate,
    avgR,
    expectancyR: avgR, // same figure, named for clarity in reports
    profitFactor,
    maxDrawdownR,
    finalEquityR: equity,
    equityCurve,
  };
}
