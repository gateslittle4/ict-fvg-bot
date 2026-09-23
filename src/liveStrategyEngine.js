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
// Multi-touch FVG ("contact multi", `cfg.multiTouch: true` - see HANDOFF.md
// "FVG 'multi-contact' testé..." and the robustness checks that followed).
// Per production FvgEngine (engines/fvgEngine.js), a touch that fails the
// filters (bias/structure/session/sweep) consumes the zone forever, even if
// it is nowhere near its own maxAgeCandles staleness limit. MultiTouchFvgEngine
// (backtest/fvgMultiTouch.js) is the SAME 3-candle detection and SAME filter
// criteria, but a rejected touch leaves the zone active for a LATER touch to
// try again, up to maxAgeCandles. Validated for US100 ONLY (3 independent
// robustness checks: no single lucky quarter, counter-trend side holds up,
// ~10x an arbitrary-entry drift-baseline control - EURUSD/GBPUSD don't hold
// up at all on this concept, USDJPY holds up mechanically but turned out
// fragile on closer inspection - see HANDOFF.md "Multi-contact testé sur
// EURUSD/GBPUSD/USDJPY..."). `_buildFvgEngine()` below is the ONE place that
// decides which engine a symbol gets, shared by the per-tick and bulk
// warm-up paths exactly like `_processFvgEvent()` is the one place their
// enriched signal shape is built - both paths must stay bit-for-bit
// identical for the same (symbol, candle).
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
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from './backtest/fvgMultiTouch.js';
import { computeStop } from './backtest/backtestEngine.js';
import { resampleCandles, TIMEFRAME_MS } from './backtest/htfBias.js';
import { computeZScoreSeries, alignByTime } from './backtest/correlation.js';
import { computeAtrSeries } from './backtest/rsiDivergence.js';
import { detectNwogEvents } from './backtest/nwog.js';
import { detectJudasSwingEvents } from './backtest/judasSwing.js';
import { detectWeeklySweepEvents } from './backtest/weeklyLiquiditySweep.js';
import { computeBreakerBlockCandidates } from './backtest/breakerBlock.js';
import { computeSilverBulletCandidates } from './backtest/silverBullet.js';
import { detectCbdrEvents } from './backtest/cbdr.js';
import { CONFIG } from './config.js';

