// liveStrategyEngine.js
//
// Streaming/live port of the EXACT validated combo already proven in
// scripts/runFtmo1StepAccountImpact.js (train 2019-2023 / test 2024-2025,
// see HANDOFF.md and docs/STRATEGY.md):
//   - Filtered FVG (HTF EMA bias + ICT market structure + NY session window
//     + liquidity sweep confluence) on US100, US500, XAUUSD - built via the
//     SAME buildFilteredEngine() used by the backtest/grid-search code
//     (src/backtest/gridRunner.js), not a re-implementation of the filters.
//   - Price-action Divergence (US100/US500 log-ratio z-score pairs
//     mean-reversion, "buy the laggard") - using the SAME
//     computeZScoreSeries()/alignByTime() helpers (src/backtest/
//     correlation.js) as the backtest.
//   - Netting: at most one open position per instrument, whichever source
//     (FVG or Divergence) got there first blocks the other until it closes
//     - identical rule to simulateYear() in runFtmo1StepAccountImpact.js.
//
// THIS IS THE FIX for the gap flagged in HANDOFF.md: "le bot live utilise
// un FvgEngine brut par symbole, SANS AUCUN filtre." Everything below feeds
// through buildFilteredEngine() + the shared correlation.js helpers instead.
//
// ---------------------------------------------------------------------------
// THE CORE DESIGN CHALLENGE: buildFilteredEngine() is a BATCH constructor -
// its HTF-bias/market-structure/liquidity-sweep filters are precomputed
// lookup tables built once from a full candle array, not incremental. A
// live bot only ever has "so far" history, growing one candle at a time.
//
// CHOSEN APPROACH (deliberately the simplest one that cannot silently
// diverge from the validated backtest logic): on every new candle for a
// symbol, REBUILD the whole filtered engine from that symbol's full
// retained (never-trimmed) candle history, then REPLAY every historical
// candle through it in order, keeping only the event(s) emitted while
// processing the LAST (just-arrived) candle. This guarantees the live
// engine runs the literal same code path as the backtest, at the cost of
// O(history length) work per tick - negligible at M15 cadence (~35,000
// candles/instrument/year -> a full rebuild+replay is well under a second
// in Node, and only has to happen once every 15 minutes per symbol). If
// this ever becomes a real bottleneck after long uptime, the fix is to make
// buildHtfBiasSeries/buildStructureBiasSeries/buildLiquiditySweepEvents
// incremental - out of scope here since that risks silently changing
// already-validated behavior.
//
// No-lookahead note (verified, not assumed): htfBias.js's makeBiasLookup()
// and marketStructure.js's makeStructureBiasLookup() both gate on
// `closeTime <= t`, so even though the replay's trailing HTF bucket may
// still be "open" (mid-formation) when a batch is rebuilt mid-bar, it can
// never be selected as the current bias until it has actually closed -
// exactly matching backtest behavior. Same reasoning applies to the
// Divergence z-score: a candidate's entryTime only ever equals an M15
// candle's time when that candle is the FIRST M15 candle of a new H1 bar,
// at which point the PRECEDING H1 bar (the one whose z-score crossed the
// threshold) is by construction already fully closed. So recomputing both
// series from scratch on every single M15 tick - including intra-bar ticks
// where the trailing HTF/H1 bucket is still forming - never leaks a
// still-forming bar's price into a decision, without any extra bookkeeping.
//
// Pyramid add-on ("stops indépendants, sans breakeven" - see HANDOFF.md and
// runBacktestPyramidIndependentStops() in backtest/backtestEngine.js for the
// full rationale/backtest results). Deliberately designed so the ORIGINAL
// position above is 100% untouched by any of this - its own stop/target
// resolution in _resolveOpenPosition() never even looks at pyramidPositions.
//
// Unlike the backtest (which manually checks "did this candle's high/low
// cross the added unit's stop/target" every bar), the LIVE version delegates
// that entirely to the broker: once the +addAtR trigger is reached, we place
// a real STOP order at that price with its stop-loss/take-profit ALREADY
// ATTACHED (a bracket order), then just listen for the broker to report it
// filled/closed. This is deliberate, not a shortcut - a broker-side bracket
// keeps protecting the position even if this process crashes or loses its
// connection, which a "poll every M15 candle and send a close order"
// approach cannot guarantee. The concrete broker calls live in
// src/dataSources/cTraderDataSource.js; this class only decides WHEN to
// request/cancel an order and tracks the handful of states in between (pure,
// synchronous, fully unit-testable - no network code in this file).
//
// Lifecycle per symbol (this.pyramidPositions.get(symbol)):
//   null                    - no pyramid in flight
//   { status: 'requested' } - the +addAtR trigger just fired THIS candle;
//                             an 'pyramid-order-requested' event was emitted
//                             for the execution layer to act on
//   { status: 'placed', brokerOrderId } - execution layer confirmed the
//                             order reached the broker (still just PENDING -
//                             price hasn't reached it yet)
//   null again              - either (a) the broker reported it FILLED
//                             (markPyramidOrderFilled - from then on it's a
//                             broker-managed bracket position, nothing left
//                             for this engine to track), or (b) the ORIGINAL
//                             position resolved first, so the still-pending
//                             order is cancelled (an
//                             'pyramid-order-cancel-requested' event is
//                             emitted) - matches the backtest's own rule
//                             that the add-on trigger stops mattering once
//                             the original trade is done.
//
// "Believed" netting caveat: like the backtest, this engine's notion of
// "position open on symbol X" is driven by ITS OWN signal detection, not by
// real broker-reported positions. Since this bot is semi-automatic (it
// alerts, a human clicks Buy/Sell), the human can choose not to take a
// signal, which the engine has no way to know - so `openPositions` is a
// BEST-EFFORT model of what SHOULD be open if every alert were followed,
// not a reconciled mirror of the real account. The guardrail
// (src/engines/guardrailEngine.js), by contrast, IS fed real
// broker-reported closed trades (see cTraderDataSource.js's
// _handleExecutionEvent) and stays accurate regardless of what the human
// actually did.
// ---------------------------------------------------------------------------

