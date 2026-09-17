// silverBullet.js
// ICT "Silver Bullet" as its OWN standalone mechanism — genuinely distinct
// from what this project already runs under that name. Today, `config.js`'s
// SILVER_BULLET_WINDOW is used only as a SESSION FILTER bolted onto the
// regular, continuously-running FVG engine: it lets through any already-
// active FVG (which may have formed hours or days earlier) if the candle
// that happens to VALIDATE it falls in the 10:00-11:00 NY window. ICT's own
// published Silver Bullet recipe is narrower and more specific than that:
//   1. A market structure shift (MSS) — a break of a recent swing point —
//      must occur, and
//   2. The Fair Value Gap left behind by that MSS must itself FORM inside
//      the one-hour killzone (not just be touched during it), and
//   3. The trade is taken in the direction of that same-window MSS.
// This module requires all three, using ONLY machinery already built and
// validated elsewhere in this project (no new invented parameters):
//   - The killzone itself: SILVER_BULLET_WINDOW (10:00-11:00 NY), copied
//     verbatim from config.js — ICT's own canonical "AM Silver Bullet" hour,
//     not re-picked here.
//   - The MSS/structure-agreement check: marketStructure.js's
//     buildStructureBiasSeries()/makeStructureBiasLookup() (symmetric-
//     fractal swing pivots, lookback=5, close-through-swing flip) — the
//     exact same "break of structure" definition already used by the
//     Structure filter and by Breaker Block's `detectBosEvents`.
//   - The FVG definition itself: the identical 3-candle imbalance test as
//     src/engines/fvgEngine.js (c1.high < c3.low / c1.low > c3.high),
//     reimplemented inline here (that engine is stateful/live-oriented and
//     awkward to constrain to "formed inside a specific hour", so the same
//     published gap definition is copied rather than the class reused).
//   - Stop placement: the project's own 'fvg-edge' convention from
//     backtestEngine.js's computeStop() — a 10% buffer beyond the gap's far
//     edge — copied verbatim, not re-decided here.
//   - Fixed 1:3 R:R, 480 M15-candle timeout, next-candle-open entry, one
//     open position at a time: same conventions as every other exploratory
//     script in this project.
//
// Tested on all available instruments — a killzone-timing pattern has no a
// priori reason to be limited to the indices/gold.

import { buildStructureBiasSeries, makeStructureBiasLookup } from './marketStructure.js';
import { isInNySessionWindow } from './nySession.js';

export const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 }; // NY local time — ICT's own published AM Silver Bullet hour, copied from config.js
export const STRUCTURE_LOOKBACK = 5; // matches marketStructure.js's own default
export const FVG_MAX_AGE_CANDLES = 50; // matches fvgEngine.js's own default staleness window
export const FVG_EDGE_BUFFER_PCT = 0.1; // matches backtestEngine.js's computeStop() 'fvg-edge' buffer
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/**
 * @returns {Array<{formedIndex:number, direction:'bullish'|'bearish', zone:{top:number,bottom:number}}>}
 *   one entry per Silver Bullet-eligible FVG: formed inside the killzone
 *   window AND agreeing with the structure bias active at formation time.
 */
export function detectSilverBulletFvgs(candles, { sessionWindow = SILVER_BULLET_WINDOW, structureLookback = STRUCTURE_LOOKBACK } = {}) {
  const biasSeries = buildStructureBiasSeries(candles, { lookback: structureLookback });
  const biasLookup = makeStructureBiasLookup(biasSeries);

  const eligible = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (!isInNySessionWindow(c3.time, sessionWindow.startHour, sessionWindow.endHour)) continue;

    let direction = null;
    let zone = null;
    if (c1.high < c3.low) {
      direction = 'bullish';
      zone = { top: c3.low, bottom: c1.high };
    } else if (c1.low > c3.high) {
      direction = 'bearish';
      zone = { top: c1.low, bottom: c3.high };
    }
    if (!direction) continue;

    const bias = biasLookup(c3.time);
    if (bias !== direction) continue; // no same-direction MSS active yet - not a Silver Bullet setup, just an ordinary gap

    eligible.push({ formedIndex: i, direction, zone });
  }
  return eligible;
}

/**
 * Position-agnostic candidate detector - the "wait for mitigation, entry
 * next candle" walk over detectSilverBulletFvgs()'s own eligible zones,
 * extracted verbatim from liveStrategyEngine.js's own
 * `_computeSilverBulletCandidates()` (2026-09-17, moved here so
 * tradeCompliance.js's checklist reconstruction and the live engine share
 * ONE implementation instead of two copies that could silently drift - same
 * discipline as detectNwogEvents/detectJudasSwingEvents/
 * detectWeeklySweepEvents/computeBreakerBlockCandidates already being the
 * single source of truth for their own mechanisms). Same shape as those:
 * {direction, entryTime, stopReference}[].
 * @returns {Array<{direction:'bullish'|'bearish', entryTime:number, stopReference:number}>}
 */
export function computeSilverBulletCandidates(candles) {
  return runSilverBulletStateMachine(candles).candidates;
}

/**
 * Same active-zone/mitigation walk as computeSilverBulletCandidates(), but
 * also returns the TRAILING state after the last candle - "what is this
 * mechanism currently watching, right now" (2026-09-17, Esdras: "je veux le
 * suivre de façon live"). A zone mitigated on the very LAST candle produces
 * no candidate yet (its entry needs a candle that hasn't printed), so
 * computeSilverBulletCandidates() alone would silently drop it - here it
 * surfaces as phase 'pendingEntry' instead, exactly the "entry about to
 * fire" moment a live viewer wants to see.
 * @returns {{candidates: Array, phase: 'idle'|'active'|'pendingEntry', detail: object|Array|null}}
 */
