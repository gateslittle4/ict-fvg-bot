// dynamicLiquidityTarget.js
// EXPERIMENTAL variant of the FVG target computation (backtestEngine.js's
// runBacktest(), which always uses a FIXED rrMultiple) - built ONLY to test
// a proposed rule change, NOT wired into production or the live bot.
//
// Esdras (2026-09-16), direct follow-up to the STILL-OPEN research question
// already logged in HANDOFF.md ("Question ouverte d'Esdras... peut-on
// trouver un moyen de savoir AVANT si le marché va vraiment jusqu'à 1:4/1:5,
// pour garder le taux de gain aussi haut qu'à 1:3?"): it was already
// verified there that 100% of the win-rate drop at extended RR (1:4/1:5)
// comes from trades that WERE winning at 1:3 but reversed all the way back
// to the original stop before reaching the fixed extended target - never
// new direct losses. Proposed fix, never implemented until now: an ICT
// "draw on liquidity" DYNAMIC target - instead of a fixed R multiple, the
// target is the nearest CONFIRMED, still-unswept opposite-side swing point
// (a resting liquidity pool) beyond the entry, clamped to a sane
// [minRRMultiple, maxRRMultiple] band so a target that's absurdly close or
// absurdly far doesn't distort the trade. Falls back to a fixed
// fallbackRRMultiple when no valid liquidity level exists within range.
//
// Same entry/stop logic as backtestEngine.js's runBacktest() (identical
// FvgEngine/MultiTouchFvgEngine event stream, identical computeStop()) - the
// ONLY thing that changes is how the target price is picked.

import { detectSwingPoints } from './marketStructure.js';
import { computeStop } from './backtestEngine.js';

/**
 * Builds a stateful, forward-only lookup `(entryIndex, direction, entryPrice) =>
 * nearestLevel|null` that tracks which confirmed swing highs/lows are still
 * "resting" (unswept) at any given point in time - the ICT "draw on
 * liquidity" pools a trade could realistically be aiming for. Must be
 * called with non-decreasing entryIndex (same discipline as
 * makeStructureBiasLookup() in marketStructure.js).
 *
 * A swing point becomes "active" the candle it's confirmed (confirmedIndex,
 * same no-lookahead discipline as the structure-bias filter), and is
 * removed the moment any later candle's high/low trades through it (that
 * liquidity has already been taken, it's no longer a valid future target).
 *
 * @param {Array} candles
 * @param {object} [opts]
 * @param {number} [opts.swingLookback]
 */
export function buildLiquidityTargetLookup(candles, { swingLookback = 5 } = {}) {
  const swingPoints = detectSwingPoints(candles, swingLookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  let cursor = 0;
  const activeHighs = [];
  const activeLows = [];

  function advanceTo(targetIndex) {
    while (cursor <= targetIndex && cursor < candles.length) {
      const newly = byConfirmedIndex.get(cursor);
      if (newly) {
        for (const p of newly) {
          if (p.type === 'high') activeHighs.push(p);
          else activeLows.push(p);
        }
      }
      const c = candles[cursor];
      for (let k = activeHighs.length - 1; k >= 0; k--) {
        if (c.high >= activeHighs[k].price) activeHighs.splice(k, 1);
      }
      for (let k = activeLows.length - 1; k >= 0; k--) {
        if (c.low <= activeLows[k].price) activeLows.splice(k, 1);
      }
      cursor++;
    }
  }

  return function lookup(entryIndex, direction, entryPrice) {
    advanceTo(entryIndex);
    const pool = direction === 'bullish' ? activeHighs : activeLows;
    let best = null;
    for (const p of pool) {
      if (direction === 'bullish' ? p.price <= entryPrice : p.price >= entryPrice) continue;
      if (best === null || (direction === 'bullish' ? p.price < best : p.price > best)) best = p.price;
    }
    return best;
  };
}

/**
 * @returns {{targetPrice:number, rrMultipleUsed:number, usedLiquidity:boolean, rawRR:number|null}}
 */
export function computeDynamicTarget({
  direction,
  entryPrice,
  distance,
  entryIndex,
  liquidityLookup,
  minRRMultiple = 1.5,
  maxRRMultiple = 6,
  fallbackRRMultiple = 3,
}) {
  const level = liquidityLookup(entryIndex, direction, entryPrice);
  if (level === null) {
    return {
      targetPrice: direction === 'bullish' ? entryPrice + fallbackRRMultiple * distance : entryPrice - fallbackRRMultiple * distance,
      rrMultipleUsed: fallbackRRMultiple,
      usedLiquidity: false,
      rawRR: null,
    };
  }
  const rawRR = Math.abs(level - entryPrice) / distance;
  const clampedRR = Math.min(Math.max(rawRR, minRRMultiple), maxRRMultiple);
  return {
    targetPrice: direction === 'bullish' ? entryPrice + clampedRR * distance : entryPrice - clampedRR * distance,
    rrMultipleUsed: clampedRR,
    usedLiquidity: true,
    rawRR,
  };
}

/**
 * Same shape/discipline as backtestEngine.js's runBacktest() (one open trade
 * per symbol, stop resolution starts the candle AFTER entry, stop wins ties,
 * timeout at maxHoldingCandles) - only the target is computed dynamically
 * per-trade instead of via a fixed rrMultiple.
 */
export function runBacktestDynamicTarget({
  candles,
  symbol,
  fvgEngine,
  stopMode,
  swingLookback = 10,
  liquiditySwingLookback = 5,
  minRRMultiple = 1.5,
  maxRRMultiple = 6,
  fallbackRRMultiple = 3,
  maxHoldingCandles = 480,
}) {
  const liquidityLookup = buildLiquidityTargetLookup(candles, { swingLookback: liquiditySwingLookback });
  const formationIndexByFvgId = new Map();
  const trades = [];
  let openTrade = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (openTrade && i > openTrade.entryIndex) {
      const hitStop =
        openTrade.direction === 'bullish' ? candle.low <= openTrade.stopPrice : candle.high >= openTrade.stopPrice;
      const hitTarget =
        openTrade.direction === 'bullish' ? candle.high >= openTrade.targetPrice : candle.low <= openTrade.targetPrice;
      const timedOut = i - openTrade.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, rMultiple;
        if (hitStop) {
          outcome = 'loss';
          exitPrice = openTrade.stopPrice;
          rMultiple = -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = openTrade.targetPrice;
          rMultiple = openTrade.rrMultipleUsed;
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

        const { targetPrice, rrMultipleUsed, usedLiquidity, rawRR } = computeDynamicTarget({
          direction: e.direction,
          entryPrice,
          distance,
          entryIndex: i,
          liquidityLookup,
          minRRMultiple,
          maxRRMultiple,
          fallbackRRMultiple,
        });

        openTrade = {
          symbol,
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultipleUsed,
          usedLiquidity,
          rawRR,
        };
      }
    }
  }

  return trades;
}