import { buildFilteredEngine, MIN_DISTANCE_SPREAD_MULTIPLE } from './backtest/gridRunner.js';
import { computeStop } from './backtest/backtestEngine.js';
import { resampleCandles, TIMEFRAME_MS } from './backtest/htfBias.js';
import { computeZScoreSeries, alignByTime } from './backtest/correlation.js';
import { computeAtrSeries } from './backtest/rsiDivergence.js';
import { CONFIG } from './config.js';

const FVG_MAX_HOLDING_M15_CANDLES = 480; // same convention as every FVG grid/backtest script

export class LiveStrategyEngine {
  /**
   * @param {object} opts
   * @param {string[]} [opts.symbols]
   * @param {object} [opts.fvgConfig] - CONFIG.fvg.perSymbol shape: { [symbol]: {variant, stopMode, rrMultiple, structureEnabled, sessionEnabled, sessionWindow, liquiditySweepEnabled} }
   * @param {object} [opts.divergenceConfig] - CONFIG.divergence shape: { pair:[symA,symB], lookback, zThreshold, atrPeriod, stopAtrMultiple, rrMultiple, maxHoldingM15Candles }
   * @param {object} opts.guardrail - a GuardrailEngine instance (shared with the rest of the app - this engine only READS it via canTakeNewTrade())
   * @param {number} [opts.riskPctPerTrade]
   * @param {Record<string, number>} [opts.spreads] - symbol -> spread in price units, for the same MIN_DISTANCE_SPREAD_MULTIPLE viability check used everywhere else
   * @param {object} [opts.pyramidConfig] - CONFIG.pyramid shape: { enabled, addAtR, symbols }. Omitted/enabled:false -> pyramid logic is fully inert (no events, no state), i.e. today's exact behavior.
   */
  constructor({
    symbols = CONFIG.symbols,
    fvgConfig = CONFIG.fvg.perSymbol,
    divergenceConfig = CONFIG.divergence,
    guardrail,
    riskPctPerTrade = CONFIG.risk.riskPctPerTrade,
    spreads = {},
    pyramidConfig = null,
  } = {}) {
    if (!guardrail) throw new Error('LiveStrategyEngine requires a guardrail (GuardrailEngine instance)');
    this.symbols = symbols;
    this.fvgConfig = fvgConfig || {};
    this.divergenceConfig = divergenceConfig || null;
    this.guardrail = guardrail;
    this.riskPctPerTrade = riskPctPerTrade;
    this.spreads = spreads;
    this.pyramidConfig = pyramidConfig && pyramidConfig.enabled ? pyramidConfig : null;
    this.balance = 10000; // updated via setBalance() once a real/demo balance is known

    this.history = new Map(symbols.map((s) => [s, []])); // full retained candle history per symbol - never trimmed
    this.formationIndexBySymbol = new Map(symbols.map((s) => [s, new Map()])); // fvg id -> index (in that symbol's history) where it was first seen "watching"
    this.openPositions = new Map(); // symbol -> { source, id, direction, entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance, rrMultiple, riskAmount, maxHoldingCandles }
    this.pyramidPositions = new Map(symbols.map((s) => [s, null])); // symbol -> null | { status: 'requested'|'placed', direction, entryPrice, stopPrice, targetPrice, distance, riskAmount, brokerOrderId? } - see lifecycle note above
  }