export function runSilverBulletStateMachine(candles) {
  const eligibleFvgs = detectSilverBulletFvgs(candles);
  const fvgsByFormedIndex = new Map();
  for (const f of eligibleFvgs) {
    if (!fvgsByFormedIndex.has(f.formedIndex)) fvgsByFormedIndex.set(f.formedIndex, []);
    fvgsByFormedIndex.get(f.formedIndex).push(f);
  }

  const candidates = [];
  let active = []; // { direction, zone, candlesSinceFormed }
  let pendingMitigation = null; // set when the LAST candle mitigates a zone with no next candle yet to enter on

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    const stillActive = [];
    let mitigated = null;
    for (const fvg of active) {
      fvg.candlesSinceFormed += 1;
      const enteredZone = fvg.direction === 'bullish' ? candle.low <= fvg.zone.top : candle.high >= fvg.zone.bottom;
      if (enteredZone) {
        if (!mitigated) mitigated = fvg; // only ever act on the first one this candle
        continue; // consumed either way - mitigated zones aren't re-tradeable
      }
      if (fvg.candlesSinceFormed < FVG_MAX_AGE_CANDLES) stillActive.push(fvg);
    }
    active = stillActive;

    if (mitigated) {
      const entryIndex = i + 1;
      if (entryIndex < candles.length) {
        const bullish = mitigated.direction === 'bullish';
        const zoneHeight = mitigated.zone.top - mitigated.zone.bottom;
        const buffer = zoneHeight * FVG_EDGE_BUFFER_PCT;
        const stopReference = bullish ? mitigated.zone.bottom - buffer : mitigated.zone.top + buffer;
        candidates.push({ direction: mitigated.direction, entryTime: candles[entryIndex].time, stopReference });
        pendingMitigation = null;
      } else {
        pendingMitigation = mitigated; // mitigated on the last candle available - entry fires on the NEXT one, not printed yet
      }
    }

    const newlyFormed = fvgsByFormedIndex.get(i);
    if (newlyFormed) {
      for (const f of newlyFormed) active.push({ direction: f.direction, zone: f.zone, candlesSinceFormed: 0 });
    }
  }

  if (pendingMitigation) return { candidates, phase: 'pendingEntry', detail: pendingMitigation };
  if (active.length > 0) return { candidates, phase: 'active', detail: active };
  return { candidates, phase: 'idle', detail: null };
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runSilverBulletBacktest(candles, opts = {}) {
  const {
    sessionWindow = SILVER_BULLET_WINDOW,
    structureLookback = STRUCTURE_LOOKBACK,
    maxAgeCandles = FVG_MAX_AGE_CANDLES,
    rrMultiple = RR_MULTIPLE,
    maxHoldingCandles = MAX_HOLDING_CANDLES,
  } = opts;

  const eligibleFvgs = detectSilverBulletFvgs(candles, { sessionWindow, structureLookback });
  const fvgsByFormedIndex = new Map();
  for (const f of eligibleFvgs) {
    if (!fvgsByFormedIndex.has(f.formedIndex)) fvgsByFormedIndex.set(f.formedIndex, []);
    fvgsByFormedIndex.get(f.formedIndex).push(f);
  }

  const trades = [];
  let open = null;
  let active = []; // { direction, zone, candlesSinceFormed }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

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

    // 2) Check active eligible FVGs for mitigation (entry trigger), using this candle's range.
    const stillActive = [];
    let justValidated = null;
    for (const fvg of active) {
      fvg.candlesSinceFormed += 1;
      const enteredZone = fvg.direction === 'bullish' ? candle.low <= fvg.zone.top : candle.high >= fvg.zone.bottom;
      if (enteredZone) {
        if (!open && !justValidated) justValidated = fvg; // only ever act on the first one this candle
        continue; // consumed either way - mitigated FVGs aren't re-tradeable
      }
      if (fvg.candlesSinceFormed < maxAgeCandles) stillActive.push(fvg);
    }
    active = stillActive;

    // 3) Register any newly-formed eligible FVGs (this candle is c3 for a 3-candle window ending here).
    const newlyFormed = fvgsByFormedIndex.get(i);
    if (newlyFormed) {
      for (const f of newlyFormed) active.push({ direction: f.direction, zone: f.zone, candlesSinceFormed: 0 });
    }

    // 4) Open a trade at the NEXT candle's open after validation (no-lookahead).
    if (!open && justValidated) {
      const nextIndex = i + 1;
      if (nextIndex < candles.length) {
        const next = candles[nextIndex];
        const bullish = justValidated.direction === 'bullish';
        const entryPrice = next.open;
        const zoneHeight = justValidated.zone.top - justValidated.zone.bottom;
        const buffer = zoneHeight * FVG_EDGE_BUFFER_PCT;
        const stopPrice = bullish ? justValidated.zone.bottom - buffer : justValidated.zone.top + buffer;
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance > 0) {
          const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
          open = {
            direction: justValidated.direction,
            entryIndex: nextIndex,
            entryTime: next.time,
            entryPrice,
            stopPrice,
            targetPrice,
            distance,
            rrMultiple,
          };
        }
      }
    }
  }
  return trades;
}
