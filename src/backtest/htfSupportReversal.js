// htfSupportReversal.js
// "Support/résistance validé par 3 touches sur UNE timeframe (jour, semaine
// OU mois - n'importe laquelle), puis confirmation par pattern de
// renversement sur une timeframe plus basse (H1 ou H4)" (2026-09-19, Esdras
// - correction après une première lecture trop littérale de sa demande
// initiale : "le prix frappe un support 3 fois dans daily, weekly et
// monthly timeframe, n'importe lequel, ensuite on descend sur 4hr ou 1hr
// pour le doji ou bullish engulfing pour l'entrée"). PAS une exigence de
// confluence entre les 3 timeframes (la version précédente, rejetée - voir
// HANDOFF.md) : ICI un niveau qualifie dès qu'IL EST TOUCHÉ 3 FOIS SUR UNE
// SEULE de ces timeframes, chacune évaluée indépendamment.
//
// Méthode (fixée avant de voir un résultat, même discipline que
// equalHighsLows.js dont ce fichier reprend directement la logique de
// "pool" de swings — étendue de 2 à 3 touches, et appliquée à des bougies
// Jour/Semaine/Mois au lieu du M15 natif) :
//   1. Reconstruit les bougies Jour/Semaine/Mois à partir du même flux M15
//      (mêmes clés de calendrier NY que dailyLevels.js - nyDayKey/weekKeyOf/
//      monthKeyOf - jamais un découpage en secondes fixes qui ignorerait le
//      calendrier réel).
//   2. Sur CHAQUE timeframe séparément : détecte les pivots de swing
//      (detectSwingPoints, lookback=5 - même détection fractale déjà
//      utilisée par marketStructure.js/equalHighsLows.js), regroupe les
//      pivots du même type (haut ou bas) à moins de 0.1% l'un de l'autre
//      (même tolérance qu'equalHighsLows.js) en "pools", et qualifie un pool
//      dès que sa 3e touche est confirmée (MIN_TOUCHES=3, contre 2 pour
//      EQH/EQL). Le niveau reste actif indéfiniment ensuite (contrairement à
//      EQH/EQL, pas "consommé" au premier retest - un niveau validé par 3
//      touches reste une zone structurelle tant que les données durent).
//   3. Fusionne les niveaux qualifiés des 3 timeframes (avec leur heure
//      d'activation propre - date de la 3e confirmation) en une seule liste
//      chronologique.
//   4. Reconstruit une bougie H1 ou H4 (au choix, opts.entryTimeframe) à
//      partir du même flux M15. Pour chaque bougie de cette timeframe
//      d'entrée, si elle touche un niveau DÉJÀ ACTIF (support via son low,
//      résistance via son high) et forme un doji (corps <= 10% du range -
//      même seuil que starPatterns.js) ou un engulfing haussier/baissier
//      (définition manuel standard), c'est un signal.
//   5. Exécution ramenée sur M15 (grain le plus fin disponible) : entrée à
//      l'ouverture de la PREMIÈRE bougie M15 après la clôture de la bougie
//      H1/H4 de confirmation (pas de lookahead), stop au-delà de l'extrême
//      de cette bougie (et de la précédente pour un engulfing), cible fixe
//      1:3, timeout 480 bougies M15 (mêmes conventions que partout
//      ailleurs). Résolution (stop/cible/timeout) faite sur le M15, pas sur
//      le H1/H4 - plus précis pour détecter ce qui a été touché en premier.

import { nyDayKey, weekKeyOf, monthKeyOf } from './dailyLevels.js';
import { detectSwingPoints } from './marketStructure.js';

export const SWING_LOOKBACK = 5; // same as equalHighsLows.js/marketStructure.js
export const TOLERANCE_PCT = 0.001; // 0.1% of price - same as equalHighsLows.js's EQUAL_TOLERANCE_PCT
export const MIN_TOUCHES = 3; // the one deliberate difference from EQH/EQL's 2
export const DOJI_BODY_RATIO = 0.1; // same as starPatterns.js's DOJI_BODY_RATIO
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480; // M15 candles
export const ENTRY_TIMEFRAME_MS = { H1: 60 * 60 * 1000, H4: 4 * 60 * 60 * 1000 };
export const DEFAULT_ENTRY_TIMEFRAME = 'H1';

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
 * Resamples M15 candles into another timeframe defined by `keyOf` (a fixed-ms
 * bucket for H1/H4, or a real NY calendar key for day/week/month). Each output
 * candle also carries `endIndexExclusive` - the M15 index of the first candle
 * belonging to the NEXT bucket, i.e. the earliest point at which this bucket's
 * close is known (no lookahead) - so callers never need separate time-based
 * bookkeeping to map an HTF event back onto the M15 series.
 */
export function resampleWithBoundaries(candles, keyOf) {
  const out = [];
  let current = null;
  let currentKey = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const k = keyOf(c);
    if (k !== currentKey) {
      if (current) { current.endIndexExclusive = i; out.push(current); }
      current = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
      currentKey = k;
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
    }
  }
  if (current) { current.endIndexExclusive = candles.length; out.push(current); }
  return out;
}