  setBalance(balance) {
    this.balance = balance;
  }

  getOpenPosition(symbol) {
    return this.openPositions.get(symbol) || null;
  }

  getHistoryLength(symbol) {
    return (this.history.get(symbol) || []).length;
  }

  /**
   * Feed one new CLOSED candle for one symbol. Returns an array of signal
   * events for the human/dashboard: 'watching' | 'expired' (informational,
   * FVG only) | 'validated' (the actionable trigger, from either source -
   * check `blockedReason` to know whether a position was actually opened)
   * | 'closed' (a previously-open position resolved: stop/target/timeout).
   */
  ingestCandle(symbol, candle) {
    if (!this.history.has(symbol)) return [];
    const hist = this.history.get(symbol);
    if (hist.length > 0 && candle.time <= hist[hist.length - 1].time) {
      return []; // stale/duplicate candle - ignore defensively, real feeds shouldn't send these
    }
    hist.push(candle);

    const events = [];

    this._resolveOpenPosition(symbol, candle, events);
    this._maybeRequestPyramid(symbol, candle, events);

    if (this.fvgConfig[symbol]) {
      events.push(...this._detectFvgSignal(symbol, candle));
    }

    if (this.divergenceConfig && this.divergenceConfig.pair.includes(symbol)) {
      events.push(...this._detectDivergenceSignal(symbol, candle));
    }

    return events;
  }

  _resolveOpenPosition(symbol, candle, events) {
    const open = this.openPositions.get(symbol);
    if (!open || candle.time <= open.entryTime) return;

    const bullish = open.direction === 'bullish';
    const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
    const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
    const age = this.history.get(symbol).length - 1 - open.entryIndex;
    const timedOut = age >= open.maxHoldingCandles;
    if (!hitStop && !hitTarget && !timedOut) return;

    const outcome = hitStop ? 'loss' : hitTarget ? 'win' : 'timeout';
    this.openPositions.delete(symbol);
    events.push({
      type: 'closed',
      source: open.source,
      symbol,
      id: open.id,
      direction: open.direction,
      outcome,
      entryPrice: open.entryPrice,
      stopPrice: open.stopPrice,
      targetPrice: open.targetPrice,
      exitTime: candle.time,
    });

    // The original just resolved - a pyramid add-on that never got FILLED no
    // longer has anything to attach to (see runBacktestPyramidIndependentStops:
    // the add trigger only matters while the original is still open). If it
    // WAS already filled, markPyramidOrderFilled() already cleared this slot,
    // so there's nothing to cancel here - it lives on as its own independent
    // broker position, exactly as designed.
    const pyramid = this.pyramidPositions.get(symbol);
    if (pyramid) {
      this.pyramidPositions.set(symbol, null);
      events.push({
        type: 'pyramid-order-cancel-requested',
        source: 'pyramid',
        symbol,
        brokerOrderId: pyramid.brokerOrderId || null,
      });
    }
  }