const FVG_MAX_HOLDING_M15_CANDLES = 480; // same convention as every FVG grid/backtest script
const ADOPTED_POSITION_MAX_HOLDING_M15_CANDLES = 480; // every mechanism in config.js (fvg/divergence/nwog/judasSwing/weeklySweep/breakerBlock/silverBullet/cbdr) already uses this exact value - see adoptExternalPosition()

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
    // Deliberately NOT defaulted to CONFIG.nwog (unlike fvgConfig/
    // divergenceConfig above) - explicit opt-in only. The three OTHER
    // callers of this constructor (chartOverlays.js, forwardTest.js,
    // recentPerformanceReport.js) build isolated, throwaway engines for
    // backtest-style replay/reporting on the ORIGINAL 2019-2025 CSVs;
    // whether to also fold NWOG into those historical reports is a
    // SEPARATE decision from making it live (this constructor's default
    // just avoids changing their output silently as a side effect of this
    // change) - not revisited here. Only accountRuntime.js's ONE real live-tracking
    // engine passes this explicitly.
    nwogConfig = null,
    // Same opt-in-only pattern as nwogConfig above (2026-09, at the user's
    // explicit request: "on active Judas Swing" - see config.js's
    // `judasSwing` comment and HANDOFF.md). Not defaulted so the three
    // backtest/report engines don't silently start folding it in.
    judasSwingConfig = null,
    // Same opt-in-only pattern as nwogConfig/judasSwingConfig above
    // (2026-09-15, GER40 - Esdras's explicit "on va plus vite" request,
    // straight to full auto-execute, no alert-only observation phase - see
    // HANDOFF.md). Not defaulted so the three backtest/report engines don't
    // silently start folding it in.
    weeklySweepConfig = null,
    // Same opt-in-only pattern as nwogConfig/judasSwingConfig/
    // weeklySweepConfig above (2026-09-16, GER40 - rehabilitated with the
    // real 0.5 spread and the same 2-year-block/buy-sell robustness checks
    // that validated NWOG - see HANDOFF.md "Breaker Block réhabilité"). Not
    // defaulted so the three backtest/report engines don't silently start
    // folding it in.
    breakerBlockConfig = null,
    // Same opt-in-only pattern as nwogConfig/judasSwingConfig/weeklySweepConfig/
    // breakerBlockConfig above (2026-09-17, US100/US500/GER40 - Esdras's
    // explicit "on les met en mode auto execute" request, straight to full
    // auto-execute, no alert-only observation phase first - see HANDOFF.md
    // for the research this was validated against: a train/test split on
    // 2019-2025 historical CSVs AND a confirming forward-test on real
    // cTrader candles never used to tune anything, both positive and
    // symmetric buy/sell on all 3 symbols). Not defaulted so the three
    // backtest/report engines don't silently start folding it in.
    silverBulletConfig = null,
    // Same opt-in-only pattern as nwogConfig/judasSwingConfig/weeklySweepConfig/
    // breakerBlockConfig/silverBulletConfig above (2026-09-18, US100 only -
    // Esdras's explicit "cable alors cbdr" request, after CBDR/US100 was the
    // only candidate to clear all 3 validation layers this session: full
    // 15-year historical depth train/test, a real forward-test on never-
    // touched cTrader candles, AND an overlap analysis against what's already
    // live on US100 - see HANDOFF.md for the full writeup, including the
    // 71% of CBDR's standalone trades that overlap nothing already open).
    // Not defaulted so the three backtest/report engines don't silently
    // start folding it in.
    cbdrConfig = null,
    guardrail,
    riskPctPerTrade = CONFIG.risk.riskPctPerTrade,
    spreads = {},
    pyramidConfig = null,
  } = {}) {
    if (!guardrail) throw new Error('LiveStrategyEngine requires a guardrail (GuardrailEngine instance)');
    this.symbols = symbols;
    this.fvgConfig = fvgConfig || {};
    this.divergenceConfig = divergenceConfig || null;
    this.nwogConfig = nwogConfig || null;
    this.judasSwingConfig = judasSwingConfig || null;
    this.weeklySweepConfig = weeklySweepConfig || null;
    this.breakerBlockConfig = breakerBlockConfig || null;
    this.silverBulletConfig = silverBulletConfig || null;
    this.cbdrConfig = cbdrConfig || null;
    this.guardrail = guardrail;
    this.riskPctPerTrade = riskPctPerTrade;
    this.spreads = spreads;
    this.pyramidConfig = pyramidConfig && pyramidConfig.enabled ? pyramidConfig : null;
    this.balance = 10000; // updated via setBalance() once a real/demo balance is known

    this.history = new Map(symbols.map((s) => [s, []])); // full retained candle history per symbol - never trimmed
    this.formationIndexBySymbol = new Map(symbols.map((s) => [s, new Map()])); // fvg id -> index (in that symbol's history) where it was first seen "watching"
    this.openPositions = new Map(); // symbol -> { source, id, direction, entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance, rrMultiple, riskAmount, maxHoldingCandles } - shared by FVG, Divergence, NWOG, AND Judas Swing (each auto-execute source, at the user's explicit request - see HANDOFF.md - participates in the same real netting, no per-source tracking)
    this.pyramidPositions = new Map(symbols.map((s) => [s, null])); // symbol -> null | { status: 'requested'|'placed', direction, entryPrice, stopPrice, targetPrice, distance, riskAmount, brokerOrderId? } - see lifecycle note above
  }

  setBalance(balance) {
    this.balance = balance;
  }

  // 2026-09, "page réglages" - see accountRuntime.js's setRiskPctPerTrade() and
  // config.js's RISK_PCT_PER_TRADE comment for the full picture (bounds
  // enforced by the caller, not here - this is a plain property mutation
  // like setBalance() above).
  setRiskPctPerTrade(pct) {
    this.riskPctPerTrade = pct;
  }

  getOpenPosition(symbol) {
    return this.openPositions.get(symbol) || null;
  }

  /**
   * Remove a "believed open" position ONLY if it's still the exact same one
   * (matched by id) - called from cTraderDataSource.js's _handleExecutionEvent
   * once a REAL ProtoOAExecutionEvent confirms the order behind this belief
   * was cancelled/expired/rejected, i.e. never became a real broker position
   * (see the "believed netting" caveat at the top of this file). Matching by
   * id, not just symbol, guards against clearing a position that has ALREADY
   * been superseded by a newer signal on the same symbol before this late
   * confirmation arrived - a stale "unfilled" event must never clobber
   * current state. Returns whether anything was actually cleared.
   */
  clearBelievedPosition(symbol, id) {
    const current = this.openPositions.get(symbol);
    if (current && current.id === id) {
      this.openPositions.delete(symbol);
      return true;
    }
    return false;
  }

  /**
   * Adopts a position that exists at the broker but that this process has
   * no memory of (reconcileAccount()'s 'real-only' status - see
   * accountReconciliation.js's computeRealOnlyPositionsToAdopt, which is
   * what decides WHICH positions reach this method). Most commonly a
   * position this same process opened itself, then forgot after a restart:
   * openPositions is in-memory only, never persisted (see HANDOFF.md,
   * 2026-09-18: "un redémarrage pendant qu'une position est ouverte fait
   * perdre au bot sa propre trace du trade"). Without this, netting
   * (`_hasOpenPosition`-style checks against `openPositions.has(symbol)`)
   * would believe the symbol free and could open a SECOND real position on
   * top of one already open at the broker.
   *
   * `entryIndex` is set to "now" (the tail of this symbol's own retained
   * history), not the position's real entry index - genuinely unknowable,
   * since this process never saw it form. That gives the adopted position a
   * full fresh maxHoldingCandles window rather than risking an immediate
   * false timeout on the very next candle - the position is real and
   * already protected by its own broker-side SL/TP either way, so a
   * generous timeout costs nothing.
   *
   * `source: 'adopted'` (never null) is deliberate: reconcileAccount() only
   * reports 'match' when `getOpenPosition(symbol)?.source` is truthy - a
   * null source here would keep reporting 'real-only' forever even after
   * adoption, even though netting is already correctly fixed by the
   * `openPositions.set()` below. A distinct, non-mechanism source also lets
   * the dashboard/journal tell an adopted position apart from one this
   * process actually signalled itself.
   *
   * Returns the stored belief (with its generated `id`) so the caller
   * (cTraderDataSource.js) can register a matching
   * `openPositionInfoByPositionId` entry for the real-close journal path,
   * or `null` if nothing was adopted (a belief already existed on this
   * symbol, or this engine doesn't track the symbol at all - see the two
   * guards below, both defensive: the real caller already checks both
   * before getting here).
   */
  adoptExternalPosition(symbol, { positionId, direction, entryPrice, stopPrice, targetPrice }) {
    if (this.openPositions.has(symbol)) return null;
    const hist = this.history.get(symbol);
    if (!hist) return null; // not a symbol this engine tracks - nothing safe to adopt into
    const belief = {
      source: 'adopted',
      id: `adopted:${positionId}`,
      direction,
      entryIndex: hist.length - 1,
      entryTime: hist.length > 0 ? hist[hist.length - 1].time : Date.now(),
      entryPrice,
      stopPrice,
      targetPrice,
      distance: stopPrice != null && entryPrice != null ? Math.abs(entryPrice - stopPrice) : null,
      rrMultiple: null,
      riskAmount: null, // unknowable after the fact - see cTraderDataSource.js's matching openPositionInfoByPositionId entry, whose riskAmount:null already degrades rMultiple to null safely in the real-close journal path
      maxHoldingCandles: ADOPTED_POSITION_MAX_HOLDING_M15_CANDLES,
    };
    this.openPositions.set(symbol, belief);
    return belief;
  }

  /** Last retained candle for `symbol` (no copy of the whole history), or null. */
  getLastCandle(symbol) {
    const hist = this.history.get(symbol);
    return hist && hist.length > 0 ? hist[hist.length - 1] : null;
  }

  getHistoryLength(symbol) {
    return (this.history.get(symbol) || []).length;
  }

  // Read-only view of the retained candle history (2026-09, for the "last 90
  // days" recent-performance report - see recentPerformanceReport.js). Copied
  // so a caller can't mutate the engine's own internal array.
  getHistory(symbol) {
    return [...(this.history.get(symbol) || [])];
  }

  /**
   * Feed one new CLOSED candle for one symbol. Returns an array of signal
   * events for the human/dashboard: 'watching' | 'expired' (informational,
   * FVG only) | 'validated' (the actionable trigger, from either source -
   * check `blockedReason` to know whether a position was actually opened)
   * | 'closed' (a previously-open position resolved: stop/target/timeout).
   */
  // guardrailNow (2026-09-14, real bug found live: GuardrailEngine's cooldown
  // and daily-trade-count silently reset themselves every day between
  // ~00:00-05:00 UTC) - defaults to `candle.time` so every existing
  // caller (every test in this file, warmUp()'s own replay - though that
  // path never reaches _blockReason at all, see below - and any future
  // backtest script) is byte-for-byte unaffected: `candle.time` already IS
  // the correct, consistent simulated clock in those contexts, since
  // nothing there ever mixes in a real Date.now() reading.
  //
  // The live path is different: cTraderDataSource.js feeds ingestCandle()
  // a candle whose `.time` has been shifted -5h (see _toEngineCandle's own
  // header - "fixed EST as UTC", needed so session-window/HTF-bias checks
  // match backtest-validated behavior) while GuardrailEngine's OTHER real
  // inputs (recordTrade() for a live fill, via Date.now(); recordTrade()
  // for _loadClosedDeals' boot-time replay, via the broker's own real
  // executionTimestamp; getStatus() for the dashboard, via Date.now())
  // all use genuine, UNSHIFTED wall-clock time. Feeding the SAME
  // GuardrailEngine instance two different clocks was silently resetting
  // its `trades` array (see guardrailEngine.js's _ensureDay - any dayKey
  // mismatch wipes it) every time real UTC was between 00:00 and 05:00 -
  // the 5h shift lands squarely on the PREVIOUS calendar day during that
  // window, so a live real-time candle's guardrail check would compute
  // "yesterday" while the very next getStatus()/recordTrade() call (real
  // time) computed "today", thrashing back and forth on every tick and
  // wiping the daily trade count / cooldown-after-loss protection clean -
  // confirmed live: a real loss's 30-minute cooldown vanished within ~3
  // minutes instead of lasting the full 30. `guardrailNow` lets the ONE
  // call site that actually has real wall-clock time (cTraderDataSource.js's
  // live tick handler) supply it explicitly, without touching any other
  // caller's behavior.
  // deferCloseToRealConfirmation (2026-09-14, real double-position bug found
  // monitoring overnight - see _resolveOpenPosition's own header for the
  // full story): opt-in, default false, so every existing caller (warm-up,
  // backtests, every existing test, and matchTraderDataSource.js - which has
  // no real-close confirmation loop yet) keeps today's exact behavior. Only
  // cTraderDataSource.js's live tick handler passes true, because it alone
  // has the real ProtoOAExecutionEvent confirmation loop
  // (_handleExecutionEvent -> clearBelievedPosition) needed to eventually
  // release a belief held pending under this flag - turning it on anywhere
  // else would strand that belief forever, a worse bug than the one this
  // fixes.
  ingestCandle(symbol, candle, guardrailNow = candle.time, { deferCloseToRealConfirmation = false } = {}) {
    if (!this.history.has(symbol)) return [];
    const hist = this.history.get(symbol);
    const last = hist.length > 0 ? hist[hist.length - 1] : null;
    if (last && candle.time === last.time) {
      // FIX 2026-09-21: the live feed (cTrader live trendbar) sends the bar being FORMED on every tick, and this used to
      // throw every tick after the first away as a "duplicate" - so the history kept, for each bar received live since the
      // last boot, a one-tick STUB (high = low = close = open). Every detector that reads the highs/lows/closes of previous
      // bars (weekly sweep, FVG, breaker, divergence...) then worked on wrong data; a clean US500 Weekly Sweep was missed
      // that way on 2026-09-21. The tracked bar now follows the feed. Deliberately NO signal evaluation on an update:
      // signals fire once, on the bar's first tick (entries are at the bar's open).
      hist[hist.length - 1] = { ...candle, open: last.open };
      return [];
    }
    if (last && candle.time < last.time) {
      return []; // stale (older) candle - ignore defensively, real feeds shouldn't send these
    }
    hist.push(candle);

    const events = [];

    this._resolveOpenPosition(symbol, candle, events, deferCloseToRealConfirmation);
    this._maybeRequestPyramid(symbol, candle, events, guardrailNow);

    if (this.fvgConfig[symbol]) {
      events.push(...this._detectFvgSignal(symbol, candle, guardrailNow));
    }

    if (this.divergenceConfig && this.divergenceConfig.pair.includes(symbol)) {
      events.push(...this._detectDivergenceSignal(symbol, candle, guardrailNow));
    }

    if (this.nwogConfig && this.nwogConfig.symbols.includes(symbol)) {
      events.push(...this._detectNwogSignal(symbol, candle, guardrailNow));
    }

    if (this.judasSwingConfig && this.judasSwingConfig.symbols.includes(symbol)) {
      events.push(...this._detectJudasSwingSignal(symbol, candle, guardrailNow));
    }

    if (this.weeklySweepConfig && this.weeklySweepConfig.symbols.includes(symbol)) {
      events.push(...this._detectWeeklySweepSignal(symbol, candle, guardrailNow));
    }

    if (this.breakerBlockConfig && this.breakerBlockConfig.symbols.includes(symbol)) {
      events.push(...this._detectBreakerBlockSignal(symbol, candle, guardrailNow));
    }

    if (this.silverBulletConfig && this.silverBulletConfig.symbols.includes(symbol)) {
      events.push(...this._detectSilverBulletSignal(symbol, candle, guardrailNow));
    }

    if (this.cbdrConfig && this.cbdrConfig.symbols.includes(symbol)) {
      events.push(...this._detectCbdrSignal(symbol, candle, guardrailNow));
    }

    // Second pass (see _resolveOpenPosition's 2026-09-19 comment): catches a
    // position a mechanism above JUST opened THIS candle, against this same
    // candle's own high/low - idempotent for a pre-existing position (the
    // first call above already checked it against this same data) and a
    // no-op when nothing is open.
    this._resolveOpenPosition(symbol, candle, events, deferCloseToRealConfirmation);

    return events;
  }

  // 2026-09-14, real double-position bug found monitoring overnight (recurred
  // twice: 02:00 opposite-direction, 09:11 same-direction): this method
  // decides "stop/target/timeout hit" purely from candle highs/lows - a
  // SIMULATION, same as the backtest. Live, that simulated hit can land
  // BEFORE the REAL broker-side stop/target order actually fills (a real
  // fill took up to ~10s tonight) - deleting openPositions right here, as
  // this used to do unconditionally, means netting (_blockReason's
  // `openPositions.has(symbol)` check) sees the symbol as free and lets a
  // NEW signal open a second real position on top of the first, still-open
  // one. With deferCloseToRealConfirmation, this method still detects the
  // simulated hit and still emits the 'closed' event (informational -
  // signal log / notifications, not the durable journal, which already logs
  // real broker P&L only - see cTraderDataSource.js's
  // openPositionInfoByPositionId), but leaves the belief IN openPositions,
  // guarded so it fires only once (`awaitingRealClose`) - netting stays
  // blocked until clearBelievedPosition() (called from
  // cTraderDataSource.js's _handleExecutionEvent on the REAL confirmed
  // close) removes it. Without the flag (warm-up, backtests, every existing
  // test, matchTraderDataSource.js), behavior is byte-for-bit unchanged:
  // there is no real broker confirmation loop to eventually release a
  // deferred belief in those contexts, so deferring there would strand it
  // forever instead of fixing anything.
  //
  // 2026-09-19, real bug found (another Claude Code session, verified here):
  // this method used to require `candle.time > open.entryTime` (STRICTLY
  // after), which meant the ENTRY candle's own high/low - the price action
  // that happens right after the entry fills, within that same bar - was
  // NEVER checked against the stop/target. ingestCandle()/the warm-up loop
  // only ever called this method ONCE per candle, BEFORE that candle's own
  // mechanism detection could open a brand-new position, so a position that
  // opens on candle N only ever got its first stop/target check on candle
  // N+1's range - any adverse move violent enough to breach the stop WITHIN
  // candle N itself (a real, observed case: US100 CBDR sell on 2026-02-25
  // 09:45, whose own candle ranged +5.75pt above its open) was invisible to
  // every backtest AND to the live signal log/notifications. Fixed by (a)
  // relaxing the guard to allow `candle.time === open.entryTime` through,
  // and (b) calling this method a SECOND time, right after detection, from
  // both ingestCandle() and the warm-up loop - so a freshly-opened position
  // is immediately checked against its OWN entry candle. Safe for every
  // OTHER case: a pre-existing position re-checked against the same candle
  // it was already checked against earlier in the same call is idempotent
  // (same data, same result), and a symbol with no open position is a no-op
  // either way (`!open` returns immediately). This affects every historical
  // backtest/analysis in this project that used LiveStrategyEngine - all
  // slightly (or not-so-slightly) optimistic to some degree, since a same-
  // candle stop-out silently became "still open, resolved later" instead of
  // an immediate loss. See HANDOFF.md for the re-run comparison.
  _resolveOpenPosition(symbol, candle, events, deferCloseToRealConfirmation = false) {
    const open = this.openPositions.get(symbol);
    if (!open || candle.time < open.entryTime) return;
    if (open.awaitingRealClose) return; // already simulated-resolved, waiting on the real broker close - see header above

    const bullish = open.direction === 'bullish';
    const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
    const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
    const age = this.history.get(symbol).length - 1 - open.entryIndex;
    const timedOut = age >= open.maxHoldingCandles;
    if (!hitStop && !hitTarget && !timedOut) return;

    const outcome = hitStop ? 'loss' : hitTarget ? 'win' : 'timeout';
    if (deferCloseToRealConfirmation) {
      open.awaitingRealClose = true; // netting (openPositions.has(symbol)) stays blocked until the REAL close confirms
    } else {
      this.openPositions.delete(symbol);
    }
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
  _maybeRequestPyramid(symbol, candle, events, guardrailNow = candle.time) {
    if (!this.pyramidConfig || !this.pyramidConfig.symbols.includes(symbol)) return;
    const open = this.openPositions.get(symbol);
    if (!open || open.source !== 'fvg') return; // only ever validated for FVG trades on these symbols - see config.js comment
    // 2026-09-14: with deferCloseToRealConfirmation, _resolveOpenPosition (which
    // runs right before this, same candle) can leave `open` in the map with
    // awaitingRealClose=true instead of deleting it outright - without this
    // check, a pyramid add-on could get requested on a position that just
    // simulated-closed this very candle (previously impossible, since the old
    // unconditional delete meant `open` was already gone by the time this ran).
    if (open.awaitingRealClose) return;
    if (this.pyramidPositions.get(symbol)) return; // already requested/placed for this trade
    if (candle.time <= open.entryTime) return; // same conservative "next candle" ordering as everywhere else in this project
    // 2026-09-15 (Esdras, after seeing the numbers - see HANDOFF.md): a
    // pyramid leg that fires while its own symbol is still in cooldown from
    // a recent loss performs dramatically worse (4-12% win rate, net
    // negative) than one that fires clear of it (50-60% win rate, strongly
    // positive) - a recent loss on this symbol looks like a leading
    // indicator of a choppier regime, exactly where adding a second unit is
    // most likely to also get whipsawed. Previously this function never
    // consulted the guardrail at all. Same canTakeNewTrade(now, symbol) call
    // every other live source already uses via _blockReason() - covers the
    // per-symbol cooldown this was actually tested against, plus
    // maxTradesPerDay/dailyLossLimitPct/overall-drawdown for free (adding
    // MORE exposure once any of those has already tripped make no sense
    // either). guardrailNow (NOT candle.time directly) - same live -5h
    // candle-time-shift lesson already applied to every other source's own
    // guardrail check (see ingestCandle()'s own comment) - candle.time is
    // the shifted "fixed EST as UTC" engine clock in live operation, wrong
    // for GuardrailEngine's real-calendar-day bookkeeping.
    if (!this.guardrail.canTakeNewTrade(guardrailNow, symbol)) return;

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

  /**
   * Call when a pyramid add-on order is now VERIFIED to have never reached
   * the broker (no push confirmation AND a reconcile query found nothing
   * real - see _handlePyramidOrderRequested's no-confirmation branch in
   * cTraderDataSource.js). Without this, a 'requested' slot left stuck
   * forever would silently block every later pyramid attempt on this
   * symbol (getPyramidPending would keep returning a belief nothing real
   * backs).
   */
  clearPyramidPending(symbol) {
    this.pyramidPositions.set(symbol, null);
  }

  getPyramidPending(symbol) {
    return this.pyramidPositions.get(symbol) || null;
  }

  _blockReason(symbol, distance, candle, guardrailNow = candle.time) {
    const spread = this.spreads[symbol] ?? 0;
    if (this.openPositions.has(symbol)) return 'netting';
    if (!(distance > 0)) return 'invalid-distance';
    if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) return 'spread-too-tight';
    // guardrailNow, NOT candle.time directly (2026-09-14) - see
    // ingestCandle()'s own comment for the full story: candle.time is the
    // shifted "fixed EST as UTC" engine clock, wrong for GuardrailEngine's
    // real-calendar-day bookkeeping in live operation.
    if (!this.guardrail.canTakeNewTrade(guardrailNow, symbol)) return 'guardrail';
    return null;
  }

  /**
   * The ONE place that decides which FVG engine a symbol gets: the
   * production single-touch engine (via buildFilteredEngine, same filter
   * criteria either way), or MultiTouchFvgEngine when `cfg.multiTouch` is
   * set (see the module header note above). Shared by the per-tick path
   * (_detectFvgSignal, rebuilding from `hist` on every live candle) and the
   * bulk warm-up path (_warmUpOneSymbol, building once from the full
   * historical window) so both can never silently diverge on which engine a
   * symbol actually runs.
   */
  _buildFvgEngine(candles, symbol, cfg) {
    if (cfg.multiTouch) {
      const checkFilters = buildMultiTouchFilterPredicate(candles, symbol, cfg);
      return new MultiTouchFvgEngine({ symbol, checkFilters });
    }
    return buildFilteredEngine(candles, symbol, cfg).engine;
  }

  _detectFvgSignal(symbol, candle, guardrailNow = candle.time) {
    const cfg = this.fvgConfig[symbol];
    const hist = this.history.get(symbol);
    const formationIndex = this.formationIndexBySymbol.get(symbol);
    const engine = this._buildFvgEngine(hist, symbol, cfg);

    let lastEvents = [];
    for (let i = 0; i < hist.length; i++) {
      const evs = engine.processCandle(hist[i]);
      if (i === hist.length - 1) lastEvents = evs;
      for (const e of evs) {
        if (e.type === 'watching') formationIndex.set(e.id, i);
      }
    }

    return lastEvents.map((e) => this._processFvgEvent(symbol, cfg, candle, e, hist, formationIndex, guardrailNow));
  }

  /**
   * Turns one raw FvgEngine event (for a candle already appended to `hist`,
   * at index hist.length-1) into the enriched signal shape the rest of the
   * app expects, opening a position as a side effect when unblocked. Shared
   * by the per-tick path above (_detectFvgSignal, called once per LIVE
   * candle) and the bulk warm-up path below (_warmUpOneSymbol, called once
   * per HISTORICAL candle in a single engine pass) - both must produce
   * bit-for-bit identical results for the same (symbol, candle, event), so
   * this is the ONE place that logic lives. `guardrailNow` defaults to
   * `candle.time` (2026-09-14) - correct as-is for warm-up (its own
   * simulated clock), overridden with real Date.now() only by the live
   * call site - see ingestCandle()'s own comment for why.
   */
  _processFvgEvent(symbol, cfg, candle, e, hist, formationIndex, guardrailNow = candle.time) {
    if (e.type === 'watching' || e.type === 'expired') {
      return { ...e, source: 'fvg' };
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
    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

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
    return signal;
  }

  _detectDivergenceSignal(symbol, candle, guardrailNow = candle.time) {
    const cfg = this.divergenceConfig;
    const [symA, symB] = cfg.pair;
    const histA = this.history.get(symA);
    const histB = this.history.get(symB);
    if (!histA || !histB || histA.length === 0 || histB.length === 0) return [];

    const candidates = this._computeDivergenceCandidates(histA, histB, symA, symB);
    const candidate = candidates.find((cd) => cd.entryTime === candle.time && cd.symbol === symbol);
    if (!candidate) return [];

    return [this._processDivergenceCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Pure computation of every divergence entry candidate implied by two full
   * candle histories - a candidate is emitted at index i+1 whenever the
   * z-score newly crosses `zThreshold` at index i (see the module header's
   * no-lookahead note: z[i]/atr[i] only ever read CLOSED buckets strictly
   * before the trailing/still-forming one, since a candidate always requires
   * `i + 1 < n`, so it is never the last, possibly-mid-formation bucket).
   * Because of that causality, this produces the exact same candidate list
   * whether `histA`/`histB` are the FULL final histories (used by the bulk
   * warm-up path below) or truncated as-of-some-earlier-tick snapshots (used
   * by the per-tick path above) - the only difference is how many times the
   * (non-trivial: resample+align+z-score+ATR) computation has to run to
   * discover the same entries. Extracted 2026-09 to fix the O(n^2) warm-up
   * cost documented in HANDOFF.md ("découverte de performance") - this file
   * literally re-ran resample+align+z-score on the FULL histA on every
   * single M15 tick during warm-up replay before this change.
   */
  _computeDivergenceCandidates(histA, histB, symA, symB) {
    const cfg = this.divergenceConfig;
    const h1A = resampleCandles(histA, TIMEFRAME_MS.H1);
    const h1B = resampleCandles(histB, TIMEFRAME_MS.H1);
    const { alignedA, alignedB } = alignByTime(h1A, h1B);
    const n = alignedA.length;
    if (n <= cfg.lookback + 1) return [];

    const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
    const z = computeZScoreSeries(logRatio, cfg.lookback);
    const atrA = computeAtrSeries(alignedA, cfg.atrPeriod);
    const atrB = computeAtrSeries(alignedB, cfg.atrPeriod);

    const candidates = [];
    let wasExtended = false;
    for (let i = 0; i < n; i++) {
      if (z[i] === null) continue;
      const extended = Math.abs(z[i]) >= cfg.zThreshold;
      if (extended && !wasExtended && i + 1 < n) {
        const laggardIsB = z[i] >= cfg.zThreshold;
        const candSymbol = laggardIsB ? symB : symA;
        const atr = laggardIsB ? atrB[i] : atrA[i];
        const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
        if (atr && atr > 0) {
          candidates.push({ symbol: candSymbol, entryTime: entryCandle.time, stopDistance: cfg.stopAtrMultiple * atr });
        }
      }
      wasExtended = extended;
    }
    return candidates;
  }

  /** Shared tail of divergence signal handling - same role as _processFvgEvent() above. */
  _processDivergenceCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.divergenceConfig;
    const distance = candidate.stopDistance;
    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);
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
    return signal;
  }

  /**
   * Pure computation of every NWOG entry candidate implied by one symbol's
   * full candle history - reuses detectNwogEvents() (src/backtest/nwog.js)
   * UNCHANGED (the gap-detection method itself is not reimplemented here),
   * then shifts each gap event forward one candle to its entry (same
   * "one-candle no-lookahead delay" nwog.js's own header describes). Same
   * "recompute fresh every tick, cheap enough at M15 cadence" approach as
   * _computeDivergenceCandidates() - a single O(n) pass, no stateful engine
   * to replay.
   */
  _computeNwogCandidates(candles) {
    const events = detectNwogEvents(candles);
    const candidates = [];
    for (const e of events) {
      const entryIndex = e.index + 1;
      if (entryIndex >= candles.length) continue; // gap candle is the most recent one - entry hasn't printed yet
      candidates.push({ direction: e.direction, entryTime: candles[entryIndex].time, stopReference: e.stopReference });
    }
    return candidates;
  }

  _detectNwogSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeNwogCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processNwogCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of NWOG signal handling - same role, and now (2026-09,
   * "Phase 3 skipped straight to auto-execute" - at the user's explicit,
   * eyes-open request, see HANDOFF.md) the exact same PATTERN as
   * _processFvgEvent()/_processDivergenceCandidate() above: a clean signal
   * writes into the REAL openPositions map, participates in the REAL
   * netting (blocks and is blocked by FVG/Divergence on the same symbol),
   * and is resolved by the shared _resolveOpenPosition() - no NWOG-specific
   * position tracking left. `suggestedSide` is required here (not optional)
   * because _handleAutoExecuteEntry (cTraderDataSource.js) reads it directly
   * to submit the real broker order - every source must set it.
   */
  _processNwogCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.nwogConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // nwog.js: "Entry at the open of the candle AFTER the gap candle"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `nwog-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      // Same defensive guard nwog.js's own backtest applies (see its header
      // comment on smtDivergence.js's lesson) - discard rather than mis-sign.
      return {
        type: 'validated',
        source: 'nwog',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    // 2026-09-15: the long/short-direction-split check (built this same day
    // for GER40 research) applied retroactively to NWOG on US100 - the
    // symbol it's actually LIVE on - shows the sell side contributes ~0 net
    // edge (177 trades, totalR -1.70R, essentially breakeven) while buy
    // carries the entire result (155 trades, totalR +87.43R). At Esdras's
    // explicit request ("on active achète seulement"), a symbol listed in
    // cfg.longOnlySymbols skips straight to a blocked signal for bearish
    // candidates - still reported (informational, same convention as every
    // other blockedReason here), never opens a real position or reaches
    // auto-execute.
    //
    // 2026-09-16: was a single `cfg.longOnly` boolean applying to every
    // symbol in `nwog.symbols` - broke the moment a SECOND NWOG symbol
    // needed the OPPOSITE setting. GER40/NWOG was independently validated
    // BIDIRECTIONAL (buy/sell split 59/41, no hidden long bias - see
    // HANDOFF.md "GER40 — vrai spread confirmé... NWOG réhabilité"), unlike
    // US100's genuine long-only edge above - forcing both through one flag
    // would have wrongly restricted GER40 to buy-only (unvalidated) or
    // wrongly reopened US100's known-breakeven sell side. `longOnlySymbols`
    // (an array, default none) scopes the restriction per-symbol instead.
    const blockedReason = cfg.longOnlySymbols?.includes(symbol) && !bullish ? 'direction-filtered' : this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'nwog',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'nwog',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  /**
   * Pure computation of every Judas Swing entry candidate implied by one
   * symbol's full candle history - reuses detectJudasSwingEvents()
   * (src/backtest/judasSwing.js) UNCHANGED (default London killzone
   * 02:00-05:00 NY, PDH/PDL sweep+reclaim - not reimplemented here), then
   * shifts each event forward one candle to its entry, same pattern as
   * _computeNwogCandidates() above.
   */
  _computeJudasSwingCandidates(candles) {
    const events = detectJudasSwingEvents(candles);
    const candidates = [];
    for (const e of events) {
      const entryIndex = e.index + 1;
      if (entryIndex >= candles.length) continue; // signal candle is the most recent one - entry hasn't printed yet
      candidates.push({ direction: e.direction, entryTime: candles[entryIndex].time, stopReference: e.sweepExtreme });
    }
    return candidates;
  }

  _detectJudasSwingSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeJudasSwingCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processJudasSwingCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of Judas Swing signal handling - same shape and same
   * openPositions/netting/auto-execute participation as
   * _processNwogCandidate() above (2026-09, at the user's explicit request
   * to activate it, scoped to EURUSD only - see config.js's `judasSwing`
   * comment). Includes the same validStopSide guard learned from the SMT
   * Divergence bug even though judasSwing.js's own backtest never showed the
   * failure mode on EURUSD specifically (checked before shipping this) -
   * cheap, permanent insurance rather than assuming it can't happen here.
   */
  _processJudasSwingCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.judasSwingConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // judasSwing.js: "Entry at the OPEN of the next candle after the reclaim"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `judaswing-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      return {
        type: 'validated',
        source: 'judaswing',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'judaswing',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'judaswing',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  /**
   * Pure computation of every Weekly Liquidity Sweep entry candidate implied
   * by one symbol's full candle history - reuses detectWeeklySweepEvents()
   * (src/backtest/weeklyLiquiditySweep.js) UNCHANGED (PWH/PWL sweep+reclaim,
   * no time-of-day restriction - not reimplemented here), then shifts each
   * event forward one candle to its entry, same pattern as
   * _computeNwogCandidates()/_computeJudasSwingCandidates() above.
   */
  _computeWeeklySweepCandidates(candles) {
    const events = detectWeeklySweepEvents(candles);
    const candidates = [];
    for (const e of events) {
      const entryIndex = e.index + 1;
      if (entryIndex >= candles.length) continue; // signal candle is the most recent one - entry hasn't printed yet
      candidates.push({ direction: e.direction, entryTime: candles[entryIndex].time, stopReference: e.sweepExtreme });
    }
    return candidates;
  }

  _detectWeeklySweepSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeWeeklySweepCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processWeeklySweepCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of Weekly Liquidity Sweep signal handling - same shape and
   * same openPositions/netting/auto-execute participation as
   * _processNwogCandidate()/_processJudasSwingCandidate() above (2026-09-15,
   * GER40 - Esdras's explicit "on va plus vite" request, straight to full
   * auto-execute, no alert-only observation phase first - see HANDOFF.md for
   * the research this was validated against and its stated caveats: a single
   * train/test split, never observed live before now). Same validStopSide
   * guard as every other source here, same reasoning (smtDivergence.js's
   * lesson) even though never observed to fail on GER40 specifically.
   */
  _processWeeklySweepCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.weeklySweepConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // weeklyLiquiditySweep.js: "Entry at the OPEN of the next candle after the reclaim"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `weeklysweep-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      return {
        type: 'validated',
        source: 'weeklysweep',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'weeklysweep',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'weeklysweep',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  /**
   * Pure computation of every Breaker Block entry candidate implied by one
   * symbol's full candle history - now a thin alias for
   * computeBreakerBlockCandidates() (src/backtest/breakerBlock.js), which
   * holds the actual watchBreak/watchRetest/pendingEntry state machine
   * (extracted 2026-09-17 so tradeCompliance.js's checklist reconstruction
   * and this engine share ONE implementation instead of two copies that
   * could silently drift - same discipline as detectNwogEvents/
   * detectJudasSwingEvents/detectWeeklySweepEvents already being the single
   * source of truth for their own mechanisms). See that function's own doc
   * comment for the full behavior description (position-agnostic detector,
   * not gated on "is a trade currently open" - the shared netting layer
   * decides that).
   */
  _computeBreakerBlockCandidates(candles) {
    return computeBreakerBlockCandidates(candles);
  }

  _detectBreakerBlockSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeBreakerBlockCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processBreakerBlockCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of Breaker Block signal handling - same shape and same
   * openPositions/netting/auto-execute participation as
   * _processNwogCandidate()/_processJudasSwingCandidate()/
   * _processWeeklySweepCandidate() above (2026-09-16, GER40 - rehabilitated
   * with the real 0.5 spread and the same robustness checks that validated
   * NWOG, see HANDOFF.md). No direction filter - GER40/Breaker Block was
   * validated bidirectional (60% buy / 40% sell, not a hidden long-bias
   * trap), unlike US100/NWOG's genuine long-only edge. Same validStopSide
   * guard as every other source here (smtDivergence.js's lesson).
   */
  _processBreakerBlockCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.breakerBlockConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // breakerBlock.js: "Entry trigger = a retest... at the open of the candle after"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `breakerblock-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      return {
        type: 'validated',
        source: 'breakerblock',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'breakerblock',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'breakerblock',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  /**
   * Pure computation of every Silver Bullet entry candidate implied by one
   * symbol's full candle history - now a thin alias for
   * computeSilverBulletCandidates() (src/backtest/silverBullet.js), which
   * holds the actual active-zone/mitigation state machine (extracted
   * 2026-09-17, same reasoning as _computeBreakerBlockCandidates() above:
   * tradeCompliance.js's checklist reconstruction and this engine now
   * share ONE implementation instead of two copies that could silently
   * drift). See that function's own doc comment for the full behavior
   * description.
   */
  _computeSilverBulletCandidates(candles) {
    return computeSilverBulletCandidates(candles);
  }

  _detectSilverBulletSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeSilverBulletCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processSilverBulletCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of Silver Bullet signal handling - same shape and same
   * openPositions/netting/auto-execute participation as
   * _processNwogCandidate()/_processJudasSwingCandidate()/
   * _processWeeklySweepCandidate()/_processBreakerBlockCandidate() above
   * (2026-09-17, US100/US500/GER40 - see config.js's `silverBullet` comment
   * and HANDOFF.md). No direction filter - validated bidirectional on all 3
   * symbols (buy AND sell positive, both the 2019-2025 train/test split and
   * the real cTrader forward-test), unlike US100/NWOG's genuine long-only
   * edge. Same validStopSide guard as every other source here
   * (smtDivergence.js's lesson).
   */
  _processSilverBulletCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.silverBulletConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // silverBullet.js: "Entry at the open of the candle after mitigation"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `silverbullet-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      return {
        type: 'validated',
        source: 'silverbullet',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'silverbullet',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'silverbullet',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  /**
   * Pure computation of every CBDR entry candidate implied by one symbol's
   * full candle history - reuses detectCbdrEvents() (src/backtest/cbdr.js)
   * UNCHANGED (the standard-deviation-projection detection itself is not
   * reimplemented here), then shifts each touch event forward one candle to
   * its entry (same "one-candle no-lookahead delay" cbdr.js's own header
   * describes) - identical shape/pattern to _computeNwogCandidates() above.
   */
  _computeCbdrCandidates(candles) {
    const events = detectCbdrEvents(candles);
    const candidates = [];
    for (const e of events) {
      const entryIndex = e.index + 1;
      if (entryIndex >= candles.length) continue; // touch candle is the most recent one - entry hasn't printed yet
      candidates.push({ direction: e.direction, entryTime: candles[entryIndex].time, stopReference: e.sweepExtreme });
    }
    return candidates;
  }

  _detectCbdrSignal(symbol, candle, guardrailNow = candle.time) {
    const hist = this.history.get(symbol);
    const candidate = this._computeCbdrCandidates(hist).find((cd) => cd.entryTime === candle.time);
    if (!candidate) return [];
    return [this._processCbdrCandidate(symbol, candle, candidate, guardrailNow)];
  }

  /**
   * Shared tail of CBDR signal handling - same shape and same
   * openPositions/netting/auto-execute participation as
   * _processNwogCandidate()/_processSilverBulletCandidate() above (2026-09-18,
   * US100 only - see config.js's `cbdr` comment and HANDOFF.md). No direction
   * filter - CBDR is a bidirectional fade (upside touch -> bearish, downside
   * touch -> bullish), never screened for a long/short-only split the way
   * NWOG/US100 was. Same validStopSide guard as every other source here
   * (smtDivergence.js's lesson).
   */
  _processCbdrCandidate(symbol, candle, candidate, guardrailNow = candle.time) {
    const cfg = this.cbdrConfig;
    const bullish = candidate.direction === 'bullish';
    const entryPrice = candle.open; // cbdr.js: "Entry at the open of the candle AFTER the touch candle"
    const stopPrice = candidate.stopReference;
    const distance = Math.abs(entryPrice - stopPrice);
    const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
    const id = `cbdr-${symbol}-${candle.time}`;
    const suggestedSide = bullish ? 'buy' : 'sell';

    if (distance <= 0 || !validStopSide) {
      return {
        type: 'validated',
        source: 'cbdr',
        symbol,
        id,
        direction: candidate.direction,
        suggestedSide,
        validatedAt: candle.time,
        entryPrice,
        stopPrice,
        distance,
        blockedReason: 'invalid-distance',
      };
    }

    const blockedReason = this._blockReason(symbol, distance, candle, guardrailNow);

    const signal = {
      type: 'validated',
      source: 'cbdr',
      symbol,
      id,
      direction: candidate.direction,
      suggestedSide,
      validatedAt: candle.time,
      entryPrice,
      stopPrice,
      distance,
      rrMultiple: cfg.rrMultiple,
      blockedReason,
    };

    if (!blockedReason) {
      const targetPrice = bullish ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
      const riskAmount = this.balance * (this.riskPctPerTrade / 100);
      this.openPositions.set(symbol, {
        source: 'cbdr',
        id,
        direction: candidate.direction,
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
    return signal;
  }

  // -------------------------------------------------------------------------
  // Bulk warm-up (2026-09): reconstructs this engine's state (history,
  // openPositions, pyramidPositions, formationIndexBySymbol) from a full
  // historical candle window in roughly O(n) instead of replaying via
  // ingestCandle() once per historical candle (O(n) PER CALL -> O(n^2)
  // total, measured live at ~14 minutes to warm up 3 symbols - see
  // HANDOFF.md "découverte de performance"). Deliberately silent: no events
  // are returned and no store/dashboard side effects happen for historical
  // candles (matches the already-flagged cosmetic wish in HANDOFF.md to stop
  // showing warm-up replay artifacts in the signal log) - only the FINAL
  // internal state matters once warm-up is done, exactly as the comment on
  // the old per-candle replay loop in cTraderDataSource.js already said.
  //
  // Equivalence to sequential ingestCandle() calls, symbol by symbol in
  // `candlesBySymbol` key order (same order the caller must use as its own
  // per-symbol fetch order - see cTraderDataSource.js): FVG's HTF-bias/
  // market-structure/liquidity-sweep lookups are causal (gate on
  // `closeTime <= t`, see the top-of-file no-lookahead note), so building
  // them ONCE from the complete candle array yields the identical lookup
  // result at every prefix as rebuilding them from a truncated array at each
  // step - only HOW MANY TIMES the (expensive) construction runs changes,
  // not WHAT it computes for any given prefix. Divergence candidates are
  // equivalent for the same reason (see _computeDivergenceCandidates' own
  // doc). This is also why this method must NOT reorder or interleave
  // symbols across each other: it reproduces today's per-symbol-sequential
  // production warm-up loop exactly, quirks included - e.g. the FIRST
  // symbol processed for a divergence pair sees an empty history for its
  // partner (matching `_detectDivergenceSignal`'s existing early-return) and
  // so never discovers a divergence candidate during its OWN warm-up, only
  // during the partner's (this is pre-existing behavior, not something this
  // refactor changes).
  // -------------------------------------------------------------------------

  /** True when `time` starts a bar the history has not seen yet (the live feed's first tick of a new bar). */
  isNewBar(symbol, time) {
    const hist = this.history.get(symbol);
    return Boolean(hist) && (hist.length === 0 || time > hist[hist.length - 1].time);
  }

  /**
   * Overwrites already-tracked bars with the broker's FINAL values (2026-09-21). The live feed only sends ticks, so the
   * tracked bar can miss its last ticks; at each new bar the data source asks the broker for the last few finished bars
   * and passes them here BEFORE the new bar is evaluated. Only bars already in the history are touched (never adds, never
   * reorders; the newest tracked bar is only touched with includeNewest: true, which the data source passes when a NEW bar
   * has just started, i.e. when that newest tracked bar is by definition finished).
   * @returns {Array<{time:number, dOpen:number, dHigh:number, dLow:number, dClose:number}>} what changed (empty = the tracked bars were already exact)
   */
  reconcileRecentCandles(symbol, finalBars, { lookback = 6, includeNewest = false } = {}) {
    const hist = this.history.get(symbol);
    if (!hist || hist.length < (includeNewest ? 1 : 2)) return [];
    const changes = [];
    const byTime = new Map(finalBars.map((b) => [b.time, b]));
    for (let i = hist.length - (includeNewest ? 1 : 2); i >= Math.max(0, hist.length - 1 - lookback); i--) {
      const fin = byTime.get(hist[i].time);
      if (!fin) continue;
      const cur = hist[i];
      const d = { time: cur.time, dOpen: fin.open - cur.open, dHigh: fin.high - cur.high, dLow: fin.low - cur.low, dClose: fin.close - cur.close };
      if (d.dOpen !== 0 || d.dHigh !== 0 || d.dLow !== 0 || d.dClose !== 0) {
        hist[i] = { ...cur, open: fin.open, high: fin.high, low: fin.low, close: fin.close };
        changes.push(d);
      }
    }
    return changes;
  }

  /**
   * @param {Record<string, Array>} candlesBySymbol - symbol -> full sorted-ascending array of CLOSED historical candles
   * @param {object} [opts]
   * @param {(event: object, candle: object) => void} [opts.onEvent] - called with every event the replay produces, in order, plus the candle that produced it. Omitted by default, which keeps warm-up exactly as silent as before (the production boot path passes nothing). Used by the chart-overlay builder to recover the FVG zones and signals this replay would otherwise compute and throw away - the candle is passed alongside because some engine events ('expired') carry no timestamp of their own.
   */
  warmUp(candlesBySymbol, { onEvent = null, completeDivergencePair = false } = {}) {
    for (const symbol of this.symbols) {
      const candles = candlesBySymbol[symbol];
      if (!candles || candles.length === 0) continue;
      this._warmUpOneSymbol(symbol, candles, onEvent, completeDivergencePair ? candlesBySymbol : null);
    }
  }

  // completeDivergencePair (2026-09-21, REPLAYS/REPORTS ONLY - the production boot never passes it): the sequential-equivalence quirk described above
  // means the FIRST symbol of the divergence pair never discovers its own divergence candidates (its partner has no history yet), so every warmUp()
  // replay silently loses half of the Divergence signals (one leg; which one depends on key order). With this flag both legs are computed from the
  // COMPLETE candle arrays of the pair, which is what the live per-tick path (_detectDivergenceSignal, both histories present) sees.
  _warmUpOneSymbol(symbol, candles, onEvent = null, fullCandlesBySymbol = null) {
    const hist = this.history.get(symbol);
    const cfg = this.fvgConfig[symbol];
    const formationIndex = this.formationIndexBySymbol.get(symbol);
    const fvgEngine = cfg ? this._buildFvgEngine(candles, symbol, cfg) : null;

    // Divergence candidates for this symbol's leg of the pair, computed ONCE
    // using whatever history its partner already holds AT THE START of this
    // symbol's warm-up (empty if the partner hasn't been warmed up yet - see
    // the equivalence note above). histB (this symbol's own history) is
    // still being built below, but that's fine: _computeDivergenceCandidates
    // only needs the FINAL history for both legs, and this symbol's own
    // final history is exactly `candles` (passed in whole).
    let divergenceCandidates = null;
    if (this.divergenceConfig && this.divergenceConfig.pair.includes(symbol)) {
      const [symA, symB] = this.divergenceConfig.pair;
      const otherSymbol = symA === symbol ? symB : symA;
      const otherHist = fullCandlesBySymbol && fullCandlesBySymbol[otherSymbol]?.length > 0 ? fullCandlesBySymbol[otherSymbol] : this.history.get(otherSymbol);
      if (otherHist && otherHist.length > 0) {
        const histA = symA === symbol ? candles : otherHist;
        const histB = symA === symbol ? otherHist : candles;
        divergenceCandidates = this._computeDivergenceCandidates(histA, histB, symA, symB);
      }
    }

    // NWOG candidates (2026-09, auto-execute live - see config.js's `nwog`
    // comment and HANDOFF.md). Needs only THIS symbol's own final history
    // (`candles`, no partner involved), so unlike Divergence this can be
    // computed unconditionally up front rather than depending on another
    // symbol's warm-up order.
    const nwogCandidates =
      this.nwogConfig && this.nwogConfig.symbols.includes(symbol) ? this._computeNwogCandidates(candles) : null;

    // Judas Swing candidates (2026-09, activated at the user's explicit
    // request - see config.js's `judasSwing` comment). Same shape as NWOG's
    // own precomputation above: only needs this symbol's own final history.
    const judasSwingCandidates =
      this.judasSwingConfig && this.judasSwingConfig.symbols.includes(symbol)
        ? this._computeJudasSwingCandidates(candles)
        : null;

    // Weekly Liquidity Sweep candidates (2026-09-15, GER40 - see config.js's
    // `weeklySweep` comment and HANDOFF.md). Same shape as NWOG/Judas Swing's
    // own precomputation above: only needs this symbol's own final history.
    const weeklySweepCandidates =
      this.weeklySweepConfig && this.weeklySweepConfig.symbols.includes(symbol)
        ? this._computeWeeklySweepCandidates(candles)
        : null;

    // Breaker Block candidates (2026-09-16, GER40 - see config.js's
    // `breakerBlock` comment and HANDOFF.md). Same shape as NWOG/Judas
    // Swing/Weekly Sweep's own precomputation above: only needs this
    // symbol's own final history.
    const breakerBlockCandidates =
      this.breakerBlockConfig && this.breakerBlockConfig.symbols.includes(symbol)
        ? this._computeBreakerBlockCandidates(candles)
        : null;

    // Silver Bullet candidates (2026-09-17, US100/US500/GER40 - see
    // config.js's `silverBullet` comment and HANDOFF.md). Same shape as
    // NWOG/Judas Swing/Weekly Sweep/Breaker Block's own precomputation
    // above: only needs this symbol's own final history.
    const silverBulletCandidates =
      this.silverBulletConfig && this.silverBulletConfig.symbols.includes(symbol)
        ? this._computeSilverBulletCandidates(candles)
        : null;

    // CBDR candidates (2026-09-18, US100 only - see config.js's `cbdr`
    // comment and HANDOFF.md). Same shape as NWOG/Judas Swing/Weekly Sweep/
    // Breaker Block/Silver Bullet's own precomputation above: only needs
    // this symbol's own final history.
    const cbdrCandidates =
      this.cbdrConfig && this.cbdrConfig.symbols.includes(symbol) ? this._computeCbdrCandidates(candles) : null;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      if (hist.length > 0 && candle.time <= hist[hist.length - 1].time) continue; // defensive, same guard as ingestCandle
      hist.push(candle);

      const resolvedEvents = [];
      this._resolveOpenPosition(symbol, candle, resolvedEvents);
      this._maybeRequestPyramid(symbol, candle, resolvedEvents);
      if (onEvent) for (const e of resolvedEvents) onEvent(e, candle);

      if (fvgEngine) {
        const evs = fvgEngine.processCandle(candle);
        for (const e of evs) {
          // Index into `hist` (NOT the local loop index `i`) - matches
          // _detectFvgSignal's own `formationIndex.set(e.id, i)`, where its
          // `i` is a loop index over `hist` itself. The two only coincide
          // because warm-up always starts from an empty `hist` (fresh boot),
          // so `hist.length - 1 === i` at every step here too - spelled out
          // explicitly rather than relying on that coincidence silently.
          if (e.type === 'watching') formationIndex.set(e.id, hist.length - 1);
          const signal = this._processFvgEvent(symbol, cfg, candle, e, hist, formationIndex); // primarily a side effect (may open a position); the enriched signal is only used when a caller is collecting
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (divergenceCandidates) {
        const candidate = divergenceCandidates.find((cd) => cd.entryTime === candle.time && cd.symbol === symbol);
        if (candidate) {
          const signal = this._processDivergenceCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (nwogCandidates) {
        const candidate = nwogCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processNwogCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (judasSwingCandidates) {
        const candidate = judasSwingCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processJudasSwingCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (weeklySweepCandidates) {
        const candidate = weeklySweepCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processWeeklySweepCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (breakerBlockCandidates) {
        const candidate = breakerBlockCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processBreakerBlockCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (silverBulletCandidates) {
        const candidate = silverBulletCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processSilverBulletCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      if (cbdrCandidates) {
        const candidate = cbdrCandidates.find((cd) => cd.entryTime === candle.time);
        if (candidate) {
          const signal = this._processCbdrCandidate(symbol, candle, candidate);
          if (onEvent) onEvent(signal, candle);
        }
      }

      // Second pass (see _resolveOpenPosition's 2026-09-19 comment): catches
      // a position a mechanism above JUST opened THIS candle, against this
      // same candle's own high/low - idempotent for a pre-existing position
      // already checked earlier this same iteration, no-op when nothing is open.
      const secondPassEvents = [];
      this._resolveOpenPosition(symbol, candle, secondPassEvents);
      if (onEvent) for (const e of secondPassEvents) onEvent(e, candle);
    }
  }
}