/**
 * Pools this timeframe's confirmed swing points (same type, within
 * tolerance) and returns one event per pool the moment its Nth touch
 * confirms - the level then stays "active" (tradeable) forever after.
 * @returns {Array<{time:number, direction:'support'|'resistance', price:number}>}
 */
function findQualifiedLevels(htf, { lookback = SWING_LOOKBACK, tolerancePct = TOLERANCE_PCT, minTouches = MIN_TOUCHES } = {}) {
  const swingPoints = detectSwingPoints(htf, lookback).sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  const highPools = [];
  const lowPools = [];
  const qualified = [];

  for (const p of swingPoints) {
    const pools = p.type === 'high' ? highPools : lowPools;
    let pool = pools.find((pl) => Math.abs(pl.price - p.price) / pl.price <= tolerancePct);
    if (!pool) {
      pool = { price: p.price, count: 0, emitted: false };
      pools.push(pool);
    }
    pool.count++;
    if (pool.count >= minTouches && !pool.emitted) {
      pool.emitted = true;
      qualified.push({
        time: htf[p.confirmedIndex].time,
        direction: p.type === 'high' ? 'resistance' : 'support',
        price: pool.price,
      });
    }
  }
  return qualified;
}

/**
 * @param {Array} candles - M15, oldest first
 * @param {object} [opts]
 * @param {'H1'|'H4'} [opts.entryTimeframe]
 * @returns {Array<{entryIndex:number, direction:'bullish'|'bearish', stopReference:number, pattern:string, levelTimeframe:string, levelPrice:number}>}
 *   one event per M15 index at which an entry should fire (already mapped from the HTF confirmation candle).
 */
export function detectHtfLevelReversalEvents(candles, { entryTimeframe = DEFAULT_ENTRY_TIMEFRAME, lookback = SWING_LOOKBACK, tolerancePct = TOLERANCE_PCT, minTouches = MIN_TOUCHES } = {}) {
  const dailyHtf = resampleWithBoundaries(candles, (c) => nyDayKey(c.time));
  const weeklyHtf = resampleWithBoundaries(candles, (c) => weekKeyOf(nyDayKey(c.time)));
  const monthlyHtf = resampleWithBoundaries(candles, (c) => monthKeyOf(nyDayKey(c.time)));

  const levels = [
    ...findQualifiedLevels(dailyHtf, { lookback, tolerancePct, minTouches }).map((l) => ({ ...l, timeframe: 'daily' })),
    ...findQualifiedLevels(weeklyHtf, { lookback, tolerancePct, minTouches }).map((l) => ({ ...l, timeframe: 'weekly' })),
    ...findQualifiedLevels(monthlyHtf, { lookback, tolerancePct, minTouches }).map((l) => ({ ...l, timeframe: 'monthly' })),
  ].sort((a, b) => a.time - b.time);

  const bucketMs = ENTRY_TIMEFRAME_MS[entryTimeframe];
  const entryHtf = resampleWithBoundaries(candles, (c) => Math.floor(c.time / bucketMs));

  const events = [];
  for (let i = 1; i < entryHtf.length; i++) {
    const cur = entryHtf[i];
    const prev = entryHtf[i - 1];
    if (cur.endIndexExclusive >= candles.length) break; // data ends before this candle's entry could fill

    const activeSupports = levels.filter((l) => l.direction === 'support' && l.time <= cur.time);
    const activeResistances = levels.filter((l) => l.direction === 'resistance' && l.time <= cur.time);

    const supportHit = activeSupports.find((l) => Math.abs(cur.low - l.price) / l.price <= tolerancePct);
    if (supportHit) {
      const doji = isDoji(cur);
      const engulfing = isBullishEngulfing(prev, cur);
      if (doji || engulfing) {
        events.push({
          entryIndex: cur.endIndexExclusive,
          direction: 'bullish',
          stopReference: Math.min(cur.low, prev.low),
          pattern: doji ? 'doji' : 'bullish-engulfing',
          levelTimeframe: supportHit.timeframe,
          levelPrice: supportHit.price,
        });
        continue;
      }
    }

    const resistanceHit = activeResistances.find((l) => Math.abs(cur.high - l.price) / l.price <= tolerancePct);
    if (resistanceHit) {
      const doji = isDoji(cur);
      const engulfing = isBearishEngulfing(prev, cur);
      if (doji || engulfing) {
        events.push({
          entryIndex: cur.endIndexExclusive,
          direction: 'bearish',
          stopReference: Math.max(cur.high, prev.high),
          pattern: doji ? 'doji' : 'bearish-engulfing',
          levelTimeframe: resistanceHit.timeframe,
          levelPrice: resistanceHit.price,
        });
      }
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runHtfSupportReversalBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectHtfLevelReversalEvents(candles, opts);
  const eventByEntryIndex = new Map(events.map((e) => [e.entryIndex, e]));

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
      const event = eventByEntryIndex.get(i);
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
            levelTimeframe: event.levelTimeframe,
            levelPrice: event.levelPrice,
          };
        }
      }
    }
  }
  return trades;
}