  /**
   * Checks whether an open FVG position on a pyramid-enabled symbol has
   * newly moved +addAtR in its favor this candle, and if so, requests a
   * SECOND, fully independent unit (own entry/stop/target - see the
   * module-level comment for the full lifecycle). No-op entirely when
   * `pyramidConfig` is null/disabled (the default) - existing behavior is
   * completely unchanged in that case.
   */
  _maybeRequestPyramid(symbol, candle, events) {
    if (!this.pyramidConfig || !this.pyramidConfig.symbols.includes(symbol)) return;
    const open = this.openPositions.get(symbol);
    if (!open || open.source !== 'fvg') return; // only ever validated for FVG trades on these symbols - see config.js comment
    if (this.pyramidPositions.get(symbol)) return; // already requested/placed for this trade
    if (candle.time <= open.entryTime) return; // same conservative "next candle" ordering as everywhere else in this project

    const addAtR = this.pyramidConfig.addAtR ?? 1;
    const bullish = open.direction === 'bullish';
    const favorPrice = bullish ? candle.high : candle.low;
    const moveInFavor = bullish ? favorPrice - open.entryPrice : open.entryPrice - favorPrice;
    if (moveInFavor < addAtR * open.distance) return;

    const entryPrice = bullish ? open.entryPrice + addAtR * open.distance : open.entryPrice - addAtR * open.distance;
    const stopPrice = bullish ? entryPrice - open.distance : entryPrice + open.distance;
    const targetPrice = open.targetPrice; // same cible that the original is already aiming for
    const riskAmount = this.balance * (this.riskPctPerTrade / 100); // sized off CURRENT balance, like a fresh entry

    this.pyramidPositions.set(symbol, { status: 'requested', direction: open.direction, entryPrice, stopPrice, targetPrice, distance: open.distance, riskAmount });
    events.push({
      type: 'pyramid-order-requested',
      source: 'pyramid',
      symbol,
      direction: open.direction,
      entryPrice,
      stopPrice,
      targetPrice,
      distance: open.distance,
      riskAmount,
    });
  }

  /** Call once the execution layer confirms the pending STOP order reached the broker. */
  markPyramidOrderPlaced(symbol, brokerOrderId) {
    const pyramid = this.pyramidPositions.get(symbol);
    if (!pyramid || pyramid.status !== 'requested') return;
    pyramid.status = 'placed';
    pyramid.brokerOrderId = brokerOrderId;
  }

  /**
   * Call once the broker reports the pending order FILLED. From this point
   * on it's an ordinary broker-managed bracket position - this engine has
   * nothing left to track for it (its own stop-loss/take-profit, already
   * attached at order placement, is enforced by the broker even if this
   * process goes offline).
   */
  markPyramidOrderFilled(symbol) {
    const pyramid = this.pyramidPositions.get(symbol);
    this.pyramidPositions.set(symbol, null);
    return pyramid || null;
  }

  getPyramidPending(symbol) {
    return this.pyramidPositions.get(symbol) || null;
  }

  _blockReason(symbol, distance, candle) {
    const spread = this.spreads[symbol] ?? 0;
    if (this.openPositions.has(symbol)) return 'netting';
    if (!(distance > 0)) return 'invalid-distance';
    if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) return 'spread-too-tight';
    if (!this.guardrail.canTakeNewTrade(candle.time)) return 'guardrail';
    return null;
  }

  _detectFvgSignal(symbol, candle) {
    const cfg = this.fvgConfig[symbol];
    const hist = this.history.get(symbol);
    const formationIndex = this.formationIndexBySymbol.get(symbol);
    const { engine } = buildFilteredEngine(hist, symbol, cfg);

    let lastEvents = [];
    for (let i = 0; i < hist.length; i++) {
      const evs = engine.processCandle(hist[i]);
      if (i === hist.length - 1) lastEvents = evs;
      for (const e of evs) {
        if (e.type === 'watching') formationIndex.set(e.id, i);
      }
    }

    const out = [];
    for (const e of lastEvents) {
      if (e.type === 'watching' || e.type === 'expired') {
        out.push({ ...e, source: 'fvg' });
        continue;
      }
      // e.type === 'validated'
      const c3Index = formationIndex.get(e.id);
      const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
      const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
      const stopPrice = computeStop({
        direction: e.direction,
        zone: e.zone,
        candles: hist,
        c1Index,
        stopMode: cfg.stopMode,
        swingLookback: 10,
      });
      const distance = Math.abs(entryPrice - stopPrice);
      const blockedReason = this._blockReason(symbol, distance, candle);

      const signal = { ...e, source: 'fvg', entryPrice, stopPrice, distance, rrMultiple: cfg.rrMultiple, blockedReason };

      if (!blockedReason) {
        const targetPrice =
          e.direction === 'bullish' ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
        const riskAmount = this.balance * (this.riskPctPerTrade / 100);
        this.openPositions.set(symbol, {
          source: 'fvg',
          id: e.id,
          direction: e.direction,
          entryIndex: hist.length - 1,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple: cfg.rrMultiple,
          riskAmount,
          maxHoldingCandles: FVG_MAX_HOLDING_M15_CANDLES,
        });
        signal.targetPrice = targetPrice;
        signal.riskAmount = riskAmount;
      }
      out.push(signal);
    }
    return out;
  }

  _detectDivergenceSignal(symbol, candle) {
    const cfg = this.divergenceConfig;
    const [symA, symB] = cfg.pair;
    const histA = this.history.get(symA);
    const histB = this.history.get(symB);
    if (!histA || !histB || histA.length === 0 || histB.length === 0) return [];

    const h1A = resampleCandles(histA, TIMEFRAME_MS.H1);
    const h1B = resampleCandles(histB, TIMEFRAME_MS.H1);
    const { alignedA, alignedB } = alignByTime(h1A, h1B);
    const n = alignedA.length;
    if (n <= cfg.lookback + 1) return [];

    const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
    const z = computeZScoreSeries(logRatio, cfg.lookback);
    const atrA = computeAtrSeries(alignedA, cfg.atrPeriod);
    const atrB = computeAtrSeries(alignedB, cfg.atrPeriod);

    let candidate = null;
    let wasExtended = false;
    for (let i = 0; i < n; i++) {
      if (z[i] === null) continue;
      const extended = Math.abs(z[i]) >= cfg.zThreshold;
      if (extended && !wasExtended && i + 1 < n) {
        const laggardIsB = z[i] >= cfg.zThreshold;
        const candSymbol = laggardIsB ? symB : symA;
        const atr = laggardIsB ? atrB[i] : atrA[i];
        const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
        if (atr && atr > 0 && entryCandle.time === candle.time && candSymbol === symbol) {
          candidate = { symbol: candSymbol, entryTime: entryCandle.time, stopDistance: cfg.stopAtrMultiple * atr };
        }
      }
      wasExtended = extended;
    }

    if (!candidate) return [];

    const distance = candidate.stopDistance;
    const blockedReason = this._blockReason(symbol, distance, candle);
    const entryPrice = candle.open;
    const stopPrice = entryPrice - distance; // Divergence is always long the laggard

    const signal = {
      type: 'validated',
      source: 'divergence',
      symbol,
      direction: 'bullish',
      suggestedSide: 'buy',
      id: `div-${symbol}-${candle.time}`,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = entryPrice + cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'divergence',
        id: signal.id,
        direction: 'bullish',
        entryIndex: this.history.get(symbol).length - 1,
        entryTime: candle.time,
        entryPrice,
        stopPrice,
        targetPrice,
        distance,
        rrMultiple: cfg.rrMultiple,
        riskAmount,
        maxHoldingCandles: cfg.maxHoldingM15Candles,
      });
      signal.targetPrice = targetPrice;
      signal.riskAmount = riskAmount;
    }
    return [signal];
  }
}
