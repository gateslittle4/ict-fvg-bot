// cTraderDataSource.js
// Live data source backed by the cTrader Open API, using the community
// "@reiryoku/ctrader-layer" client (handles the protobuf/TCP transport).
//
// !!! STATUS: WRITTEN AGAINST DOCUMENTATION, NOT YET TESTED LIVE !!!
// This module cannot be exercised end-to-end until CONFIG.broker has real
// values (clientId/clientSecret/accessToken/accountId) from a completed
// cTrader Open API app registration + OAuth authorization - see
// docs/CTRADER_SETUP.md for that one-time setup the user has to do
// themselves (it requires their own login on the cTrader/broker side).
//
// The first live run should be treated as an integration test: watch the
// server logs closely, and expect to iterate on exact protobuf message/field
// names against https://help.ctrader.com/open-api/messages/ if anything
// doesn't match.
//
// !!! ORDER PLACEMENT (2026-09, pyramid add-on) - EXTRA CAUTION !!!
// Everything above only READS (candles, spot prices, balance, closed deals).
// _placeStopOrder()/_cancelOrder() below are the first code in this project
// that WRITES to the real account - they submit/cancel a real order via
// ProtoOANewOrderReq/ProtoOACancelOrderReq. Gated behind CONFIG.pyramid.enabled
// (false by default - see config.js) AND still requires the OAuth token to
// have been granted "trade" scope, not just market-data read access (see
// docs/CTRADER_SETUP.md). The volume field's exact unit (documented as the
// symbol's smallest tradable unit, commonly lots * lotSize * 100, but this
// has NEVER been confirmed against a real ProtoOASymbolsListReq response -
// see _loadSymbols()) is the single riskiest unverified detail here: a wrong
// scaling silently sends the wrong position size on a REAL order, unlike a
// backtest where a sizing bug only produces a wrong number in a report. Do
// not flip PYRAMID_ENABLED=true before confirming this against a real demo
// account's symbol list.

import { CTraderConnection } from '@reiryoku/ctrader-layer';
import { getDefaultAccount } from '../accountRegistry.js';
import { CONFIG } from '../config.js';
import { calculateLotSize, getDefaultSpec, buildSpecFromBrokerSymbol } from '../engines/lotCalculator.js';
import { describeBrokerPayload, extractBrokerError } from './brokerPayload.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../backtest/nySession.js';
import { pairDealsIntoTrades } from './dealPairing.js';
import { reconcileAccount, estimateEquity, computeStaleBeliefsToClear, computeRealOnlyPositionsToAdopt, computeMissingStopFixes } from './accountReconciliation.js';
import { createSpreadAggregator, toSpreadRow, upsertSpreadRows, logOrderEvent, extraTradeFields } from './demoTrackingLog.js';
import { createTradeLogClient, logClosedTrade, fetchRecentTradeRows, enrichTradesWithRMultiple, enrichTradesWithSlippage } from './supabaseTradeLog.js';
import { buildComplianceChecklist, requiredH1LookbackCandles, requiredPreEntryContextCandles } from './tradeCompliance.js';
import { buildChartOverlays } from '../backtest/chartOverlays.js';
import { recordAlert } from '../alertHistory.js';
import { evaluateLiveFilters } from '../backtest/liveFvgFilterStatus.js';
import {
  nwogLiveStatus,
  judasSwingLiveStatus,
  weeklySweepLiveStatus,
  breakerBlockLiveStatus,
  silverBulletLiveStatus,
  divergenceLiveStatus,
} from '../backtest/liveMechanismStatus.js';

const HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com'; // use live.ctraderapi.com for a real (non-demo) account
const PORT = 5035;

// Phase 1 of the multi-account rollout (see HANDOFF.md/accountRegistry.js):
// this data source, like the other two, still only ever drives the single
// default account - kept as a local `store` alias so the rest of this file
// (and its comments referring to "store.X") reads exactly as before.
const store = getDefaultAccount();

// cTrader trendbar period enum name for our configured timeframe.
const PERIOD_BY_TIMEFRAME = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1' };
const MAX_TRENDBARS_PER_REQUEST = 24000; // >= the 23 520 bars (245 days of M15) the broker is known to return in one call, so the M15 export stays a single request

/** Splits a look-back of `days` into windows of at most maxBars bars each: [{fromDaysAgo, toDaysAgo, spanDays}], newest first. */
export function planHistoryWindows(days, barsPerDay, maxBars) {
  const spanMax = Math.max(1, Math.floor(maxBars / barsPerDay));
  const out = [];
  for (let to = 0; to < days; to += spanMax) {
    const from = Math.min(days, to + spanMax);
    out.push({ fromDaysAgo: from, toDaysAgo: to, spanDays: from - to });
  }
  return out;
}
const TIMEFRAME_DURATION_MS = { M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000 };

// 2026-09-13 (Esdras: "on fait le changement pour m1 pour btc seulement,
// laisser tout les autres pairs a leur configuration normale") - per-symbol
// timeframe override, TEMPORARY alongside every other BTCUSD entry (see
// config.js). Every other symbol keeps reading CONFIG.timeframe (M15)
// exactly as before - this only branches for a symbol that explicitly sets
// its own `timeframe` in CONFIG.fvg.perSymbol[symbolName].
function resolveSymbolTimeframe(symbolName) {
  return CONFIG.fvg.perSymbol?.[symbolName]?.timeframe || CONFIG.timeframe;
}
const MAX_SPREAD_SAMPLES = 500; // ring buffer size for store.recentTicksBySymbol - a few hours of ticks, plenty for a spread sanity check

// @reiryoku/ctrader-layer's sendCommand() has NO built-in timeout - its promise
// only settles when a response with a matching clientMsgId arrives, so a
// request the server never answers (rate limit, oversized response, an
// unexpected field) hangs start() forever with zero error and zero log line -
// confirmed live on the first real deploy (boot stalled silently right after
// account auth). Every boot-time request is wrapped in this so a stuck call
// fails loud instead of hanging the whole connection indefinitely.
const CTRADER_REQUEST_TIMEOUT_MS = 20000;

// Exported (2026-09-12) so server.js's admin test-order-cycle endpoint can
// reuse the exact same fail-loud-not-silent wrapper for its own direct
// ProtoOA* calls, instead of duplicating this logic or risking a hung HTTP
// request against the live broker.
// ProtoOANewOrderReq's own unit for relativeStopLoss/relativeTakeProfit:
// "Specified in 1/100000 of unit of a price".
export const RELATIVE_PRICE_SCALE = 100000;

/**
 * Converts an ABSOLUTE protection price (stop-loss or take-profit) into the
 * relative DISTANCE a MARKET order has to express it as.
 *
 * 2026-09-18. cTrader's own message definition, vendored with the library at
 * node_modules/@reiryoku/ctrader-layer/protobuf/OpenApiMessages.proto, says
 * this outright on ProtoOANewOrderReq:
 *
 *   optional double stopLoss   = 11; // The absolute Stop Loss price (...). Not supported for the MARKER orders.
 *   optional double takeProfit = 12; // The absolute Take Profit price (...). Unsupported for the MARKER orders.
 *   optional int64 relativeStopLoss   = 19; // (...) for BUY stopLoss = entryPrice - relativeStopLoss, for SELL stopLoss = entryPrice + relativeStopLoss.
 *   optional int64 relativeTakeProfit = 20; // (...) for BUY takeProfit = entryPrice + relativeTakeProfit, for SELL takeProfit = entryPrice - relativeTakeProfit.
 *
 * ("MARKER" is Spotware's own typo for "MARKET".) Every strategy order but
 * FVG is a MARKET order and every one of them was sent with absolute
 * stopLoss/takeProfit - which is why not one ever reached the broker, while
 * the four /admin/test-order-cycle MARKET orders, which carry no protection
 * at all, were accepted and filled in ~290ms each.
 *
 * Sign is deliberately dropped: the broker derives the side itself from
 * tradeSide (see the quoted comments above), so what it wants is a positive
 * DISTANCE. That also means the stop ends up anchored on the REAL fill
 * price rather than on the signal's own entryPrice - which preserves the
 * intended risk distance exactly, instead of letting 15 minutes of drift
 * between the candle close and the fill silently widen or shrink the R this
 * trade was sized for.
 *
 * @returns {number|null} the distance in 1/100000 price units, or null when
 *   the inputs cannot produce a real one - never 0, since a zero-distance
 *   protection reads as "no protection" and would open an unguarded position.
 */
export function relativeProtectionStep(priceDigits) {
  // Number(null) is 0 and Number('') is 0 - both would read as "this symbol
  // quotes whole numbers" and round a stop away entirely. Only an actual
  // number counts as a stated precision.
  if (typeof priceDigits !== 'number') return 1;
  const digits = priceDigits;
  if (!Number.isInteger(digits) || digits < 0 || digits > 5) return 1;
  return 10 ** (5 - digits);
}

export function toRelativeProtectionDistance(referencePrice, protectionPrice, priceDigits = null) {
  const reference = Number(referencePrice);
  const protection = Number(protectionPrice);
  if (!Number.isFinite(reference) || reference <= 0) return null;
  if (!Number.isFinite(protection) || protection <= 0) return null;
  const step = relativeProtectionStep(priceDigits);
  // Round to whole 1/100000 units FIRST: float subtraction leaves noise
  // (29516.925 - 29415.98 is 100.94499999999516 here), and rounding straight
  // to the symbol grid would let that noise decide which step it lands on.
  const raw = Math.round(Math.abs(protection - reference) * RELATIVE_PRICE_SCALE);
  const distance = Math.round(raw / step) * step;
  return distance > 0 ? distance : null;
}

export async function sendCommandWithTimeout(connection, payloadName, data, timeoutMs = CTRADER_REQUEST_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${payloadName} timed out after ${timeoutMs}ms - cTrader server never responded`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([connection.sendCommand(payloadName, data), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pure decision logic for CTRADER_ACCOUNT_ID auto-discovery (2026-09, added
 * so a first-time connection doesn't require already knowing the account id
 * - see start()). Exactly one account found -> use it (the common case: one
 * person, one FundingPips cTrader account under this login). Zero or
 * several -> refuse to guess and list what was found, so the caller can set
 * CTRADER_ACCOUNT_ID explicitly and redeploy - silently picking "the first
 * one" when there are several would risk trading the WRONG account.
 * @param {Array<{ctidTraderAccountId:number|string}>} accounts - from ProtoOAGetAccountListByAccessTokenReq's response (field name UNVERIFIED against a real response - see start())
 * @returns {number|string} the single resolved account id
 * @throws if accounts.length !== 1
 */
export function pickAccountOrThrow(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(
      'No cTrader trading accounts found for this access token. Double-check the OAuth authorization actually granted access to the right account, then retry.'
    );
  }
  if (accounts.length > 1) {
    const ids = accounts.map((a) => a.ctidTraderAccountId).join(', ');
    throw new Error(
      `${accounts.length} cTrader trading accounts found for this access token (${ids}) - set CTRADER_ACCOUNT_ID explicitly to the right one and redeploy, rather than guessing.`
    );
  }
  return accounts[0].ctidTraderAccountId;
}

/**
 * Fold the latest live tick price into the displayed last candle (pure, so
 * it's unit-testable without a broker connection). ProtoOASpotEvent carries
 * bid/ask on EVERY tick, far more often than a trendbar update - without
 * this, store.lastCandleBySymbol only moved when a trendbar arrived, which is
 * why the chart's rightmost price looked stale ("prix ancien", a real
 * reported observation). Display-only: the returned candle is never fed to
 * the strategy engine (only closed trendbars are), so no-lookahead is
 * untouched. Returns `existing` unchanged when there's nothing to fold yet
 * (no candle seen, or a missing/non-finite price).
 * @param {{open:number,high:number,low:number,close:number,time:number}|null|undefined} existing
 * @param {number|null} price - the live tick price (e.g. bid), already unscaled
 */
export function foldLiveBidIntoCandle(existing, price) {
  if (!existing || typeof price !== 'number' || !Number.isFinite(price)) return existing ?? null;
  return {
    ...existing,
    close: price,
    high: Math.max(existing.high, price),
    low: Math.min(existing.low, price),
  };
}

// 2026-09-14 (Esdras, watching overnight: "on dirait que le garde-fou se
// réinitialise à chaque redémarrage") - real bug found, but NOT the one it
// first looked like. _loadClosedDeals() below already replays the last 24h
// of REAL closed deals into GuardrailEngine.recordTrade() at boot specifically
// so tradesToday/dailyLossPct survive a restart - that mechanism DOES exist.
// The bug: ProtoOADealListReq's response order is never guaranteed
// chronological (unverified against docs, and this broker's other quirks -
// string-serialized numeric fields, inconsistent per-field - already earned
// it the benefit of no doubt), and GuardrailEngine._ensureDay() WIPES
// this.trades every time the computed day-key changes - correct for its
// real intended use (a live, forward-only stream of trades as they close),
// but unsafe for a historical batch replay whose 24h window almost always
// spans two calendar days (any boot after 00:00 UTC pulls in some of
// yesterday's deals too). If even one out-of-order deal from "yesterday"
// lands between two "today" deals during replay, _ensureDay() flips the
// day-key back and wipes out the today trades already recorded - then
// flips forward again and starts today's count over from that point,
// silently under-counting. Confirmed live: real BTCUSD trades from earlier
// the same day were gone from tradesToday after a restart, and this
// account DID have real closed deals late the prior evening still inside
// the 24h lookback window at boot time.
// Fix: sort chronologically (ascending) before replaying, so every
// _ensureDay() transition this batch triggers moves strictly forward
// through time, matching the one assumption _ensureDay() actually makes.
// Number(...) - not a bare `-` on the raw values - because
// executionTimestamp is a STRING on this broker (see the comment at the
// call site below); `a - b` on two numeric strings still works via JS's
// implicit coercion, but doing it explicitly here is the same defense-in-
// depth precedent as every other numeric field on this broker.
export function sortDealsChronologically(deals) {
  return [...(deals || [])].sort((a, b) => Number(a.executionTimestamp) - Number(b.executionTimestamp));
}

/**
 * Scales one of this broker's monetary int64 fields (ProtoOATrader.balance,
 * closePositionDetail.balance, ...) into real currency units.
 *
 * Exists as its own exported helper because reading these fields wrong is
 * the single most recurrent bug class in this integration: this broker
 * serializes EVERY int64 as a JSON STRING (see dealPairing.js's long
 * comment, sortDealsChronologically above, and _submitOrder), so the
 * natural-looking `typeof raw === 'number'` guard is always false and
 * silently skips the assignment. That exact guard shipped in _loadBalance
 * and left the bot reporting accountRuntime.js's hardcoded 10000
 * placeholder as a real balance for days, against a true broker balance of
 * 10942.99 - caught 2026-09-16 only because Esdras compared the dashboard
 * to the cTrader app by hand.
 *
 * @param {string|number|null|undefined} raw - the broker's raw field
 * @param {number} [moneyDigits=2] - ProtoOA*'s own moneyDigits exponent
 * @returns {number|null} the scaled amount, or null if `raw` is absent or
 *   unparseable - NEVER a silently-wrong 0 (Number(null) is 0, and 0 is
 *   finite, so a null field would otherwise read as a zeroed-out account).
 */
export function parseBrokerMoney(raw, moneyDigits = 2) {
  if (raw == null) return null;
  // Number('') and Number('   ') are both 0, and 0 is finite - an empty
  // field would otherwise read as a genuinely zeroed-out account.
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / 10 ** (moneyDigits ?? 2);
}

export class CTraderDataSource {
  /**
   * @param {{account?: import('../accountRuntime.js').AccountRuntime, brokerConfig?: object, symbols?: string[]}} [opts]
   * Multi-account rollout (2026-09, Phase 2 - see HANDOFF.md/accountRegistry.js):
   * `account` is which AccountRuntime this connection feeds (defaults to the
   * module-level `store` alias for any caller that hasn't been updated, e.g.
   * existing unit tests that construct this with no args); `brokerConfig`
   * is that SAME account's own credentials (defaults to the global
   * CONFIG.broker, i.e. today's single-account behavior) - each account gets
   * its own instance with its own credentials, never CONFIG.broker shared
   * across accounts. `symbols` stays shared/global by default (CONFIG.symbols)
   * per the rollout's scope decision: strategy config (which symbols, session
   * windows, RR) is the same for every account, only broker/risk/guardrails vary.
   */
  constructor({ account = store, brokerConfig = CONFIG.broker, symbols = CONFIG.symbols } = {}) {
    this.account = account;
    this.brokerConfig = brokerConfig;
    this.symbols = symbols;
    this.connection = null;
    this.symbolIdByName = new Map();
    this.symbolNameById = new Map();
    // symbolName -> sizing spec built from the broker's OWN ProtoOASymbol,
    // fetched at boot by _loadSymbolSpecs(). Read through _specFor(), which
    // falls back to lotCalculator.js's placeholders for anything the broker
    // did not answer for.
    this.brokerSymbolSpecByName = new Map();
    // Bookkeeping ONLY for the pyramid add-on leg, kept here (not in
    // LiveStrategyEngine) because by design that engine drops all tracking
    // of a pyramid leg the moment it's filled - see markPyramidOrderFilled()
    // in liveStrategyEngine.js. `pyramidOrderSymbolByOrderId` correlates a
    // PENDING order's broker-assigned id back to "which symbol" so its fill
    // event can be attributed; `pyramidPositionIdBySymbol` then does the same
    // for the resulting OPEN position so its eventual close can be attributed
    // too (feeding the guardrail/notifications, same as the original
    // position's close already does).
    this.pyramidOrderSymbolByOrderId = new Map();
    this.pyramidPositionIdBySymbol = new Map();
    // Every auto-execute ENTRY order this process has submitted (FVG/
    // Divergence/NWOG/Judas Swing alike - see _handleAutoExecuteEntry),
    // keyed by the broker-assigned orderId, so _handleExecutionEvent can
    // react to its REAL outcome (filled vs cancelled/expired/rejected)
    // instead of leaving LiveStrategyEngine's own optimistic 'validated'
    // belief as the only source of truth (2026-09, at Esdras's explicit
    // request - "il faut que l'ordre passe vraiment"). Entries are removed
    // once their outcome is known either way.
    this.pendingEntryOrderByOrderId = new Map();
    // How many ms to ADD to a candle time held by LiveStrategyEngine to get
    // back a genuine UTC instant. This source deliberately shifts candles
    // into the backtest's fixed-EST-as-UTC convention before feeding the
    // engine (see _toEngineCandle() and the 2026-09-08 session-window bug it
    // fixes), so anything DISPLAYING those retained candles - the market
    // chart's /api/candles, for one - has to undo the shift or it shows
    // every timestamp 5 hours early. Exposed as a property rather than
    // re-derived from store.mode at each call site: the convention belongs
    // to whichever data source produced the candles, not to a global flag.
    this.candleTimeOffsetMs = FIXED_EST_TO_UTC_OFFSET_MS;

    // Durable per-symbol trade journal (2026-09, at the user's explicit
    // request after "je perds beaucoup en US500, est-ce normal?" turned out
    // to be unanswerable - store.signalLog is capped at 200 entries AND
    // lives only in memory, wiped on every Render restart/sleep. Opt-in,
    // same pattern as keepAlive.js: createTradeLogClient() returns null
    // (persistence silently skipped) unless SUPABASE_URL/SUPABASE_SERVICE_KEY
    // are set.
    this.tradeLogClient = createTradeLogClient();
    // Demo tracking (2026-09-20): spread per 15-minute bucket -> bot_spread_samples, flushed every minute once a bucket has ended
    this.spreadAggregator = createSpreadAggregator();
    this.lastSpreadBySymbol = new Map();
    if (this.tradeLogClient) {
      this._spreadFlushTimer = setInterval(() => {
        const done = this.spreadAggregator.take(Date.now());
        if (done.length) upsertSpreadRows(this.tradeLogClient, done.map(toSpreadRow));
      }, 60000);
      this._spreadFlushTimer.unref?.();
    }
    // 2026-09-14 FIX (Esdras: "corrige pour voir le vrai P&L du courtier",
    // after spotting the durable journal (17%) disagreeing with the live
    // cTrader-queried journal (0%) on the SAME trades): this used to be
    // openTradesById, filled from the ENGINE's own simulated 'validated'/
    // 'closed' events (LiveStrategyEngine's _resolveOpenPosition guessing
    // stop-vs-target from candle highs/lows) - logged on EVERY candle
    // regardless of whether a real order was ever sent or confirmed. Now
    // keyed by the REAL broker positionId (always String()'d - this
    // broker serializes it as a JSON string on some events, a bug pattern
    // hit twice already tonight) and populated ONLY once
    // _handleExecutionEvent confirms a real fill (see there) - so the
    // durable journal logs the SAME real grossProfit dealPairing.js's
    // trade-history view already uses, not a second, independently-guessed
    // outcome.
    this.openPositionInfoByPositionId = new Map();
    // 2026-09-17, real incident: a connection can silently degrade into
    // still receiving spot/candle ticks (so the dashboard looks fine) while
    // no longer delivering ProtoOAExecutionEvent pushes at all - two real
    // auto-execute orders got no confirmation for 6+ hours before a reboot
    // (triggered by an unrelated deploy) silently fixed it. Tracked here so
    // _submitOrder can force a clean restart once this repeats (see there),
    // rather than running in that undetectable half-broken state for hours.
    this._consecutiveOrderConfirmationTimeouts = 0;
    // 2026-09-18, see _handleOrderError below and brokerPayload.js's header:
    // the LAST refusal the broker told us about, kept so a human can read
    // the real reason after the fact instead of inferring it from a silence.
    // `_pendingOrderRejection` is the same thing scoped to one in-flight
    // submission - armed (cleared) by _submitOrder just before it sends, and
    // consumed by it once it knows no orderId came back.
    this.lastOrderRejection = null;
    this._pendingOrderRejection = null;
  }

  /**
   * Every push the broker sends that this process acts on, subscribed in
   * one place (2026-09-18) so "which broker messages are we actually
   * listening to?" has a single, readable answer - the question behind
   * today's diagnosis, where the answer turned out to be "not the one
   * carrying order refusals".
   *
   * Extracted from start() rather than inlined there so the listeners can
   * be armed against a mock connection in a unit test, which is the only
   * safe way to exercise a refusal (no real order, no real money).
   */
  _registerBrokerEventListeners() {
    // ROOT CAUSE FIX (2026-09-10): connection.on(name, listener) delivers a
    // CTraderLayerEvent WRAPPER, not the raw decoded payload - see
    // CTraderLayerEmitter.notifyListeners() (`new CTraderLayerEvent({ type,
    // date, descriptor })`) and CTraderLayerEvent itself (#type/#date/
    // #descriptor are private class fields, only reachable via getters).
    // The actual message fields (executionType, deal, order, position, ...)
    // live under event.descriptor, NOT on event directly - `event.foo` is
    // always undefined. This was silently swallowing every single push
    // event since this code was written: _handleExecutionEvent() below was
    // reading event.executionType etc. off the wrapper and finding nothing,
    // so guardrail P&L updates / pyramid fill tracking from REAL broker
    // executions never fired (a genuinely serious bug: the bot has been
    // "flying blind" on live trade confirmations). Confirmed by adding a
    // diagnostic JSON.stringify(event) log for ProtoOASpotEvent (same bug,
    // see _subscribeLiveCandles below) - it printed `{}` on every boot,
    // which looked like "the event never fires" but actually meant "the
    // event fires constantly, JSON.stringify just can't see private fields
    // behind getters". console.log(event) directly (util.inspect, not
    // JSON.stringify) would have shown the wrapper's shape correctly and
    // caught this immediately - lesson for next time, and the lesson
    // describeBrokerPayload() now applies everywhere a broker payload is
    // logged.
    this.connection.on('ProtoOAExecutionEvent', (event) => this._handleExecutionEvent(event.descriptor));
    // 2026-09-18, THE missing subscription. ProtoOAExecutionEvent only ever
    // describes an order that EXISTS - accepted, filled, cancelled,
    // expired, rejected. When cTrader refuses an order at validation time
    // it never creates one, so no execution event is ever sent: the
    // refusal arrives here instead, and here alone, with the reason in
    // errorCode/description. Nothing in this codebase subscribed to it,
    // which is why three real refused orders (17/09 x2, 18/09 x1 - see
    // brokerPayload.js's header for the full evidence) looked exactly like
    // a dead connection and cost hours of the wrong diagnosis.
    this.connection.on('ProtoOAOrderErrorEvent', (event) => this._handleOrderError(event.descriptor));
  }

  /**
   * The broker refused an order outright. Records it, says so loudly in the
   * durable Render logs, and pushes it to ntfy - a refusal is the one thing
   * about auto-execution a human genuinely needs to hear about, since it
   * means a validated signal produced no trade at all and will keep
   * producing none until whatever it names is fixed.
   *
   * @param {object} descriptor - a ProtoOAOrderErrorEvent descriptor, or any
   *   payload extractBrokerError() can read a refusal out of.
   * @returns {object|null} the recorded rejection, or null if there was none.
   */
  _handleOrderError(descriptor) {
    const error = extractBrokerError(descriptor);
    if (!error) {
      // Subscribed to this event and still could not read a reason out of
      // it: dump it raw rather than drop it. That is the whole point of
      // this path - never again answer "why did the order not go through?"
      // with a shrug.
      console.error(`[order-error] broker sent an order error this code could not parse - raw: ${describeBrokerPayload(descriptor)}`);
      return null;
    }
    const rejection = { ...error, receivedAtMs: Date.now() };
    this.lastOrderRejection = rejection;
    this._pendingOrderRejection = rejection;
    console.error(
      `[order-error] broker REFUSED the order: errorCode=${rejection.errorCode} description=${rejection.description} ` +
        `orderId=${rejection.orderId} positionId=${rejection.positionId} - raw: ${describeBrokerPayload(descriptor)}`
    );
    this._notifyText(
      `⛔ Ordre REFUSÉ par le courtier : ${rejection.errorCode ?? 'motif sans code'} - ${rejection.description ?? 'aucune description'}. Aucune position ouverte.`
    );
    return rejection;
  }

  async start() {
    const store = this.account;
    const { clientId, clientSecret, accessToken } = this.brokerConfig;
    let accountId = this.brokerConfig.accountId;
    if (!clientId || !clientSecret || !accessToken) {
      throw new Error(`CTraderDataSource.start() called without full broker credentials for account "${store.id}"`);
    }

    this.connection = new CTraderConnection({ host: HOST, port: PORT });
    await this.connection.open();
    console.log('[cTrader] socket open, authenticating application...');

    await sendCommandWithTimeout(this.connection, 'ProtoOAApplicationAuthReq', { clientId, clientSecret });
    console.log('[cTrader] application authenticated');

    if (!accountId) {
      // CTRADER_ACCOUNT_ID not set (first connection) - discover it via the
      // access token instead of requiring the user to hunt for it manually.
      // UNVERIFIED against a real response: the exact response field name
      // (`ctidTraderAccount`, per help.ctrader.com's ProtoOAGetAccountListByAccessTokenReq
      // docs - a REST "Connect API" alternative some forum posts mention
      // appears to be legacy/undocumented and returned 404 when tried
      // 2026-09-07) and whether it comes back as `res.ctidTraderAccount` or
      // nested differently - logged in full below either way so a boot
      // failure here is still diagnosable from the deploy logs.
      const res = await sendCommandWithTimeout(this.connection, 'ProtoOAGetAccountListByAccessTokenReq', { accessToken });
      const accounts = res.ctidTraderAccount || res.accounts || [];
      console.log('[cTrader] CTRADER_ACCOUNT_ID not set - discovered accounts for this access token:', JSON.stringify(accounts));
      accountId = pickAccountOrThrow(accounts);
      console.log(
        `[cTrader] auto-selected account ${accountId} (the only one found) - set CTRADER_ACCOUNT_ID=${accountId} to pin this explicitly and skip discovery on the next boot`
      );
    }
    this.accountId = accountId;

    await sendCommandWithTimeout(this.connection, 'ProtoOAAccountAuthReq', {
      ctidTraderAccountId: Number(accountId),
      accessToken,
    });
    console.log(`[cTrader] account ${accountId} authenticated`);

    // Heartbeat keeps the socket alive - cTrader disconnects idle sessions.
    this._heartbeat = setInterval(() => {
      this.connection.sendHeartbeat?.();
    }, 25000);

    console.log('[cTrader] loading symbols...');
    await this._loadSymbols(accountId);
    console.log(`[cTrader] loaded ${this.symbolIdByName.size} symbols`);
    console.log('[cTrader] loading broker contract specs...');
    // Best-effort, like the other boot-time broker reads: observation only
    // (see _loadSymbolSpecs), so a failure must never block going live.
    await this._loadSymbolSpecs(accountId).catch((err) =>
      console.warn('[cTrader] could not load broker contract specs (non-fatal, sizing keeps using placeholders):', err.message)
    );
    console.log('[cTrader] loading balance...');
    await this._loadBalance(accountId);
    console.log('[cTrader] subscribing to live candles for', this.symbols.join(', '));
    await this._subscribeLiveCandles(accountId);

    // 2026-09-14 (Esdras: "Alors? Tout se passe bien?" - checking on the
    // guardrail fix live turned up a SECOND, bigger bug behind it): moved
    // here, AFTER warmUp() (called inside _subscribeLiveCandles above), not
    // before it as originally written. warmUp() replays THOUSANDS of real
    // historical candles per symbol (90 days of M15, ~2 days of M1 BTCUSD)
    // through the SAME shared LiveStrategyEngine, whose signal-candidate
    // path calls GuardrailEngine.canTakeNewTrade(candle.time) for its own
    // internal netting/blocking bookkeeping - using each candidate's real,
    // historical (genuinely OLD) timestamp, by design, so warm-up's own
    // simulated day-boundary logic stays internally consistent as it
    // replays through the past. The problem: that call reaches
    // GuardrailEngine._ensureDay(), which unconditionally WIPES
    // this.trades the instant the computed day-key differs from the
    // current one - and warm-up crosses MANY such day boundaries while
    // replaying 90 days of history. With _loadClosedDeals() running BEFORE
    // this (as originally written), every real trade it had just replayed
    // from the last 24h got wiped the moment warm-up's OWN historical
    // replay reached its first day-crossing candidate - completely
    // silently, since warm-up's dayKey naturally lands back on today by
    // the time it finishes (it always replays up through "now"), so the
    // dashboard showed the right DAY but tradesToday=0 regardless of how
    // many real trades had actually happened. Confirmed live: the
    // 2026-09-14 sort-order fix (see sortDealsChronologically above) was
    // proven correct in isolation (replaying the exact real deals through
    // it produces the right count) yet /api/status kept showing
    // tradesToday:0 seconds after a boot whose own log line confirmed the
    // reconstruction itself briefly got it right. Running this AFTER
    // warm-up instead means it's the LAST thing to touch the guardrail
    // before this account goes live - nothing runs afterward to disturb
    // it again.
    console.log('[cTrader] loading last 24h of closed deals...');
    await this._loadClosedDeals(accountId);

    // 2026-09-14: every symbol has now been through warmUp() (called inside
    // _subscribeLiveCandles above), which can leave a purely-historical
    // "believed open" position behind, blocking real trading via netting
    // until it naturally times out or someone clears it by hand - see
    // _clearStaleBeliefsAgainstBroker's own header for the full story.
    // Runs once here, right before this account goes live, so a stale
    // belief never survives a restart unnoticed again.
    console.log('[cTrader] checking warm-up beliefs against the real broker account...');
    await this._clearStaleBeliefsAgainstBroker(accountId);

    // 2026-09-14: safety net for the deferCloseToRealConfirmation fix above -
    // a believed-open position now only clears via the REAL
    // ProtoOAExecutionEvent close confirmation (_handleExecutionEvent), not
    // this method's own boot-time-only run. If that real confirmation is
    // ever missed (a dropped event, a disconnect at the wrong instant), the
    // belief would otherwise sit stuck blocking netting on that symbol until
    // the next restart. Re-running the SAME real-broker-state check every 5
    // minutes (not just once at boot) means a genuinely stuck belief - one
    // backed by neither a real position nor a pending order - self-heals
    // within minutes instead of surviving until someone notices or the
    // process happens to restart. Same best-effort discipline as the
    // boot-time call: a failed reconcile here just gets logged and retried
    // next tick, never throws.
    this._staleBeliefSweep = setInterval(() => {
      this._clearStaleBeliefsAgainstBroker(accountId).catch((err) =>
        console.warn('[cTrader] periodic stale-belief sweep failed (non-fatal, retries next tick):', err.message)
      );
    }, 5 * 60 * 1000);

    // 2026-09-16 (same investigation as _loadBalance's int64-as-string fix):
    // the balance used to be read exactly ONCE, at boot, and from then on
    // only nudged by each close this process happened to witness. Anything
    // else that moves the real balance - a deposit, a withdrawal, a trade
    // placed by hand from the cTrader app, a swap charge, or any close that
    // landed while this process was restarting - drifted the dashboard away
    // from the broker silently and permanently until the next deploy. Same
    // best-effort discipline as the sweep above: a failed refresh is logged
    // and retried next tick, never throws, never blocks trading.
    this._balanceRefresh = setInterval(() => {
      this._loadBalance(accountId).catch((err) =>
        console.warn('[cTrader] periodic balance refresh failed (non-fatal, retries next tick):', err.message)
      );
    }, 5 * 60 * 1000);

    this._registerBrokerEventListeners();

    store.mode = 'live';
    console.log(`[cTrader:${store.id}] connected and live for account`, accountId);
  }

  async stop() {
    const store = this.account;
    if (this._heartbeat) clearInterval(this._heartbeat);
    if (this._staleBeliefSweep) clearInterval(this._staleBeliefSweep);
    if (this._balanceRefresh) clearInterval(this._balanceRefresh);
    if (this.connection) await this.connection.close?.();
    store.mode = 'demo';
  }

  async _loadSymbols(accountId) {
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOASymbolsListReq', {
      ctidTraderAccountId: Number(accountId),
    });
    for (const sym of res.symbol || []) {
      this.symbolIdByName.set(sym.symbolName, sym.symbolId);
      // String(...) key (2026-09-18, execution-path audit continued, same
      // class as the orderId map fixes above): symbolNameById is looked up
      // with a symbolId coming from OTHER broker messages (ProtoOADealListReq,
      // ProtoOAExecutionEvent, ProtoOAReconcileReq) - see the 3 read sites'
      // own comments below and accountReconciliation.js's reconcileAccount().
      this.symbolNameById.set(String(sym.symbolId), sym.symbolName);
    }
  }

  /**
   * Fetches the broker's OWN contract spec (ProtoOASymbol) for each traded
   * symbol at boot and turns it into a sizing spec with confirmed volume
   * numbers - see buildSpecFromBrokerSymbol() for the full model and for
   * what the 100000x bug this replaces actually was.
   *
   * These specs are what _specFor() hands to calculateLotSize() and
   * _submitOrder(); only symbols the broker did not answer for fall back to
   * lotCalculator.js's placeholders.
   *
   * Best-effort: a failure here is logged and never blocks boot, exactly
   * like _loadClosedDeals and the stale-belief sweep. Falling back means
   * sizing reverts to the placeholders, which is the pre-2026-09-16
   * behaviour - so _submitOrder still refuses to send a volume it cannot
   * justify (see its own guard).
   */
  async _loadSymbolSpecs(accountId) {
    const wanted = this.symbols
      .map((name) => ({ name, id: this.symbolIdByName.get(name) }))
      .filter((s) => s.id != null);
    if (wanted.length === 0) return;

    const res = await sendCommandWithTimeout(this.connection, 'ProtoOASymbolByIdReq', {
      ctidTraderAccountId: Number(accountId),
      symbolId: wanted.map((s) => Number(s.id)),
    });

    for (const spec of res?.symbol || []) {
      // symbolId comes back as an int64 - i.e. possibly a string on this
      // broker (see parseBrokerMoney). Match on the numeric value rather
      // than relying on either side's serialization.
      const match = wanted.find((s) => Number(s.id) === Number(spec.symbolId));
      if (!match) continue;
      const merged = buildSpecFromBrokerSymbol(spec, getDefaultSpec(match.name));
      if (!merged) {
        console.warn(`[cTrader] broker spec for ${match.name} had no usable lotSize - keeping placeholder sizing`);
        continue;
      }
      this.brokerSymbolSpecByName.set(match.name, merged);
      console.log(
        `[cTrader] broker contract spec ${match.name}: lotSize=${merged.lotSize} ` +
          `minLots=${merged.minVolume} stepLots=${merged.volumeStep} maxLots=${merged.maxVolume} digits=${merged.digits ?? 'unknown'}`
      );
    }

    const missing = wanted.filter((s) => !this.brokerSymbolSpecByName.has(s.name)).map((s) => s.name);
    if (missing.length > 0) {
      console.warn(`[cTrader] no broker contract spec returned for: ${missing.join(', ')}`);
    }
  }

  /**
   * The sizing spec for a symbol: broker-confirmed when we have it, the
   * placeholder from lotCalculator.js otherwise. Single lookup point so
   * auto-execute and the pyramid leg can never disagree about an order's
   * size.
   */
  _specFor(symbolName) {
    return this.brokerSymbolSpecByName.get(symbolName) || getDefaultSpec(symbolName);
  }

  async _loadBalance(accountId) {
    const store = this.account;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOATraderReq', {
      ctidTraderAccountId: Number(accountId),
    });
    // 2026-09 fix: was hardcoded /100. ProtoOATrader.moneyDigits (its own doc:
    // "the exponent of the monetary values... affects balance") is the
    // ACTUAL scale the broker uses - defaulting to 2 (equivalent to the old
    // hardcoded /100) only when the field is genuinely absent, not assuming
    // it up front.
    //
    // 2026-09-16, REAL BUG found live (Esdras: "pourquoi les soldes sont
    // differents ctrader vs le bot" - cTrader showed $10,942.99, the bot
    // showed $9,972.06): the guard here used to be `typeof rawBalance ===
    // 'number'`, but ProtoOATrader.balance is an int64, and THIS BROKER
    // SERIALIZES EVERY int64 AS A JSON STRING (the same trap already
    // documented at length in dealPairing.js and in _submitOrder below -
    // timestamps, ids, volumes, and this). So the guard was ALWAYS false,
    // setBalance() was NEVER called, and the bot silently kept
    // accountRuntime.js's hardcoded 10000 placeholder as its "real" balance
    // forever - then only ever adjusted it by each closed trade's P&L.
    // The arithmetic proof at the moment it was caught: 10000 - 27.94 (that
    // session's one closed trade) = 9972.06, exactly what the dashboard
    // showed, against a real broker balance of 10942.99. Every downstream
    // consumer of the balance was affected, position sizing included.
    // parseBrokerMoney handles both shapes and refuses a missing field
    // outright - see its own doc comment for why that matters here.
    const balance = parseBrokerMoney(res.trader?.balance, res.trader?.moneyDigits);
    if (balance !== null) {
      store.setBalance(balance);
      console.log(`[cTrader:${store.id}] balance loaded from broker: ${balance}`);
    } else {
      // Loud on purpose: a silent failure here is what let the placeholder
      // balance masquerade as real for days.
      console.error(`[cTrader:${store.id}] could NOT read balance from ProtoOATraderReq (got ${JSON.stringify(res.trader?.balance)}) - keeping ${store.balance}, position sizing is NOT using a real balance`);
    }
    // Bug fix (2026-09): the dashboard banner used to hard-code "FundingPips"
    // no matter which broker/environment the connected account actually
    // belongs to. brokerName is the broker's own whitelabel name for the
    // account (ProtoOATrader.brokerName) - may be absent depending on the
    // broker, in which case the dashboard falls back to a generic label
    // rather than showing a name we don't actually know. isDemo is derived
    // from which cTrader host this process connected to (HOST above), not
    // guessed from account data.
    store.setBrokerInfo({ name: res.trader?.brokerName || null, isDemo: HOST.includes('demo') });
  }

  async _loadClosedDeals(accountId) {
    const store = this.account;
    const to = Date.now();
    const from = to - 24 * 3600 * 1000; // last 24h is enough to seed today's guardrail state
    let res;
    try {
      res = await sendCommandWithTimeout(this.connection, 'ProtoOADealListReq', {
        ctidTraderAccountId: Number(accountId),
        fromTimestamp: from,
        toTimestamp: to,
      });
    } catch (err) {
      // Best-effort (2026-09-14, same discipline as
      // _clearStaleBeliefsAgainstBroker below): a failed request here must
      // never block boot - the guardrail just starts this session with an
      // under-counted tradesToday/dailyPnl instead of the real one, same as
      // before this whole reconstruction existed. Logged loud (not before
      // tonight) specifically because a SILENT failure here is
      // indistinguishable from "genuinely 0 trades today" on the dashboard -
      // exactly the confusion that made this bug so hard to pin down live.
      console.warn('[cTrader] _loadClosedDeals request failed (non-fatal, boot continues, guardrail under-seeded this session):', err.message);
      return;
    }
    // 2026-09-14: this broker's ProtoOAErrorRes still comes back as a
    // resolved response (matched by clientMsgId), not a rejected promise -
    // sendCommandWithTimeout only catches TRANSPORT-level failures
    // (timeout), not an application-level error payload like this. Without
    // this check, a rate-limited response (confirmed to happen on this
    // broker under heavy request volume - see the trade-history chart-candle
    // fetch failures elsewhere tonight) would silently look like "0 deals",
    // exactly the same invisible failure mode as the try/catch above.
    if (!Array.isArray(res.deal)) {
      console.warn('[cTrader] _loadClosedDeals got an unexpected response shape (no deal array) - guardrail under-seeded this session:', JSON.stringify(res).slice(0, 500));
      return;
    }
    // sortDealsChronologically (2026-09-14, real bug found live monitoring
    // overnight - see its own doc comment above) - res.deal's order is never
    // guaranteed chronological, and replaying it out of order into
    // GuardrailEngine.recordTrade() can silently wipe out today's
    // already-recorded trades via _ensureDay()'s day-boundary reset.
    let recorded = 0;
    for (const deal of sortDealsChronologically(res.deal)) {
      if (deal.closePositionDetail) {
        const pnl = deal.closePositionDetail.grossProfit / 100; // `/` auto-coerces a string operand - safe even though grossProfit is a string on this broker (confirmed live, see dealPairing.js's comment)
        // Number(...) (2026-09-13, real bug found live): executionTimestamp
        // is a STRING on this broker. GuardrailEngine.recordTrade stores
        // `time` as-is and later does `lastTrade.time + cooldownMinutes...`
        // (a PLUS, not a safe operator) to compute the cooldown window - a
        // string `time` there means STRING CONCATENATION producing a huge
        // garbage number, so after any restart where the last deal in the
        // trailing 24h was a LOSS, the cooldown-after-loss check would
        // compute an absurd multi-year `cooldownRemainingMs` and silently
        // block ALL future trading (`blocked: true, cooldown_active`) until
        // the next restart re-seeds with different data. This is exactly
        // the kind of silent block this whole session has been hunting -
        // found here, not yet observed live, but real and worth fixing
        // immediately rather than waiting for a bust to prove it.
        // symbolNameById may not have this id yet if _loadSymbols() hasn't
        // resolved (boot ordering) - undefined symbol just means this
        // specific replayed trade doesn't seed any symbol's cooldown,
        // tradesToday/dailyLossPct are unaffected either way.
        // String(...) (2026-09-18): deal.symbolId comes from ProtoOADealListReq,
        // a different message than the one that populated symbolNameById
        // (ProtoOASymbolsListReq) - a raw mismatch would silently pass
        // symbol:undefined here, and GuardrailEngine.recordTrade's own
        // `if (symbol)` guard means the per-symbol cooldown-after-loss is
        // simply never armed - no visible symptom, just a defeated safety net.
        store.guardrail.recordTrade({ pnl, time: Number(deal.executionTimestamp), symbol: this.symbolNameById.get(String(deal.symbolId)) });
        recorded++;
      }
    }
    // Loud on purpose (2026-09-14) - the ONLY way to tell "the reconstruction
    // ran and genuinely found nothing" apart from "it silently failed" was
    // exactly the confusion that made tonight's bug-hunt slow. Cheap to log,
    // expensive to debug blind again.
    console.log(`[cTrader] _loadClosedDeals: replayed ${recorded} real closed deal(s) from the last 24h into the guardrail (tradesToday=${store.guardrail.getStatus(to).tradesToday})`);
  }

  /**
   * Trading journal (2026-09, at the user's request): closed trades over the
   * last `days`, each with a small window of candles for a chart. No storage
   * of our own - always queried fresh from cTrader, so it survives restarts
   * for free (this session's explicit choice over adding a database).
   *
   * Two real limits, not worked around because working around them would
   * mean guessing/fabricating data rather than reporting it:
   * - ProtoOADealListReq caps `toTimestamp - fromTimestamp` at 1 week - `days`
   *   is clamped to 7 rather than silently sending an invalid request.
   * - cTrader's deal history has no field for a closed position's planned
   *   stop-loss/take-profit (ProtoOADeal has none; ProtoOAPosition does, but
   *   closed positions no longer appear in a positions listing) - so trade
   *   records intentionally carry only what IS verifiable from the deal
   *   itself (entry, exit, direction, realized P&L), never an invented stop.
   */
  async getTradeHistory({ days = 7, maxTrades = 20 } = {}) {
    const accountId = this.accountId;
    const to = Date.now();
    const from = to - Math.min(days, 7) * 24 * 3600 * 1000;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOADealListReq', {
      ctidTraderAccountId: Number(accountId),
      fromTimestamp: from,
      toTimestamp: to,
    });

    // Which strategy generated each trade (2026-09, at Esdras's request) -
    // ProtoOADeal itself has no label, only ProtoOAOrder.tradeData.label
    // does (set at order placement, see _handleAutoExecuteEntry below), so a
    // second request over the SAME window is needed. Best-effort: a failure
    // here must not break the trade history itself, it just leaves every
    // trade's source unknown (null) rather than guessed.
    let orderLabelsById = new Map();
    try {
      const orderRes = await sendCommandWithTimeout(this.connection, 'ProtoOAOrderListReq', {
        ctidTraderAccountId: Number(accountId),
        fromTimestamp: from,
        toTimestamp: to,
      });
      // String(...) key (2026-09-18, execution-path audit continued) - see
      // dealPairing.js's pairDealsIntoTrades() for the full reasoning: this
      // map's keys must agree with the DEAL's own orderId (a different
      // broker message, ProtoOADealListReq) regardless of how either message
      // actually serializes the field.
      orderLabelsById = new Map(
        (orderRes.order || []).map((o) => [String(o.orderId), o.tradeData && o.tradeData.label])
      );
    } catch (err) {
      console.warn('[cTrader] trade history: failed to fetch order labels (source will show as unknown):', err.message);
    }

    // BTCUSD (2026-09-17, Esdras: "retire tous les trade btc du journal, pas
    // besoin") - the temporary M1 connectivity smoke-test was retired from
    // live trading the same day it ran (see config.js/HANDOFF.md), but its
    // real historical trades kept showing up here since getTradeHistory()
    // just replays whatever the broker's own deal history returns, with no
    // notion of "still an active symbol". Filtered out BEFORE the
    // enrichment loop below (not just hidden client-side) so it also skips
    // the chart-candle/checklist broker fetches for trades nobody wants to
    // see - cheaper, not just tidier. symbolIdByName.get('BTCUSD') can be
    // undefined (symbol never loaded, e.g. a fresh account never subscribed
    // to it) - the `!== btcusdId` comparison then keeps every trade, which
    // is correct (nothing to filter out).
    const btcusdId = this.symbolIdByName.get('BTCUSD');
    const trades = pairDealsIntoTrades(res.deal || [], orderLabelsById)
      .filter((t) => t.symbolId !== btcusdId)
      .slice(0, maxTrades);

    const enriched = [];
    for (const trade of trades) {
      const symbolName = this.symbolNameById.get(String(trade.symbolId)) || `#${trade.symbolId}`; // String(...) - trade.symbolId originates from ProtoOADealListReq via dealPairing.js, a different message than symbolNameById's own ProtoOASymbolsListReq (2026-09-18)
      // 2026-09-14, Esdras (screenshot): the trade-history mini-chart looked
      // wrong for BTCUSD - was already flagged as a known, unfixed gap when
      // per-symbol timeframes shipped ("getTradeHistory()'s chart-candle
      // export still assume the global CONFIG.timeframe"). Concretely: a
      // BTCUSD trade lasting a few M1 minutes was being charted with M15
      // candles and a 3-HOUR margin sized for M15 - the real trade shrank to
      // a sliver between two dashed lines lost in hours of irrelevant
      // padding, exactly what the screenshot showed. Same per-symbol
      // resolution already used for live subscriptions/order-expiry - every
      // other symbol (still M15) is completely unaffected.
      const symbolTimeframe = resolveSymbolTimeframe(symbolName);
      const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
      // 30x, not 12x (2026-09-15, Esdras: "plusieurs bougies avant et après
      // de façon à avoir une vue d'ensemble sur tout le trade") - the
      // journal moved to its own dedicated page (no longer squeezed next to
      // a dozen other cards), so the chart can afford real context on both
      // sides instead of just enough to not look broken.
      const chartMarginMs = 30 * (TIMEFRAME_DURATION_MS[symbolTimeframe] || TIMEFRAME_DURATION_MS.M15);
      let candles = [];
      try {
        const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp: trade.entryTime - chartMarginMs,
          toTimestamp: trade.exitTime + chartMarginMs,
          symbolId: trade.symbolId,
          period,
        });
        candles = (history.trendbar || [])
          .map((bar) => this._trendbarToCandle(bar))
          .sort((a, b) => a.time - b.time);
      } catch (err) {
        // err.message || JSON.stringify(err) (2026-09-13): a real occurrence
        // logged plain `undefined` here, meaning the rejection wasn't a real
        // Error (likely a raw ProtoOAErrorRes-shaped object from the broker,
        // which carries errorCode/description, not .message) - stringify
        // the whole thing as a fallback so a future occurrence is
        // diagnosable instead of showing nothing.
        console.warn(
          `[cTrader] trade history: failed to fetch chart candles for ${symbolName} position ${trade.positionId}:`,
          err.message || JSON.stringify(err)
        );
      }
      enriched.push({ ...trade, symbol: symbolName, candles });
    }

    // R-multiple (2026-09-15, Esdras: "toute information nécessaire pour un
    // vrai journal, le nombre de RRR etc") - cTrader's own deal history has
    // no concept of "risk amount" once a position is closed (this endpoint
    // deliberately shows no stop/target either, same reason - see the
    // dashboard card's own explanation), so rMultiple can only come from
    // the durable journal, which computed it at close time from the real
    // riskAmount (see openPositionInfoByPositionId/_handleExecutionEvent).
    // Best-effort join, matched by symbol + closest exit time - see
    // enrichTradesWithRMultiple's own header for the full reasoning.
    //
    // slippage (2026-09-15, Esdras: "qualité d'exécution") - same join,
    // this time comparing the durable journal's entryPrice (what the
    // SIGNAL targeted) against this endpoint's own entryPrice (the REAL
    // broker fill, opening.executionPrice from dealPairing.js) - see
    // enrichTradesWithSlippage's own header. Reuses the SAME durableRows
    // fetch, not a second round-trip.
    //
    // Both opt-in (same discipline as logClosedTrade itself): silently
    // skipped when Supabase persistence isn't configured, every trade just
    // keeps rMultiple/slippage: undefined rather than the endpoint failing.
    let withJournalData = enriched;
    if (this.tradeLogClient) {
      try {
        const durableRows = await fetchRecentTradeRows(this.tradeLogClient, { days: Math.min(days, 7) });
        withJournalData = enrichTradesWithSlippage(enrichTradesWithRMultiple(enriched, durableRows), durableRows);
      } catch (err) {
        console.warn('[cTrader] trade history: R-multiple/slippage enrichment skipped (durable journal query failed):', err.message);
      }
    }
    return this._attachComplianceChecklists(withJournalData, accountId);
  }

  /**
   * The trade's own CONFIG.<source> block - FVG stays per-symbol
   * (CONFIG.fvg.perSymbol[symbol]), every other live mechanism has one
   * shared config object (CONFIG.nwog/judasSwing/weeklySweep/breakerBlock/
   * silverBullet/divergence). null for an unrecognized/missing source
   * rather than throwing - buildComplianceChecklist() already degrades
   * gracefully to "non vérifiable" items when cfg is null.
   */
  _configForSource(source, symbol) {
    switch (source) {
      case 'fvg': return CONFIG.fvg.perSymbol[symbol] || null;
      case 'nwog': return CONFIG.nwog;
      case 'judaswing': return CONFIG.judasSwing;
      case 'weeklysweep': return CONFIG.weeklySweep;
      case 'breakerblock': return CONFIG.breakerBlock;
      case 'silverbullet': return CONFIG.silverBullet;
      case 'divergence': return CONFIG.divergence;
      default: return null;
    }
  }

  /**
   * "Preuve visuelle de conformité" (2026-09-15, Esdras, after seeing a
   * mockup: "donne tout, pour l'avoir dès le départ"; extended 2026-09-17,
   * Esdras: "combien de checklist on pourrait faire apparaitre? ... Tous")
   * - for each trade, reconstructs whether it actually followed the live
   * strategy's own real procedure, reusing the SAME production functions
   * per mechanism (FvgEngine/computeStop/buildHtfBiasSeries for FVG;
   * detectNwogEvents/detectJudasSwingEvents/detectWeeklySweepEvents/
   * computeBreakerBlockCandidates/computeSilverBulletCandidates for the
   * other 5) rather than a second implementation - see
   * tradeCompliance.js's own header for the full reasoning and its one
   * remaining honestly-scoped gap (Divergence's z-score item needs the
   * PARTNER symbol's history, never fetched here).
   *
   * Two SEPARATE extra broker fetches, neither reused for anything else:
   * - The HTF-bias item ('fvg' only) needs H1 candles far enough back to
   *   seed the configured EMA (requiredH1LookbackCandles), unchanged from
   *   before.
   * - The 5 event-based mechanisms need MORE M15 history before entryTime
   *   than the chart's own 30-candle margin gives (requiredPreEntryContextCandles)
   *   - fetched into a SEPARATE `reconstructionCandles` array, never merged
   *   into `trade.candles` (which stays exactly what the mini-chart
   *   displays - widening that too would make a Weekly Sweep trade's chart
   *   show ~10 days of mostly-irrelevant candles instead of a focused view).
   * A failure in either fetch degrades that item to "non vérifiable", never
   * blocks the rest of the trade's history from loading.
   */
  async _attachComplianceChecklists(trades, accountId) {
    const expectedRiskPct = this.account.strategyEngine?.riskPctPerTrade ?? null;
    const out = [];
    for (const trade of trades) {
      const cfg = this._configForSource(trade.source, trade.symbol);
      let h1Candles = null;
      if (trade.source === 'fvg' && cfg) {
        const lookback = requiredH1LookbackCandles(cfg.variant);
        if (lookback > 0) {
          try {
            // count is REQUIRED alongside fromTimestamp/toTimestamp (2026-09-15,
            // found live via getPendingZoneChecklists()'s own verification below -
            // this exact call, missing count, was silently capped to the
            // broker's own small default and came back too short to seed an
            // EMA200, degrading every bias reading to 'unknown' without ever
            // throwing - see _subscribeLiveCandles()'s own comment: "count alone
            // is not enough" for a from/to-only request to be REJECTED, but the
            // reverse - from/to without count - was never verified until now).
            const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
              ctidTraderAccountId: Number(accountId),
              fromTimestamp: trade.entryTime - lookback * TIMEFRAME_DURATION_MS.H1,
              toTimestamp: trade.entryTime,
              symbolId: trade.symbolId,
              period: 'H1',
              count: lookback,
            });
            h1Candles = (history.trendbar || []).map((bar) => this._trendbarToCandle(bar)).sort((a, b) => a.time - b.time);
          } catch (err) {
            console.warn(
              `[cTrader] trade history: HTF bias fetch failed for ${trade.symbol} (checklist item will read "non vérifiable"):`,
              err.message || JSON.stringify(err)
            );
          }
        }
      }

      let reconstructionCandles = trade.candles || [];
      const extraLookback = requiredPreEntryContextCandles(trade.source);
      if (extraLookback > 0) {
        try {
          const symbolTimeframe = resolveSymbolTimeframe(trade.symbol);
          const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
          const candleDurationMs = TIMEFRAME_DURATION_MS[symbolTimeframe] || TIMEFRAME_DURATION_MS.M15;
          const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
            ctidTraderAccountId: Number(accountId),
            fromTimestamp: trade.entryTime - extraLookback * candleDurationMs,
            toTimestamp: trade.entryTime,
            symbolId: trade.symbolId,
            period,
            count: extraLookback,
          });
          reconstructionCandles = (history.trendbar || []).map((bar) => this._trendbarToCandle(bar)).sort((a, b) => a.time - b.time);
        } catch (err) {
          console.warn(
            `[cTrader] trade history: reconstruction-context fetch failed for ${trade.symbol}/${trade.source} (checklist items will read "non vérifiable"):`,
            err.message || JSON.stringify(err)
          );
          reconstructionCandles = trade.candles || []; // fall back to the (too-narrow) chart candles rather than an empty array - some items may still resolve
        }
      }

      const { zone, items } = buildComplianceChecklist({ trade, candles: reconstructionCandles, cfg, h1Candles, expectedRiskPct });
      out.push({ ...trade, checklist: items, fvgZone: zone });
    }
    return out;
  }

  /**
   * "Pourquoi on n'a pas encore de trade" (2026-09-15, Esdras: "je verrais
   * ce qui est okay, ce qui ne l'est pas encore") - for every zone the real
   * engine currently considers 'watching' on this symbol, evaluates each of
   * the 4 real filter criteria (bias/structure/session/sweep) RIGHT NOW,
   * one by one - the live engine only ever computes their combined AND, so
   * this is the only way to see WHICH ONE is still missing. Reuses
   * buildChartOverlays() (chartOverlays.js) to find the genuinely still-
   * watching zones (its own 'stale' reclassification already handles a zone
   * that's silently outlived its real lifetime - see that file's own
   * comment), and evaluateLiveFilters() (liveFvgFilterStatus.js) for the
   * per-criterion check, both already-real production logic, nothing
   * reimplemented here.
   *
   * EXTENDED (2026-09-17, Esdras, sur le chart: "je veux le suivre de façon
   * live") - `zones` below stays FVG-only exactly as before (a real gap in
   * the checklist coverage: EURUSD/GER40 have no FVG config at all, so this
   * used to return `{zones: [], reason: 'not an FVG-strategy symbol'}` and
   * show NOTHING for them). Now also builds `mechanisms`: one live-status
   * entry per OTHER mechanism actually configured for this symbol (NWOG/
   * Judas Swing/Weekly Sweep/Breaker Block/Silver Bullet/Divergence - see
   * liveMechanismStatus.js for why these need a different shape than FVG's
   * own multi-criterion checklist: most of them fire on a single candle,
   * nothing to watch build up beforehand). The early FVG-only return is
   * GONE - a symbol with no FVG config (EURUSD/GER40) now still gets a
   * real response via `mechanisms`.
   *
   * Time convention, easy to get backwards (see liveFvgFilterStatus.js's
   * own header): `candles` here is store.strategyEngine's OWN retained
   * history, already in ENGINE time (real UTC - 5h, see _toEngineCandle()) -
   * so `atTime` (this symbol's freshest candle) is engine time too, and the
   * freshly-fetched H1 candles below are shifted the SAME way before use,
   * so the bias lookup stays self-consistent with atTime. tradeCompliance.js's
   * OWN bias check (for a closed trade) doesn't need this shift - it compares
   * two real-UTC values against each other - but that trick doesn't apply
   * here since atTime is forced into engine time by where it comes from.
   * liveMechanismStatus.js's own functions don't touch H1 bias at all, so
   * this same shift concern doesn't apply to them - they only ever compare
   * a symbol's own M15 history against itself (or, for Divergence, against
   * the partner's own M15 history, same engine-time convention on both
   * sides since both come from the same store.strategyEngine.getHistory()).
   */
  async getPendingZoneChecklists(symbol) {
    const store = this.account;
    const cfg = CONFIG.fvg.perSymbol[symbol];

    const historyBySymbol = {};
    for (const s of CONFIG.symbols) historyBySymbol[s] = store.strategyEngine.getHistory(s);
    const candles = historyBySymbol[symbol];
    if (!candles || candles.length === 0) return { symbol, zones: [], mechanisms: [], reason: 'no candle history yet' };

    const atTime = candles[candles.length - 1].time;

    let zones = [];
    if (cfg) {
      const { zones: allZones } = buildChartOverlays(historyBySymbol, { symbol });
      const watching = allZones.filter((z) => z.status === 'watching');

      let h1Candles = null;
      const lookback = requiredH1LookbackCandles(cfg.variant);
      if (watching.length > 0 && lookback > 0) {
        try {
          const symbolId = this.symbolIdByName.get(symbol);
          const nowRealUtc = Date.now();
          // count REQUIRED alongside fromTimestamp/toTimestamp - see
          // _attachComplianceChecklists()'s own comment on this same mistake,
          // found live via this exact endpoint: omitted, the broker silently
          // caps the response far short of `lookback`, too little history to
          // seed the EMA, and every bias reading below degrades to 'unknown'
          // without ever throwing (so the catch below never caught it either).
          const res = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
            ctidTraderAccountId: Number(this.accountId),
            fromTimestamp: nowRealUtc - lookback * TIMEFRAME_DURATION_MS.H1,
            toTimestamp: nowRealUtc,
            symbolId,
            period: 'H1',
            count: lookback,
          });
          h1Candles = (res.trendbar || [])
            .map((bar) => this._trendbarToCandle(bar))
            .sort((a, b) => a.time - b.time)
            .map((bar) => ({ ...bar, time: bar.time - FIXED_EST_TO_UTC_OFFSET_MS })); // real UTC -> engine time, matching atTime
        } catch (err) {
          console.warn(
            `[cTrader] pending zone checklist: HTF bias H1 fetch failed for ${symbol} (bias item will read "non vérifiable"):`,
            err.message || JSON.stringify(err)
          );
        }
      }

      zones = watching.map((z) => ({
        id: z.id,
        direction: z.direction,
        top: z.top,
        bottom: z.bottom,
        formedAt: z.formedAt,
        checklist: evaluateLiveFilters({ candles, h1Candles, cfg, direction: z.direction, atTime }),
      }));
    }

    const mechanisms = [];
    if (CONFIG.nwog.symbols.includes(symbol)) mechanisms.push(nwogLiveStatus(candles, { longOnlySymbols: CONFIG.nwog.longOnlySymbols, symbol }));
    if (CONFIG.judasSwing.symbols.includes(symbol)) mechanisms.push(judasSwingLiveStatus(candles));
    if (CONFIG.weeklySweep.symbols.includes(symbol)) mechanisms.push(weeklySweepLiveStatus(candles));
    if (CONFIG.breakerBlock.symbols.includes(symbol)) mechanisms.push(breakerBlockLiveStatus(candles));
    if (CONFIG.silverBullet.symbols.includes(symbol)) mechanisms.push(silverBulletLiveStatus(candles));
    if (CONFIG.divergence.pair.includes(symbol)) {
      const [symA, symB] = CONFIG.divergence.pair;
      const partnerSymbol = symbol === symA ? symB : symA;
      const partnerCandles = historyBySymbol[partnerSymbol];
      if (partnerCandles && partnerCandles.length > 0) {
        mechanisms.push(divergenceLiveStatus(symbol, candles, partnerCandles, CONFIG.divergence));
      }
    }

    return { symbol, zones, mechanisms };
  }

  /**
   * Real account picture, at the user's request after confirming the
   * dashboard's own "openPosition" state is only ever LiveStrategyEngine's
   * belief (its own signals), never a reconciled mirror of the real broker
   * account (see liveStrategyEngine.js's "believed netting" caveat). Fetched
   * live on each call (like getTradeHistory() above), not cached - a
   * ProtoOAReconcileReq is lightweight, unlike the 90-day candle warm-up.
   * All the actual math (what's REAL vs ESTIMATED, and why) lives in
   * accountReconciliation.js - this method only gathers the live inputs.
   */
  async getAccountReconciliation() {
    const store = this.account;
    const accountId = this.accountId;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(accountId),
    });

    const currentPriceBySymbol = {};
    for (const [symbol, candle] of store.lastCandleBySymbol) {
      currentPriceBySymbol[symbol] = candle.close;
    }
    // The believed-open SOURCE (fvg/divergence/nwog/judasSwing), not just a
    // boolean - reconcileAccount() below only needs truthiness for
    // botBelievesOpen (a string is truthy), but carrying the source through
    // lets the dashboard explain a "believed-only" mismatch precisely
    // (e.g. an FVG LIMIT order that never got a fill, vs a MARKET-order
    // source where "believed-only" is a real submission problem worth
    // checking - see _handleAutoExecuteEntry()'s own order-type comment).
    const believedOpenBySymbol = {};
    for (const symbol of this.symbols) {
      believedOpenBySymbol[symbol] = store.strategyEngine.getOpenPosition(symbol)?.source ?? null;
    }

    const result = reconcileAccount({
      realPositions: res.position || [],
      symbolNameById: this.symbolNameById,
      currentPriceBySymbol,
      believedOpenBySymbol,
    });

    const pendingOrders = (res.order || []).map((order) => ({
      orderId: order.orderId ?? null,
      symbolId: order.tradeData?.symbolId ?? order.symbolId ?? null,
      symbol: this.symbolNameById.get(String(order.tradeData?.symbolId ?? order.symbolId)) || null,
      orderType: order.orderType ?? null,
      tradeSide: order.tradeData?.tradeSide ?? order.tradeSide ?? null,
      volume: order.tradeData?.volume ?? order.volume ?? null,
      label: order.tradeData?.label ?? order.label ?? null,
    }));

    return { ...result, pendingOrders, balance: store.balance, equityEstimate: estimateEquity(store.balance, result.floatingPnlEstimate) };
  }

  /**
   * Boot-time auto-fix (2026-09-14, at Esdras's explicit request after a
   * night of manually clearing this by hand via /admin/clear-believed-position):
   * warmUp()'s bulk replay uses the SAME live netting check as real
   * processing, so it can reconstruct a "believed open" position from
   * purely historical data - never submitted to the broker. Until now that
   * belief just sat there (up to maxHoldingCandles, hours) blocking every
   * new real candidate on that symbol via netting, and the only fix was a
   * manual admin call.
   *
   * Runs once per boot, right after every symbol has been through
   * warmUp() (see start()), and asks the broker directly - via the SAME
   * ProtoOAReconcileReq the dashboard's /api/account reconciliation
   * uses - what's REALLY outstanding for each symbol: not just open
   * positions (`res.position`), but PENDING orders too (`res.order` -
   * confirmed via this project's own vendored OpenApiMessages.proto:
   * "The list of trader's account pending orders", not a guess). A belief
   * only gets auto-cleared when NEITHER exists for that symbol - so a
   * genuinely working LIMIT order that just hasn't filled yet (which
   * would show up in `res.order`, not `res.position`) is correctly left
   * alone, unlike a naive "real position count == 0" check would.
   *
   * Deliberately does NOT touch anything real (never calls
   * ProtoOACancelOrderReq/ProtoOAClosePositionReq) - only clears the
   * engine's own in-memory bookkeeping, exactly like the manual admin
   * endpoint already did, just automatically instead of requiring a human
   * to notice and act.
   */
  async _clearStaleBeliefsAgainstBroker(accountId) {
    const store = this.account;
    let res;
    try {
      res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
        ctidTraderAccountId: Number(accountId),
      });
    } catch (err) {
      // Best-effort - a failed reconcile must never block boot. Any stale
      // belief left behind here can still be cleared manually as before,
      // or will resolve on its own once maxHoldingCandles elapses.
      console.warn('[cTrader] stale-belief reconcile failed (non-fatal, boot continues):', err.message);
      return;
    }
    // The actual decision (which symbols to clear) is a pure function in
    // accountReconciliation.js, unit-tested there without needing a live
    // connection - this method is just the thin live-data wiring.
    const toClear = computeStaleBeliefsToClear({
      realPositions: res.position || [],
      pendingOrders: res.order || [],
      symbols: this.symbols,
      symbolIdByName: this.symbolIdByName,
      getBelievedPosition: (symbol) => store.strategyEngine.getOpenPosition(symbol),
    });
    for (const { symbol, id } of toClear) {
      const cleared = store.strategyEngine.clearBelievedPosition(symbol, id);
      if (cleared) {
        console.log(`[cTrader] cleared stale believed-open position on boot: ${symbol} id=${id} (no matching real position or pending order at the broker)`);
      }
    }

    // 2026-09-18 (HANDOFF.md: "un redémarrage pendant qu'une position est
    // ouverte fait perdre au bot sa propre trace du trade") - the mirror
    // image of the toClear loop above. A real GER40 position (Silver
    // Bullet) was found open at the broker with reconcileAccount() already
    // reporting botBelievesOpen:false/source:null ('real-only') after an
    // unrelated deploy restarted this process mid-trade - netting had no
    // way to know GER40 was occupied and could have opened a second
    // position on top of it. computeRealOnlyPositionsToAdopt() (pure,
    // tested separately) decides WHICH real positions qualify;
    // adoptExternalPosition() (liveStrategyEngine.js) is what actually
    // re-registers one into openPositions. Also mirrors
    // openPositionInfoByPositionId so the eventual real close still writes
    // a durable journal row (source:'adopted', riskAmount:null -> rMultiple
    // reads as null rather than a fabricated number - see
    // _handleExecutionEvent's own use of this map).
    const toAdopt = computeRealOnlyPositionsToAdopt({
      realPositions: res.position || [],
      symbolNameById: this.symbolNameById,
      symbols: this.symbols,
      getBelievedPosition: (symbol) => store.strategyEngine.getOpenPosition(symbol),
    });
    for (const real of toAdopt) {
      const adopted = store.strategyEngine.adoptExternalPosition(real.symbol, real);
      if (!adopted) continue;
      this.openPositionInfoByPositionId.set(real.positionId, {
        symbolName: real.symbol,
        source: 'adopted',
        signalId: adopted.id,
        direction: real.direction,
        entryPrice: real.entryPrice,
        riskAmount: null,
        stopPrice: real.stopPrice,
        targetPrice: real.targetPrice,
        entryTime: real.openTimestamp || Date.now(),
      });
      console.warn(
        `[cTrader] adopted a real-only position into tracking: ${real.symbol} positionId=${real.positionId} ` +
          '(this process had no belief for it, e.g. after a restart) - netting now correctly blocked on this symbol until it closes.'
      );
      this._notifyText(
        `🟡 Position réelle détectée sur ${real.symbol} que le bot ne suivait plus (redémarrage ?) - reprise en suivi, netting bloqué sur ce symbole jusqu'à sa fermeture.`
      );
    }

    // 2026-09-14 (found live: a real BTCUSD position came back with
    // stopLoss:null and NO working pending order behind it either - see
    // accountReconciliation.js's computeMissingStopFixes for the full story
    // and dealPairing.js/openPositionInfoByPositionId for why this process
    // is the only place that remembers what the stop was ever supposed to
    // be). Reuses the SAME reconcile response above - no extra broker
    // round-trip - so this runs on every boot AND every 5-minute sweep tick,
    // matching the stale-belief check's own cadence exactly.
    const toFix = computeMissingStopFixes({
      realPositions: res.position || [],
      pendingOrders: res.order || [],
      getTrackedStopPrice: (positionId) => {
        const info = this.openPositionInfoByPositionId.get(positionId);
        // Bug found 2026-09-17 (execution-path audit): this used to return
        // `info` as-is, which has NO `takeProfit` property (it's stored as
        // `targetPrice` - see _handleAutoExecuteEntry/_handleExecutionEvent
        // above) - so computeMissingStopFixes' `tracked.takeProfit` was
        // always undefined, and the "second safety net" the comment below
        // describes (resubmitting takeProfit alongside stopLoss) has never
        // once actually fired. Harmless in practice so far (omitting the
        // key is the DOCUMENTED way to leave takeProfit untouched), but a
        // deliberately-added safety net silently being dead code defeats
        // its own purpose.
        return info ? { stopPrice: info.stopPrice, takeProfit: info.targetPrice } : null;
      },
    });
    for (const fix of toFix) {
      try {
        // ProtoOAAmendPositionSLTPReq - confirmed against this project's own
        // vendored OpenApiMessages.proto, not a guess: stopLoss/takeProfit
        // are both independently `optional`, i.e. an amend that only sets
        // stopLoss leaves takeProfit untouched - still passing the tracked
        // takeProfit too (when known) as a second safety net in case that
        // assumption is wrong, never to overwrite a real, different value.
        await sendCommandWithTimeout(this.connection, 'ProtoOAAmendPositionSLTPReq', {
          ctidTraderAccountId: Number(accountId),
          positionId: Number(fix.positionId),
          stopLoss: fix.stopPrice,
          ...(fix.takeProfit != null ? { takeProfit: fix.takeProfit } : {}),
        });
        console.log(`[cTrader] resubmitted missing stop-loss on positionId=${fix.positionId}: stopLoss=${fix.stopPrice}`);
        this._notifyText(`⚠️ Stop de protection manquant détecté sur une position réelle (id ${fix.positionId}) - resoumis automatiquement à ${fix.stopPrice}.`);
      } catch (err) {
        console.error(`[cTrader] failed to resubmit missing stop-loss on positionId=${fix.positionId} (will retry next sweep tick):`, err.message);
      }
    }
  }

  /**
   * On-demand raw reconcile dump (2026-09-14, urgent live check: a BTCUSD
   * position showed stopLoss:null on the dashboard while a floating loss
   * kept growing - need to see whether the broker-side protective order
   * genuinely still exists and at what price, without guessing. Same
   * ProtoOAReconcileReq _clearStaleBeliefsAgainstBroker already uses at
   * boot, exposed on demand instead of only at startup. Temporary
   * diagnostic - not wired into any UI.
   */
  async debugReconcileRaw() {
    return sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(this.accountId),
    });
  }

  /**
   * On-demand historical export (2026-09, ad-hoc research request: "peux-tu
   * tester le bot sur les 8 derniers mois qui viennent de passer" - the
   * existing 2019-2025 CSV backtests, and the live engine's own 90-day
   * retained history, both stop short of covering that). Distinct from the
   * 90-day _subscribeLiveCandles() warm-up above: that window is capped at
   * 90 days ON PURPOSE (keeps boot time down), but the underlying cTrader
   * API accepts up to 35 weeks (~245 days) in a SINGLE ProtoOAGetTrendbarsReq
   * for the M15 bucket (see that method's own comment) - 8 months (~243
   * days) fits in one call, no pagination needed.
   *
   * Read-only, no side effects on store/strategyEngine/live trading - this
   * exists purely to export raw candles for offline research with the SAME
   * backtestEngine.js used for the 2019-2025 CSVs, not to feed anything live.
   */
  async getHistoricalCandles({ symbol, days, timeframe = null }) {
    const symbolId = this.symbolIdByName.get(symbol);
    if (!symbolId) throw new Error(`Unknown symbol "${symbol}" on this cTrader account`);
    const tf = timeframe || CONFIG.timeframe;
    const period = PERIOD_BY_TIMEFRAME[tf] || 'M15';
    const barsPerDay = { M1: 1440, M5: 288, M15: 96, M30: 48, H1: 24 }[period] || 96;
    // One request per window of at most MAX_TRENDBARS_PER_REQUEST bars (M15 for ~245 days fits in one window, as it
    // always did; M1/M5 are paged backwards and merged - 2026-09-20, finer candles to settle which of a stop and a
    // target came first inside a 15-minute bar).
    const windows = planHistoryWindows(days, barsPerDay, MAX_TRENDBARS_PER_REQUEST);
    const byTime = new Map();
    const now = Date.now();
    for (const w of windows) {
      const history = await sendCommandWithTimeout(
        this.connection,
        'ProtoOAGetTrendbarsReq',
        { ctidTraderAccountId: Number(this.accountId), fromTimestamp: now - w.fromDaysAgo * 86400000, toTimestamp: now - w.toDaysAgo * 86400000, symbolId, period, count: Math.ceil(w.spanDays * barsPerDay) + 10 },
        60000
      );
      for (const bar of history.trendbar || []) { const c = this._trendbarToCandle(bar); byTime.set(c.time, c); }
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }

  async _subscribeLiveCandles(accountId) {
    const store = this.account;

    for (const symbolName of this.symbols) {
      const symbolId = this.symbolIdByName.get(symbolName);
      if (!symbolId) {
        console.warn(`[cTrader] symbol "${symbolName}" not found on this account - skipping`);
        continue;
      }

      // Per-symbol timeframe (2026-09-13, temporary BTCUSD override - see
      // resolveSymbolTimeframe()'s own comment). `period` used to be
      // resolved ONCE outside this loop from the single global
      // CONFIG.timeframe - every symbol besides BTCUSD still gets exactly
      // that same value, this just makes the lookup per-iteration instead
      // of hoisted, which changes nothing for them.
      const symbolTimeframe = resolveSymbolTimeframe(symbolName);
      const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
      const isM1Override = symbolTimeframe === 'M1';

      // Warm up with a MUCH deeper history than the raw-FvgEngine days: the filtered
      // combo needs enough M15 candles behind it for its slowest lookback to be
      // meaningful - the H4/EMA200 bias alone needs ~3200 M15 candles (200 H4 bars) of
      // warm-up before its EMA reading means anything, and the Divergence z-score
      // needs `lookback` H1 bars (config-driven) on top of that. ~90 days of M15
      // (24/5 markets, so this over-counts a bit) covers both with room to spare.
      // fromTimestamp/toTimestamp are REQUIRED fields on ProtoOAGetTrendbarsReq (count
      // alone is not enough - confirmed against OpenApiMessages.proto after the first
      // live deploy rejected a count-only request). The M10-H1 bucket (which M15 falls
      // into) caps the from/to span at 35 weeks, so this single 90-day window request
      // needs no pagination.
      // isM1Override (BTCUSD only): baseline config has NO HTF-bias/structure
      // lookback at all - the only real warm-up need is CONFIG.fvg.maxAgeCandles
      // (50) of context for zone staleness. A much smaller window (2 days of
      // M1 = 2880 candles) covers that with room to spare, and - unverified,
      // but worth avoiding rather than risking it - M1 is very likely capped
      // at a MUCH shorter from/to span per request than the 35 weeks the
      // M10-H1 bucket gets, so requesting 90 days of M1 here could simply be
      // rejected by the broker.
      const WARMUP_MS = isM1Override ? 2 * 24 * 60 * 60 * 1000 : 90 * 24 * 60 * 60 * 1000;
      const WARMUP_CANDLE_CAP = isM1Override ? 2 * 24 * 60 : 90 * 24 * 4;
      const toTimestamp = Date.now();
      const fromTimestamp = toTimestamp - WARMUP_MS;
      console.log(`[cTrader] ${symbolName}: requesting ${WARMUP_CANDLE_CAP} ${period} candles of warm-up history...`);
      const history = await sendCommandWithTimeout(
        this.connection,
        'ProtoOAGetTrendbarsReq',
        {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp,
          toTimestamp,
          symbolId,
          period,
          count: WARMUP_CANDLE_CAP,
        },
        60000 // this single response can be tens of thousands of bars across 3 symbols - give it more room than the default before calling it stuck
      );
      console.log(`[cTrader] ${symbolName}: received ${(history.trendbar || []).length} warm-up candles, warming up...`);
      const sortedBars = (history.trendbar || []).sort((a, b) => a.utcTimestampInMinutes - b.utcTimestampInMinutes);
      const engineCandles = sortedBars.map((bar) => {
        const candle = this._trendbarToCandle(bar);
        store.lastCandleBySymbol.set(symbolName, candle); // dashboard display, real UTC - see _toEngineCandle() below
        return this._toEngineCandle(candle);
      });
      // 2026-09 FIX: this used to call ingestCandle() once per historical
      // candle, which rebuilds+replays the WHOLE retained history from
      // scratch on EVERY call (see the old comment this replaced, and
      // HANDOFF.md's "découverte de performance") - O(n) per call, O(n^2)
      // total, measured live at ~14 minutes to warm up 3 symbols. warmUp()
      // (see liveStrategyEngine.js) reconstructs the identical end state in
      // ONE pass instead - proven bit-for-bit equivalent to the old
      // candle-by-candle replay against real market data in
      // test/liveStrategyEngine.test.js ("bulk single-pass reconstruction is
      // IDENTICAL to sequential ingestCandle() replay"), and ~900x faster
      // locally (99ms vs 89s for a full 90-day/3-symbol window) - comfortably
      // sub-second even accounting for Render's much slower free-tier CPU
      // (previously observed ~15-20x slower than local for this same work).
      // Deliberately silent (see warmUp()'s own doc): no notify/dashboard
      // side effects for historical bars - these are already-past price
      // action, only the FINAL reconstructed state (openPositions etc.)
      // matters once warm-up is done. The heartbeat-preserving yield the old
      // loop needed (multi-minute synchronous work would starve the
      // heartbeat setInterval and get the session dropped for inactivity) is
      // no longer necessary at this speed, but is kept as cheap insurance in
      // case a slower host ever makes this take more than a few seconds.
      store.strategyEngine.warmUp({ [symbolName]: engineCandles });
      await new Promise((resolve) => setImmediate(resolve));
      console.log(`[cTrader] ${symbolName}: warm-up complete`);

      // ProtoOASubscribeLiveTrendbarReq's own doc (OpenApiMessages.proto) says it
      // "Requires subscription on the spot events, see ProtoOASubscribeSpotsReq" -
      // this was missing entirely, which is why the trendbar subscription below
      // timed out with no response on the first live deploy (confirmed: adding
      // this call is what makes ProtoOASpotEvent - already listened for below -
      // actually start arriving).
      await sendCommandWithTimeout(this.connection, 'ProtoOASubscribeSpotsReq', {
        ctidTraderAccountId: Number(accountId),
        symbolId: [symbolId],
      });

      await sendCommandWithTimeout(this.connection, 'ProtoOASubscribeLiveTrendbarReq', {
        ctidTraderAccountId: Number(accountId),
        symbolId,
        period,
      });
      console.log(`[cTrader] ${symbolName}: subscribed to live ${period} candles`);

      this.connection.on('ProtoOASpotEvent', (rawEvent) => {
        // ROOT CAUSE FIX (2026-09-10): rawEvent is a CTraderLayerEvent
        // WRAPPER (see CTraderLayerEmitter.notifyListeners() and
        // CTraderLayerEvent - #type/#date/#descriptor are private class
        // fields, only reachable via getters). The real ProtoOASpotEvent
        // fields (symbolId, bid, ask, trendbar, ...) live under
        // rawEvent.descriptor, NOT on rawEvent itself - every access below
        // used to read straight off rawEvent and silently get `undefined`
        // for everything, all day, every boot: `Number(undefined) !==
        // Number(symbolId)` is always true, so this listener body never ran
        // past the guard below. That's the actual explanation for the
        // frozen dashboard price AND the spread-check endpoint's "zero
        // samples" - not the symbolId BigInt/Number type-mismatch fixed
        // below (still correct and kept, but it was never the blocking
        // issue - `undefined` fails a `Number()` comparison exactly the
        // same way a BigInt/Number mismatch would). Confirmed by logging
        // rawEvent with JSON.stringify(), which prints `{}` for ANY object
        // whose only own fields are private class fields behind getters -
        // that misleadingly looked like "the event never fires" when it
        // actually meant "the event fires constantly, JSON.stringify just
        // can't see it". console.log(rawEvent) directly (Node's
        // util.inspect, not JSON.stringify) would have shown the wrapper's
        // real shape immediately.
        const event = rawEvent.descriptor;

        // protobuf int64 fields are sometimes decoded as BigInt rather than
        // Number depending on the specific field/library path - `1n !== 1`
        // is ALWAYS true (different types). Number() is safe for both here:
        // cTrader symbol ids are small, well within Number.MAX_SAFE_INTEGER.
        if (Number(event.symbolId) !== Number(symbolId)) return;

        // Signal detection is driven by full candle BARS (the trendbar
        // payload, present only on some spot events).
        if (event.trendbar) {
          for (const bar of event.trendbar) {
            const candle = this._trendbarToCandle(bar);
            const engineCandle = this._toEngineCandle(candle);
            if (store.strategyEngine.isNewBar(symbolName, engineCandle.time)) {
              // First tick of a new bar: finish the previous bar with the broker's final values, THEN evaluate signals (see
              // _ingestNewLiveBar). Async on purpose; a duplicate first-tick event while it runs is dropped by its own guard.
              this._ingestNewLiveBar(symbolName, symbolId, candle, engineCandle);
            } else {
              // Later ticks of the bar already tracked: keep its OHLC current (2026-09-21 fix - they used to be thrown away, which
              // left one-tick stubs in the engine's history). No signal evaluation on an update.
              store.strategyEngine.ingestCandle(symbolName, engineCandle, Date.now(), { deferCloseToRealConfirmation: true });
              store.lastCandleBySymbol.set(symbolName, candle);
            }
          }
        }

        // LIVE PRICE: bid/ask arrive on EVERY tick, far more often than a
        // trendbar update. Fold the freshest bid into the displayed last
        // candle so the chart/dashboard price is genuinely live between
        // trendbar updates instead of frozen (see foldLiveBidIntoCandle).
        // Same /100000 scaling as _trendbarToCandle - VERIFY against a real
        // spot event's bid units before trusting the magnitude (display-only,
        // so a scaling error is cosmetic, never a wrong order).
        // Number(...) with an `!= null` guard, NOT `typeof === 'number'`
        // (2026-09-13, real bug found live tonight while chasing why
        // BTCUSD never traded): this broker serializes plenty of numeric
        // protobuf fields as JSON STRINGS (confirmed repeatedly tonight -
        // orderId, positionId, executionTimestamp, grossProfit, volume,
        // symbolId all showed up quoted in a real raw dump), and a strict
        // `typeof === 'number'` check silently treats a string bid/ask as
        // absent. This means `recentTicksBySymbol` (the ONLY mechanism
        // meant to verify DEFAULT_SPREADS' guessed values against reality -
        // see /admin/spread-check) has likely NEVER recorded a single real
        // tick since this feature was added, on ANY symbol, despite the
        // dashboard's own live price clearly moving - that price comes from
        // the trendbar's `close` a few lines below (a different, unaffected
        // code path), not from this bid/ask folding, so the frozen-looking
        // "0 samples" result never got noticed as a problem until tonight.
        const bid = event.bid != null ? Number(event.bid) / 100000 : null;
        const existing = store.lastCandleBySymbol.get(symbolName);
        const folded = foldLiveBidIntoCandle(existing, bid);
        if (folded && folded !== existing) store.lastCandleBySymbol.set(symbolName, folded);

        // Real-spread sampling (2026-09, at the user's request: "est-ce que
        // le spread est celui qu'on avait planifié?" - see accountRuntime.js's
        // recentTicksBySymbol comment). Same /100000 scaling assumption as
        // bid above (VERIFY against a real response, same caveat). Only
        // recorded when the SAME tick carries both sides - a tick with just
        // one side updated doesn't represent a real spread at that instant.
        const ask = event.ask != null ? Number(event.ask) / 100000 : null;
        if (bid !== null && ask !== null) {
          if (!store.recentTicksBySymbol.has(symbolName)) store.recentTicksBySymbol.set(symbolName, []);
          const ticks = store.recentTicksBySymbol.get(symbolName);
          ticks.push({ bid, ask, time: Date.now() });
          this.spreadAggregator.record(symbolName, ask - bid, Date.now());
          this.lastSpreadBySymbol.set(symbolName, ask - bid);
          if (ticks.length > MAX_SPREAD_SAMPLES) ticks.shift();
        }
      });
    }
  }

  /**
   * First tick of a NEW bar (2026-09-21). 1) Ask the broker for the last few bars and overwrite the ones the engine tracked from
   * ticks with their final values (the feed can miss a bar's last ticks); 2) only then evaluate the new bar. If the broker
   * request fails or times out (4 s), the tick-tracked values are used - never a reason to miss the entry.
   */
  async _ingestNewLiveBar(symbolName, symbolId, candle, engineCandle) {
    const store = this.account;
    const key = `${symbolName}|${engineCandle.time}`;
    if (!this._newBarInFlight) this._newBarInFlight = new Set();
    if (this._newBarInFlight.has(key)) return;
    this._newBarInFlight.add(key);
    try {
      try {
        await this._reconcileRecentBars(symbolName, symbolId);
      } catch (err) {
        console.warn(`[bar-reconcile] ${symbolName}: broker refresh failed (tick-tracked bars kept): ${err.message}`);
      }
      if (!store.strategyEngine.isNewBar(symbolName, engineCandle.time)) return;
      // Date.now() explicitly (2026-09-14) - see liveStrategyEngine.js's ingestCandle() comment: _toEngineCandle's -5h shift is
      // correct for signal/session logic but must NOT reach GuardrailEngine's real-calendar-day bookkeeping.
      // deferCloseToRealConfirmation: true (2026-09-14) - only this live call site gets it (real-close confirmation loop).
      const events = store.strategyEngine.ingestCandle(symbolName, engineCandle, Date.now(), { deferCloseToRealConfirmation: true });
      store.pushSignalEvents(events);
      store.lastCandleBySymbol.set(symbolName, candle);
      const actionable = events.filter((e) => e.type === 'validated' && !e.blockedReason);
      if (actionable.length > 0) this._notify(actionable);
      if (actionable.length > 0 && store.isAutoExecuteActive()) {
        for (const sig of actionable) this._handleAutoExecuteEntry(symbolName, symbolId, sig);
      }
      for (const e of events) {
        if (e.type === 'pyramid-order-requested') this._handlePyramidOrderRequested(symbolName, symbolId, e);
        if (e.type === 'pyramid-order-cancel-requested') this._handlePyramidOrderCancelRequested(symbolName, e);
      }
    } catch (err) {
      console.error(`[live-bar] ${symbolName}: new-bar handling failed: ${err.stack || err.message}`);
    } finally {
      this._newBarInFlight.delete(key);
    }
  }

  async _reconcileRecentBars(symbolName, symbolId) {
    const store = this.account;
    const timeframe = resolveSymbolTimeframe(symbolName);
    const period = PERIOD_BY_TIMEFRAME[timeframe] || 'M15';
    const barMs = TIMEFRAME_DURATION_MS[timeframe] || TIMEFRAME_DURATION_MS.M15;
    const now = Date.now();
    const res = await sendCommandWithTimeout(
      this.connection,
      'ProtoOAGetTrendbarsReq',
      { ctidTraderAccountId: Number(this.accountId), fromTimestamp: now - 6 * barMs, toTimestamp: now, symbolId, period, count: 8 },
      4000
    );
    const finals = (res.trendbar || []).map((b) => this._toEngineCandle(this._trendbarToCandle(b)));
    const changes = store.strategyEngine.reconcileRecentCandles(symbolName, finals, { includeNewest: true });
    this._reconcileStats = this._reconcileStats || { checks: 0, mismatches: 0 };
    this._reconcileStats.checks++;
    if (changes.length > 0) {
      this._reconcileStats.mismatches++;
      // Evidence for the 2026-09-21 diagnosis, and a permanent health signal: how far the tick-tracked bar was from the final one.
      // Rate-limited (first 40, then every 20th) so a chatty feed cannot flood the logs.
      const n = this._reconcileStats.mismatches;
      if (n <= 40 || n % 20 === 0) {
        const c = changes[0];
        console.log(`[bar-reconcile] ${symbolName}: tracked bar ${new Date(c.time + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(11, 16)}Z corrected by the broker's final values (dHigh ${c.dHigh.toFixed(4)}, dLow ${c.dLow.toFixed(4)}, dClose ${c.dClose.toFixed(4)}) - ${n} of ${this._reconcileStats.checks} bar checks so far`);
      }
    }
    return changes;
  }

  _trendbarToCandle(bar) {
    // Trendbars encode OHLC as deltas from `low` in relative price units;
    // exact scaling depends on symbol digits - VERIFY against a real response.
    const low = bar.low / 100000;
    return {
      time: bar.utcTimestampInMinutes * 60 * 1000, // genuine UTC (cTrader's field name says so, and it's the documented convention) - correct for display (store.lastCandleBySymbol) and for expirationTimestamp sent to the broker. Do NOT feed this straight into the strategy engine - see _toEngineCandle().
      open: low + bar.deltaOpen / 100000,
      high: low + bar.deltaHigh / 100000,
      low,
      close: low + bar.deltaClose / 100000,
    };
  }

  // BUG FIX (found live, 2026-09-08): the shared filtered-engine pipeline
  // (buildFilteredEngine() -> nySession.js's SessionFilteredFvgEngine, used
  // identically by backtest and live per liveStrategyEngine.js's design)
  // was built and validated entirely against HistData.com CSV candles, whose
  // `.time` uses a FIXED EST-as-UTC convention (see nySession.js's header) -
  // i.e. backtest `.time` is always exactly 5h BEHIND true UTC. cTrader's
  // live candles are genuine UTC (see _trendbarToCandle() above), so passing
  // them straight into ingestCandle() made every NY-session-window check
  // evaluate the wrong wall-clock hour by a flat 5h (confirmed live: at real
  // NY time 21:25, the session filter was computing NY time 02:25) - the
  // Silver Bullet (10-11h NY) and London-NY overlap (7-10h NY) windows were
  // effectively checking 05:00-06:00 and 02:00-05:00 NY instead, well
  // outside the killzones the whole combo was validated on.
  // This shifts ONLY the copy handed to the strategy engine into that same
  // fixed-EST-as-UTC convention, so its internal HTF/structure/sweep
  // bucketing and session-window check match backtest-validated behavior
  // exactly. The ORIGINAL true-UTC `candle` (from _trendbarToCandle) is
  // still what's stored in store.lastCandleBySymbol and used for
  // expirationTimestamp - those must stay in real time, not this shifted
  // convention. One side effect, cosmetic only: signal timestamps derived
  // from the engine's candle (validatedAt, shown as "validé HH:MM" on the
  // dashboard) will display 5h behind the real validation time - same
  // convention backtest reports have always used, not a new inconsistency,
  // but worth fixing in the dashboard layer later if it's ever confusing.
  _toEngineCandle(candle) {
    return { ...candle, time: candle.time - FIXED_EST_TO_UTC_OFFSET_MS };
  }

  /**
   * A pyramid add-on trigger just fired (LiveStrategyEngine already computed
   * entry/stop/target and recorded the leg as 'requested') - submit the real
   * STOP order, with stop-loss/take-profit ALREADY ATTACHED so the broker
   * enforces them independently of this process staying up. On success,
   * tell the engine so it can cancel this order later if the original
   * resolves first (markPyramidOrderPlaced). On failure, log and DO NOT
   * retry automatically - a silently-retried order on a real account is
   * worse than a missed pyramid leg.
   */
  async _handlePyramidOrderRequested(symbolName, symbolId, e) {
    const store = this.account;
    try {
      const spec = this._specFor(symbolName);
      if (!spec) {
        console.warn(`[pyramid] no symbol spec for ${symbolName} - skipping add-on order`);
        return;
      }
      // Bug fix (2026-09, multi-account rollout): this used to read the
      // BOOT-TIME global CONFIG.risk.riskPctPerTrade default, ignoring both
      // a live dashboard change (POST /api/settings/risk) AND, now that
      // per-account risk% is a real thing (see propFirms/index.js), any
      // OTHER account's risk entirely - store.strategyEngine.riskPctPerTrade
      // is the one number that's actually always current for THIS account.
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: store.strategyEngine.riskPctPerTrade,
        entryPrice: e.entryPrice,
        stopPrice: e.stopPrice,
        symbolSpec: spec,
      });
      const orderLabel = `pyramid-add-${symbolName}`;
      const submittedAtMs = Date.now();
      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: 'STOP',
        tradeSide: e.direction === 'bullish' ? 'BUY' : 'SELL',
        lots: sizing.lots,
        symbolSpec: spec,
        price: e.entryPrice, // the order's OWN trigger price - NOT the protective stop-loss below
        stopLoss: e.stopPrice,
        takeProfit: e.targetPrice,
        label: orderLabel,
      });
      console.log(`[pyramid] _submitOrder resolved for ${symbolName}: brokerOrderId=${brokerOrderId}`);
      if (brokerOrderId != null) {
        store.strategyEngine.markPyramidOrderPlaced(symbolName, brokerOrderId);
        this.pyramidOrderSymbolByOrderId.set(String(brokerOrderId), symbolName);
        this._notifyText(`🔺 Pyramide auto : ordre stop programmé sur ${symbolName} (entrée ${e.entryPrice}, stop ${e.stopPrice}, cible ${e.targetPrice}, ${sizing.lots} lots)`);
      } else {
        // 2026-09-17: same gap already fixed on the entry path (see
        // _handleAutoExecuteEntry) existed here too, and arguably worse - a
        // real pyramid position filled with NO confirmation used to leave
        // this.pyramidPositions[symbol] stuck at 'requested' forever (no
        // brokerOrderId ever recorded to cancel), the broker position itself
        // completely untracked (no entry in pyramidOrderSymbolByOrderId or
        // openPositionInfoByPositionId), and total silence - not even a log
        // line, since this branch used to just do nothing. Ask the broker
        // directly instead of assuming, exactly like the entry path.
        let verified = null;
        try {
          verified = await this._findRealOrderOrPositionForLabel({ symbolId, label: orderLabel, submittedAtMs });
        } catch (verifyErr) {
          console.error(`[pyramid] order verification failed for ${symbolName}:`, verifyErr.message);
        }

        if (verified?.orderId != null) {
          store.strategyEngine.markPyramidOrderPlaced(symbolName, verified.orderId);
          this.pyramidOrderSymbolByOrderId.set(String(verified.orderId), symbolName);
          console.warn(`[pyramid] no push confirmation for ${symbolName}, but reconcile found the REAL working order orderId=${verified.orderId} - adopted.`);
          this._notifyText(`🔺 Pyramide auto : ordre stop bien programmé sur ${symbolName} (confirmé en interrogeant le courtier, message de confirmation perdu)`);
        } else if (verified?.positionId != null) {
          // The STOP already triggered and filled by the time we asked - no
          // orderId left to track, but a real broker-managed bracket
          // position now exists and needs the SAME close-attribution
          // bookkeeping the push-confirmed fill path sets up.
          const filled = store.strategyEngine.markPyramidOrderFilled(symbolName);
          this.pyramidPositionIdBySymbol.set(symbolName, verified.positionId);
          // BUG FOUND 2026-09-17 (same session, writing the regression test
          // for THIS function surfaced it): the push-confirmed pyramid-fill
          // path (_handleExecutionEvent) was just fixed to also populate
          // openPositionInfoByPositionId (the missing-stop-loss sweep and
          // the durable journal both read from it) - this reconcile-verified
          // path, the one that exists SPECIFICALLY for when push
          // confirmation is lost, had the identical gap and would have been
          // even MORE exposed to it (this branch only ever runs when a push
          // was already missed once). filled may be null if
          // markPyramidOrderFilled's own slot was already empty (e.g. a
          // previous verify already cleared it) - only set the tracking
          // entry when there's a real filled record to source it from.
          if (filled) {
            this.openPositionInfoByPositionId.set(String(verified.positionId), {
              symbolName,
              source: 'pyramid',
              signalId: null,
              direction: filled.direction,
              entryPrice: filled.entryPrice,
              riskAmount: filled.riskAmount,
              stopPrice: filled.stopPrice,
              targetPrice: filled.targetPrice,
              entryTime: Date.now(),
            });
          }
          console.warn(`[pyramid] no push confirmation for ${symbolName}, but reconcile found a REAL OPEN POSITION positionId=${verified.positionId} - adopted.`);
          this._notifyText(`🔺 Pyramide auto : 2e unité déjà REMPLIE sur ${symbolName} (confirmé en interrogeant le courtier) à ${filled?.entryPrice ?? e.entryPrice}`);
        } else {
          store.strategyEngine.clearPyramidPending(symbolName);
          console.warn(`[pyramid] no orderId within timeout for ${symbolName} AND reconcile found nothing real - order never reached the broker, clearing pending pyramid.`);
          this._notifyText(`⚠️ Pyramide auto : aucune confirmation du courtier sur ${symbolName} et aucun ordre/position réels trouvés (vérifié) - ordre abandonné.`);
        }
      }
    } catch (err) {
      console.warn(`[pyramid] failed to place add-on order for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'envoi de l'ordre sur ${symbolName} (${err.message}) - à vérifier manuellement`);
    }
  }

  async _handlePyramidOrderCancelRequested(symbolName, e) {
    if (!e.brokerOrderId) return; // never actually reached the broker (e.g. placement itself failed) - nothing to cancel
    try {
      await this._cancelOrder(e.brokerOrderId);
      this.pyramidOrderSymbolByOrderId.delete(String(e.brokerOrderId));
    } catch (err) {
      console.warn(`[pyramid] failed to cancel add-on order ${e.brokerOrderId} for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'annulation de l'ordre en attente sur ${symbolName} - à annuler manuellement si toujours ouvert`);
    }
  }

  /**
   * Submits a real order - MARKET (fills now), LIMIT (fills at `price` or
   * better), or STOP (a pending order that fills once price trades AT
   * `price` - used by the pyramid add-on) - with stop-loss/take-profit
   * attached as a bracket. `price` is the order's OWN entry trigger, not to
   * be confused with `stopLoss` (the protective level).
   * !!! UNVERIFIED against a real account - see file header. In particular
   * `volume`'s exact unit (lots * lotSize * 100 is the documented
   * convention, but never confirmed here) MUST be checked against a real
   * ProtoOASymbolsListReq response (symbol.lotSize) before this is trusted
   * with real money. Same for `timeInForce: 'GOOD_TILL_DATE'` below - the
   * exact enum name needs confirming against a real API response too.
   */
  // 2026-09-13, the single most important bug found this session, via
  // /admin/test-order-cycle's first real run: ProtoOANewOrderReq's
  // synchronous response on THIS broker comes back as an EMPTY OBJECT ({})
  // - no order.orderId, no orderId anywhere in it. `_submitOrder` used to
  // derive brokerOrderId from exactly that response
  // (`res?.order?.orderId ?? res?.orderId ?? null`), so it has ALWAYS
  // resolved to `null` for every real order this process has ever placed
  // live - which BOTH _handleAutoExecuteEntry and
  // _handlePyramidOrderRequested gate real tracking behind
  // (`if (brokerOrderId != null)`). Concretely, this means
  // pendingEntryOrderByOrderId has never actually been populated by a real
  // order, _handleExecutionEvent's confirmation branch has never matched
  // anything, and NOT ONE real fill/rejection has ever been reconciled
  // back into the engine's belief - exactly the gap behind Esdras's
  // original "ce n'est pas un trade, c'est une croyance" correction. The
  // broker DID keep filling orders in reality the whole time (independently
  // confirmed live: ORDER_ACCEPTED then ORDER_FILLED arrived ~600ms after
  // submission, with a real orderId/positionId) - only the confirmation
  // path back into this process was silently dead.
  //
  // Fixed the same way as test-order-cycle: get the real orderId from the
  // ProtoOAExecutionEvent that follows submission (matched by symbolId,
  // Number(...) both sides - see _handleAutoExecuteEntry's own
  // "Number(symbolId) is always true" precedent for why a bare !== on a
  // protobuf-serialized field can silently never match), not from the
  // unreliable synchronous response. Safe against the one theoretical race
  // (the event arriving and being consumed by _handleExecutionEvent before
  // this function even returns, so pendingEntryOrderByOrderId.set() runs
  // too late to catch it) because the broker's own order lifecycle sends
  // ORDER_ACCEPTED (this order now exists, carries the real orderId)
  // strictly before ORDER_FILLED/REJECTED/etc for that same order - real
  // captured evidence shows ~300ms between them, ample time for the awaited
  // orderId to reach _handleAutoExecuteEntry/_handlePyramidOrderRequested
  // and register the pending entry before any terminal event follows.
  // timeoutMs was 10000 (2026-09-17, real incident: two auto-execute orders
  // silently got no broker confirmation for 6+ hours on a connection that
  // kept receiving spot/candle ticks fine - see HANDOFF.md's "connexion
  // zombie" writeup). This only ever waits for ORDER_ACCEPTED (the order
  // now exists broker-side), not ORDER_FILLED - a resting LIMIT/STOP order
  // gets its ACCEPTED just as fast as a MARKET order's, confirmed live via
  // /admin/test-order-cycle: ~220ms from submission to ORDER_ACCEPTED. 10s
  // was pure slack with no upside on a healthy connection (the promise
  // still resolves the instant the event arrives, whatever the ceiling is)
  // and meant a degraded connection took 10s per attempt to even start
  // being detectable - shortened so _handleAutoExecuteEntry's reconnect
  // trigger (see there) fires quickly instead of being an afterthought.
  /**
   * "Did this order actually reach the broker?" - answered by ASKING
   * (ProtoOAReconcileReq, a request/response round-trip) instead of waiting
   * for a push that may never come.
   *
   * This is the whole point (2026-09-17, Esdras: "comment peut on s'assurer
   * à 100% que l'ordre passe"): the connection that failed today was only
   * HALF broken - it stopped delivering ProtoOAExecutionEvent pushes while
   * still answering every request/response command perfectly (the 5-minute
   * balance refresh kept succeeding right through the 6-hour outage, and
   * ProtoOANewOrderReq itself still got its - empty - reply). So a reconcile
   * query is exactly the channel that still works when the push channel is
   * dead, which makes it the only trustworthy way to find out what really
   * happened to an order we got no confirmation for.
   *
   * Matching is by symbolId AND our own `label` (set at submission: e.g.
   * `auto-silverbullet-US100`) - the broker echoes it back in
   * position.tradeData.label / order.tradeData.label (confirmed live in the
   * raw fill dump of /admin/test-order-cycle). `openTimestamp` narrows it
   * further when present, so an OLDER position carrying the same label
   * (same mechanism, same symbol, earlier signal) is never adopted by
   * mistake; when the field is absent the label+symbol match stands alone
   * rather than silently discarding a real match.
   *
   * Returns { orderId, positionId, matched } - either id may be null:
   * a still-working LIMIT/STOP shows up as an order, a filled MARKET order
   * as a position (its order is no longer in the working list by then).
   */
  async _findRealOrderOrPositionForLabel({ symbolId, label, submittedAtMs }) {
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(this.accountId),
    });
    // Dumped raw on purpose: this path only runs when something already went
    // wrong, and this file's own history (the null-orderId bug, the
    // `order.symbolId` that never existed) is a long list of broker payload
    // shapes that were GUESSED rather than observed. One log line here is
    // what makes the next diagnosis factual.
    console.log(`[order-verify] reconcile for symbolId=${symbolId} label=${label}: ${JSON.stringify(res)}`);

    const SLACK_MS = 5000; // submission -> broker-side timestamp, generously
    const isOurs = (tradeData) => {
      if (tradeData?.label !== label) return false;
      if (Number(tradeData?.symbolId) !== Number(symbolId)) return false;
      const openedAt = Number(tradeData?.openTimestamp);
      // Absent/unparseable timestamp: keep the match (label+symbol is
      // already specific) rather than throwing away a real position.
      if (!Number.isFinite(openedAt) || openedAt <= 0) return true;
      return openedAt >= submittedAtMs - SLACK_MS;
    };

    const order = (res.order || []).find((o) => isOurs(o?.tradeData) && o?.orderId != null);
    const position = (res.position || []).find((p) => isOurs(p?.tradeData) && p?.positionId != null);

    return {
      orderId: order?.orderId ?? null,
      positionId: position?.positionId ?? null,
      matched: Boolean(order || position),
    };
  }

  _waitForOrderIdBySymbol(symbolId, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const uuids = [];
      const safeRemove = () => {
        for (const uuid of uuids) {
          try {
            if (uuid != null) this.connection.removeEventListener(uuid);
          } catch (err) {
            console.error('[_submitOrder] removeEventListener failed (non-fatal):', err.message);
          }
        }
      };
      const timer = setTimeout(() => {
        safeRemove();
        // Resolves null, same as the old (broken) synchronous-response path
        // did on every call - callers already handle a null brokerOrderId
        // by skipping tracking/notification rather than throwing.
        resolve(null);
      }, timeoutMs);
      // 2026-09-18: a refusal ends this wait just as definitively as a
      // confirmation does, so stop burning the full timeout on it. Unlike
      // ProtoOAExecutionEvent, ProtoOAOrderErrorEvent carries NO symbolId
      // at all (only errorCode/description and, when one exists, an
      // orderId we by definition never got), so it cannot be matched to
      // this symbol. Treating any refusal that lands inside this window as
      // this submission's own is sound because the window is the ~3s
      // between one awaited sendCommand and its answer, and every caller
      // (_handleAutoExecuteEntry, _handlePyramidOrderRequested) awaits
      // _submitOrder before submitting anything else - so there is never a
      // second order in flight to confuse it with. The permanent listener
      // registered in _registerBrokerEventListeners() logs and records the
      // refusal either way; this one only decides when to stop waiting.
      uuids.push(
        this.connection.on('ProtoOAOrderErrorEvent', () => {
          clearTimeout(timer);
          safeRemove();
          resolve(null);
        })
      );
      uuids.push(this.connection.on('ProtoOAExecutionEvent', (event) => {
        try {
          const d = event.descriptor;
          // Confirmed live (2026-09-13, raw event dump): the real field is
          // `order.tradeData.symbolId`, NOT the flatter `order.symbolId`
          // this originally guessed (which doesn't exist at all on this
          // broker's ProtoOAExecutionEvent - `d.order.symbolId` is simply
          // `undefined`, always failing the match). Keeping the other
          // fallback paths too since they're free and this broker's exact
          // shape on OTHER event types (rejection, pyramid STOP orders)
          // isn't separately confirmed.
          const eventSymbolId =
            d.order?.tradeData?.symbolId ?? d.order?.symbolId ?? d.position?.tradeData?.symbolId ?? d.position?.symbolId ?? d.deal?.symbolId ?? null;
          if (Number(eventSymbolId) !== Number(symbolId) || d.order?.orderId == null) return;
          clearTimeout(timer);
          safeRemove();
          resolve(d.order.orderId);
        } catch (err) {
          clearTimeout(timer);
          safeRemove();
          resolve(null);
        }
      }));
    });
  }

  async _submitOrder({ symbolId, orderType, tradeSide, lots, symbolSpec, price, stopLoss, takeProfit, label, expirationTimestamp, referencePrice }) {
    const accountId = Number(this.accountId);
    // FIXED 2026-09-16. This was `lots * (symbolSpec.lotSize || 100000) * 100`,
    // and no spec in lotCalculator.js has ever defined a lotSize - so every
    // order used the hardcoded forex-shaped 100000, doubled by a further
    // x100 that cTrader's own lotSize already contains. Right for EURUSD by
    // pure coincidence (100000 * 100 == its real lotSize of 10000000),
    // 100000x too large on US100/US500/GER40 and 1000x on XAUUSD - past
    // those symbols' own maxVolume, so the broker would have rejected every
    // single one. Never caught because the only symbol that ever really
    // traded, BTCUSD, set rawVolume to skip this path entirely.
    // Confirmed against all five symbols' real ProtoOASymbol responses; see
    // buildSpecFromBrokerSymbol() for the model and the cross-check.
    let volume;
    if (symbolSpec.rawVolume) {
      // The spec's `lots` IS the broker volume already - nothing to convert.
      volume = Math.round(lots);
    } else {
      const lotSize = Number(symbolSpec.lotSize);
      if (!Number.isFinite(lotSize) || lotSize <= 0) {
        // Refuse rather than fall back to a guess. Sending a wrong volume is
        // how this bug stayed invisible; a loud failure to place ONE order
        // is strictly better than silently placing a mis-sized real one.
        throw new Error(
          `refusing to submit an order for symbolId=${symbolId}: no broker-confirmed lotSize ` +
            '(ProtoOASymbolByIdReq did not return one at boot - see _loadSymbolSpecs)'
        );
      }
      volume = Math.round(lots * lotSize);
    }
    const payload = { ctidTraderAccountId: accountId, symbolId, orderType, tradeSide, volume, label };
    if (orderType === 'STOP') payload.stopPrice = price;
    if (orderType === 'LIMIT') payload.limitPrice = price;
    // 2026-09-18: a MARKET order must express its protection as a relative
    // DISTANCE - absolute stopLoss/takeProfit are explicitly unsupported on
    // this order type (see toRelativeProtectionDistance's own comment for the
    // quoted message definition and the production evidence). LIMIT and STOP
    // are pending orders with a known entry price, so they keep the absolute
    // form the broker does accept from them, unchanged.
    if (orderType === 'MARKET' && (stopLoss != null || takeProfit != null)) {
      const anchor = referencePrice ?? price;
      // 2026-09-18, SECOND ROUND. The relative form above was accepted as a
      // field but refused as a value: the broker answered
      // "INVALID_REQUEST - Relative stop loss has invalid precision" to both
      // US100 MARKET orders of 14:45 and 15:15 UTC. A relative distance is
      // in 1/100000 of a price unit, but it still has to land on the
      // SYMBOL's own price grid: US100 quotes 2 decimals, so only multiples
      // of 1000 are expressible. Our stops carry more decimals than that
      // (stopLoss=29561.275 against a 2-decimal symbol), which is what the
      // broker was rejecting. digits comes from the broker's own
      // ProtoOASymbol (see buildSpecFromBrokerSymbol); with no spec the step
      // falls back to 1, i.e. the previous behaviour.
      const priceDigits = symbolSpec?.digits;
      const relativeStopLoss = stopLoss == null ? null : toRelativeProtectionDistance(anchor, stopLoss, priceDigits);
      const relativeTakeProfit =
        takeProfit == null ? null : toRelativeProtectionDistance(anchor, takeProfit, priceDigits);
      // Refuse rather than send a MARKET order stripped of its protection.
      // Same reasoning as the lotSize guard above: one loud failure to place
      // an order beats one real unguarded position running on a live account.
      if (stopLoss != null && relativeStopLoss == null) {
        throw new Error(
          `refusing to submit a MARKET order for symbolId=${symbolId}: cannot express stopLoss=${stopLoss} as a ` +
            `relative distance from referencePrice=${anchor} (a MARKET order cannot carry an absolute stop)`
        );
      }
      if (takeProfit != null && relativeTakeProfit == null) {
        throw new Error(
          `refusing to submit a MARKET order for symbolId=${symbolId}: cannot express takeProfit=${takeProfit} as a ` +
            `relative distance from referencePrice=${anchor} (a MARKET order cannot carry an absolute target)`
        );
      }
      if (relativeStopLoss != null) payload.relativeStopLoss = relativeStopLoss;
      if (relativeTakeProfit != null) payload.relativeTakeProfit = relativeTakeProfit;
    } else {
      if (stopLoss != null) payload.stopLoss = stopLoss;
      if (takeProfit != null) payload.takeProfit = takeProfit;
    }
    if (expirationTimestamp) {
      payload.expirationTimestamp = expirationTimestamp;
      payload.timeInForce = 'GOOD_TILL_DATE'; // VERIFY exact enum name against a real API response
    }
    // Registered BEFORE sendCommand so the listener is armed no matter how
    // quickly the broker replies - see _waitForOrderIdBySymbol's own
    // comment for why this exists at all.
    // Cleared at the same moment (2026-09-18): anything _handleOrderError
    // records from here on belongs to THIS submission, so the branch below
    // can never adopt a refusal left over from an earlier one.
    this._pendingOrderRejection = null;
    const orderIdFromEvent = this._waitForOrderIdBySymbol(symbolId);
    const res = await this.connection.sendCommand('ProtoOANewOrderReq', payload);
    // 2026-09-14: one real LIMIT order tonight (BTCUSD FVG signal) got zero
    // ProtoOAExecutionEvent within 10s and had to fall back to the
    // timeout/null path - a subsequent LIMIT order minutes later behaved
    // normally (ORDER_ACCEPTED in ~230ms, ORDER_FILLED ~11s later, real
    // position confirmed via /api/account showing reconciliation
    // status:'match') - so that first miss reads as a one-off delay/drop,
    // not a structural break in LIMIT order handling. Kept as a permanent
    // (not spammy - once per real order attempt) log line rather than the
    // original throwaway diagnostic, since this exact gap (an order placed
    // with no confirmation either way) is precisely what this session's
    // "corrige le pipeline" work was about closing.
    // describeBrokerPayload, not JSON.stringify (2026-09-18): every
    // "rawRes={}" this line has ever logged proved nothing about the
    // response, only that JSON.stringify cannot see through this library's
    // prototype getters - the exact trap already documented in
    // _registerBrokerEventListeners(). See brokerPayload.js.
    console.log(`[_submitOrder] ${payload.orderType} ${payload.tradeSide} sent for symbolId=${symbolId}, rawRes=${describeBrokerPayload(res)}`);
    // A refusal can also come back HERE, synchronously, as a ProtoOAErrorRes
    // standing in for the expected ProtoOANewOrderRes - in which case no
    // ProtoOAOrderErrorEvent is ever pushed and the subscription above would
    // never see it. Same handler either way, so the reason gets logged,
    // recorded and pushed exactly once whichever channel carried it.
    const syncError = extractBrokerError(res);
    if (syncError) this._handleOrderError(res);
    const syncOrderId = res?.order?.orderId ?? res?.orderId ?? null;
    if (syncOrderId != null) {
      // some future response shape DOES carry it directly - trust it, no need to wait for the event
      this._consecutiveOrderConfirmationTimeouts = 0;
      return syncOrderId;
    }
    const resolvedOrderId = await orderIdFromEvent;
    const rejection = this._pendingOrderRejection;
    this._pendingOrderRejection = null;
    if (resolvedOrderId != null) {
      this._consecutiveOrderConfirmationTimeouts = 0;
    } else if (rejection) {
      // 2026-09-18: the broker ANSWERED - it refused this order. That is a
      // definitive outcome, not a missing confirmation, and the two must
      // not be conflated: the restart escalation below exists for a
      // connection that has stopped talking to us, and this connection just
      // demonstrably did talk to us. Counting a refusal towards it would
      // make the bot reboot itself every time it sent two orders the broker
      // disagreed with - a loop that fixes nothing and takes the bot down
      // twice per pair of signals. Reset rather than merely skipped, for the
      // same reason: a refusal proves the push channel is alive.
      this._consecutiveOrderConfirmationTimeouts = 0;
      console.error(
        `[_submitOrder] ${payload.orderType} ${payload.tradeSide} for symbolId=${symbolId} was REFUSED by the broker: ` +
          `errorCode=${rejection.errorCode} description=${rejection.description} ` +
          `(volume=${volume} stopLoss=${stopLoss} takeProfit=${takeProfit} label=${label}) - no order exists at the broker.`
      );
    } else {
      // 2026-09-17, see this._consecutiveOrderConfirmationTimeouts' own
      // constructor comment: a connection can silently stop delivering
      // ProtoOAExecutionEvent while still ticking spot/candle data fine, so
      // "no confirmation" here is NOT distinguishable from "the process
      // itself is fine but this one order was slow" on a single occurrence
      // (already documented as happening once, harmlessly, on 2026-09-14).
      // Only treated as a real connection problem worth a restart once it
      // repeats on the VERY NEXT order attempt - a genuinely degraded
      // connection fails every subsequent attempt, a one-off blip doesn't.
      this._consecutiveOrderConfirmationTimeouts += 1;
      console.error(
        `[_submitOrder] no execution confirmation within timeout for symbolId=${symbolId} ` +
          `(${this._consecutiveOrderConfirmationTimeouts} consecutive unconfirmed order(s))`
      );
      if (this._consecutiveOrderConfirmationTimeouts >= 2) {
        console.error(
          '[_submitOrder] 2 consecutive orders with no broker confirmation - the connection is likely ' +
            'degraded (still receiving spot/candle ticks but not execution events, exactly the 2026-09-17 ' +
            'incident - see HANDOFF.md). Forcing a clean process exit so the platform restarts with a fresh ' +
            'connection rather than continuing to submit orders no one can confirm.'
        );
        // 2s, not a token delay: the CALLER
        // (_handleAutoExecuteEntry's no-confirmation branch) still has a
        // reconcile query in flight to find out whether this order actually
        // reached the broker, plus the ntfy notification that reports what
        // it found. Exiting under it would throw away exactly the answer
        // this incident made necessary. Anything it does manage to record is
        // in-memory and lost on restart anyway, but the notification (and
        // the log line) are what a human actually sees.
        // Restarting with a position open is safe by design: stop-loss and
        // take-profit are attached to the order itself at submission, so the
        // broker keeps enforcing them while this process is down.
        setTimeout(() => process.exit(1), 2000);
      }
    }
    return resolvedOrderId;
  }

  /**
   * "Mode indisponible" is active (store.autoExecute - Esdras opted in
   * himself for a bounded window, typically fin de mois when he can't click
   * Buy/Sell) - submit the ORIGINAL entry exactly as validated, same
   * entry/stop/target this engine would otherwise only have alerted a human
   * with. Nothing is recomputed or "improved" here versus the manual path.
   *
   * Order type follows how each source actually defines its entry price
   * (see liveStrategyEngine.js _detectFvgSignal/_detectDivergenceSignal/
   * _processNwogCandidate):
   *   - FVG: entryPrice is the gap's own edge, a level price has ALREADY
   *     touched by the time 'validated' fires this candle - a LIMIT order
   *     there is the faithful automation of "place a limit at this level
   *     and see if it fills again", not a chase at a worse price. Given a
   *     short expiration so a stale unfilled limit doesn't linger forever
   *     if price never returns (same outcome as a human who never got
   *     filled - not a new gap, see the "believed netting" caveat above).
   *   - Divergence/NWOG/Judas Swing/Weekly Sweep/Breaker Block: entryPrice
   *     IS candle.open of the very candle whose spot event we're
   *     processing right now - a MARKET order is the direct equivalent,
   *     not an approximation. Known, accepted gap: the live spot event
   *     carrying a completed trendbar only arrives once that M15 candle
   *     has CLOSED, so the MARKET order is submitted with price already
   *     having moved away from `entryPrice` by however much it drifted
   *     during those 15 minutes - especially relevant right after a
   *     weekend gap, when volatility is elevated.
   *
   * TRIED AND REVERTED (2026-09-16, same day): briefly switched every
   * source to LIMIT at entryPrice ("tous les trades vont etre passe par
   * limit order") for better backtest fidelity - reverted within the hour
   * after Esdras identified a real risk this introduced: a resting LIMIT
   * order's FILL moment is uncontrolled (it fires whenever price later
   * touches the level, up to NON_FVG_LIMIT_EXPIRY_CANDLES away), unlike a
   * MARKET order which fires at a moment the bot itself chooses. FTMO's
   * own EA policy forbids trading within 2 minutes of major news - no live
   * news-blackout filter exists in this bot yet (src/backtest/
   * newsEvents.js/runNewsBlackoutAnalysis.js are backtest-only research,
   * never wired into LiveStrategyEngine or here), so until one exists,
   * MARKET's near-zero exposure window (the instant it's sent) is safer
   * than LIMIT's long resting window, which is also disproportionately
   * likely to get touched BY a news-driven price spike specifically. FVG
   * stays LIMIT - the oldest, most-proven mechanism here, unaffected by
   * this reasoning since it was never changed either way. See HANDOFF.md
   * for the full back-and-forth.
   */
  async _handleAutoExecuteEntry(symbolName, symbolId, signal) {
    const store = this.account;
    // 2026-09-13: this was the ONLY path that can submit a real order, yet
    // had zero console output - _notifyText is ntfy-only (fetch to
    // ntfy.sh, never logged) and only warns on push failure, so Render's
    // durable server logs could never confirm whether a real order attempt
    // ever happened, only ntfy's own (inaccessible) push history could.
    // Esdras asked explicitly ("fais en sorte que le trade s'exécute
    // réellement") for the pipeline itself to be verifiable, not just
    // fixed - this line plus the ones below at submit/confirm time close
    // that gap.
    console.log(`[auto-execute] entry signal received: ${symbolName} source=${signal.source} side=${signal.suggestedSide} id=${signal.id}`);
    const signalTimeMs = Date.now();
    logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: signal.source, event: 'signal', side: signal.suggestedSide, price: signal.entryPrice, detail: `stop=${signal.stopPrice} target=${signal.targetPrice}` });
    try {
      const spec = this._specFor(symbolName);
      if (!spec) {
        console.warn(`[auto-execute] no symbol spec for ${symbolName} - skipping entry`);
        return;
      }
      // Bug fix (2026-09, multi-account rollout) - see the identical note in
      // _handlePyramidOrderRequested() above: the live per-account risk%,
      // not the boot-time global default.
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: store.strategyEngine.riskPctPerTrade,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        symbolSpec: spec,
      });
      const isFvg = signal.source === 'fvg';
      // Was a flat 4 candles (~1h) - far shorter than CONFIG.fvg.maxAgeCandles
      // (50, ~12.5h), the window the BACKTEST itself gives an FVG zone to be
      // retested before calling it stale. 'validated' only fires once price
      // has ALREADY touched the zone once (see fvgEngine.js) - live, this
      // LIMIT order is a bet the zone gets touched AGAIN before it goes
      // stale, so it needs the SAME tolerance the backtest gave the zone
      // overall, not an arbitrary shorter one (found 2026-09 after Esdras
      // asked "il faut que l'ordre passe vraiment" - a real, unfilled XAUUSD
      // limit expired long before this fix, per orderOutcomeLog). This is
      // still not a perfect backtest match (a resting order genuinely
      // sitting for the FULL zone lifetime would need order placement moved
      // to 'watching'/formation time instead, a bigger change not made here
      // - see HANDOFF.md), but it removes the dominant known cause of
      // missed fills without touching entry price, stop, or target.
      const FVG_LIMIT_EXPIRY_CANDLES = CONFIG.fvg.maxAgeCandles;
      // 2026-09-13: was a hardcoded `* 15 * 60 * 1000` (assumed every symbol
      // is on M15) - now resolves the SAME per-symbol timeframe
      // _subscribeLiveCandles() actually subscribed this symbol on, so
      // BTCUSD's temporary M1 override expires its LIMIT order after 50
      // real minutes (matching maxAgeCandles), not 50 M15-shaped candles
      // (~12.5h) it was never actually warmed up or backtested against at
      // that timeframe. Every other symbol still resolves to M15 exactly as
      // before - CANDLE_DURATION_MS only changes the constant multiplied in.
      const candleDurationMs = TIMEFRAME_DURATION_MS[resolveSymbolTimeframe(symbolName)] || TIMEFRAME_DURATION_MS.M15;
      const lastCandle = store.lastCandleBySymbol.get(symbolName);
      const expirationTimestamp =
        isFvg && lastCandle ? lastCandle.time + FVG_LIMIT_EXPIRY_CANDLES * candleDurationMs : undefined;

      // Source in the label so it's identifiable directly in cTrader's own
      // order/position list, not just in the ntfy push below - the user
      // explicitly asked to be able to "voir et vérifier" each execution,
      // and the broker's own UI is the most durable place to check that
      // (survives even if a push notification is missed/dismissed).
      // Also what _findRealOrderOrPositionForLabel() matches on when no
      // confirmation arrives - see the else-branch below.
      const orderLabel = `auto-${signal.source}-${symbolName}`;
      const submittedAtMs = Date.now();
      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: isFvg ? 'LIMIT' : 'MARKET',
        tradeSide: signal.suggestedSide.toUpperCase(),
        lots: sizing.lots,
        symbolSpec: spec,
        price: isFvg ? signal.entryPrice : undefined,
        stopLoss: signal.stopPrice,
        takeProfit: signal.targetPrice,
        // The anchor the stop/target distances are measured from on a MARKET
        // order (2026-09-18 - see toRelativeProtectionDistance). Ignored on
        // the FVG/LIMIT path, which keeps absolute prices. `price` is
        // undefined for every MARKET source here, so this is the only place
        // the intended entry level is still available at submission time.
        referencePrice: signal.entryPrice,
        label: orderLabel,
        expirationTimestamp,
      });
      // Logged unconditionally (null included) - a null brokerOrderId with
      // no thrown error would otherwise be silently indistinguishable from
      // a real success in every log Render actually keeps.
      console.log(`[auto-execute] _submitOrder resolved for ${symbolName}: brokerOrderId=${brokerOrderId}`);
      logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: signal.source, event: brokerOrderId != null ? 'order_sent' : 'order_no_id', side: signal.suggestedSide, price: signal.entryPrice, detail: `${isFvg ? 'LIMIT' : 'MARKET'} lots=${sizing.lots} orderId=${brokerOrderId}` });
      if (brokerOrderId != null) {
        // Tracked so _handleExecutionEvent can confirm the REAL outcome
        // (filled vs cancelled/expired/rejected) instead of leaving the
        // engine's own 'validated'-time belief unverified indefinitely.
        this.pendingEntryOrderByOrderId.set(String(brokerOrderId), {
          symbolName,
          source: signal.source,
          signalId: signal.id,
          // 2026-09-14: carried through to openPositionInfoByPositionId once
          // this fill is confirmed (see _handleExecutionEvent) - needed to
          // log a REAL trade outcome (direction/entryPrice for the record,
          // riskAmount as the denominator for a real R-multiple) once the
          // position actually closes, instead of the engine's simulated
          // stop-vs-target guess.
          direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
          entryPrice: signal.entryPrice,
          riskAmount: sizing.actualRiskAmount,
          signalPrice: signal.entryPrice,
          signalTime: signalTimeMs,
          orderTime: submittedAtMs,
          riskPct: store.strategyEngine.riskPctPerTrade,
          spreadAtSignal: this.lastSpreadBySymbol.get(symbolName) ?? null,
          // 2026-09-14 (found live: a real position came back stopLoss:null
          // with no working stop order behind it either - see
          // accountReconciliation.js's computeMissingStopFixes) - the ONLY
          // record of what this position's intended protection was, so the
          // periodic sweep below can resubmit it if the broker ever drops
          // it. Never used to size/open anything - purely a memory of what
          // WE already asked the broker for at entry time.
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
        });
        this._notifyText(
          `🤖 [${signal.source.toUpperCase()}] Entrée auto envoyée sur ${symbolName} (${signal.suggestedSide.toUpperCase()}, entrée ${signal.entryPrice}, stop ${signal.stopPrice}, cible ${signal.targetPrice}, ${sizing.lots} lots)`
        );
      } else {
        // No push confirmation. This used to ASSUME nothing had happened and
        // clear the belief (2026-09-14 reasoning, kept below for the case it
        // still covers) - which is a coin flip in both directions: if the
        // order actually DID reach the broker, that assumption leaves a real,
        // untracked position running with nobody watching it here.
        //
        // 2026-09-17 (Esdras: "comment peut on s'assurer à 100% que l'ordre
        // passe"): stop assuming, go ASK. ProtoOAReconcileReq is a
        // request/response round-trip, and request/response is precisely
        // what kept working through today's 6-hour push-channel outage - so
        // this answers the question on exactly the connection state that
        // breaks the push path. ~200ms, only on this already-abnormal path.
        let verified = null;
        try {
          verified = await this._findRealOrderOrPositionForLabel({ symbolId, label: orderLabel, submittedAtMs });
        } catch (verifyErr) {
          // Verification itself failed (connection fully down, not just its
          // push channel) - fall through to the old clear-the-belief path
          // rather than leaving the signal in limbo.
          console.error(`[auto-execute] order verification failed for ${symbolName}:`, verifyErr.message);
        }

        if (verified?.orderId != null) {
          // The order is REAL and still working (a LIMIT/STOP that hasn't
          // triggered yet) - only its confirmation push was lost. Track it
          // exactly as the confirmed path does, so its eventual fill/expiry
          // still resolves normally if the push channel recovers.
          this.pendingEntryOrderByOrderId.set(String(verified.orderId), {
            symbolName,
            source: signal.source,
            signalId: signal.id,
            direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
            entryPrice: signal.entryPrice,
            riskAmount: sizing.actualRiskAmount,
            stopPrice: signal.stopPrice,
            targetPrice: signal.targetPrice,
          });
          console.warn(
            `[auto-execute] no push confirmation for ${symbolName}, but reconcile found the REAL working order ` +
              `orderId=${verified.orderId} - adopted, belief kept.`
          );
          this._notifyText(
            `🟡 [${signal.source.toUpperCase()}] Ordre bien placé sur ${symbolName} (confirmé en interrogeant le courtier, le message de confirmation s'est perdu) - ordre en attente, suivi normalement.`
          );
        } else if (verified?.positionId != null) {
          // The order FILLED (a MARKET order, already a real position by the
          // time we asked) - its order is gone from the working list, so
          // there is no orderId to track, but the position itself is what
          // matters: register it directly in the map the fill event would
          // have populated, so the eventual real close still writes a
          // durable journal row with a real R-multiple.
          this.openPositionInfoByPositionId.set(String(verified.positionId), {
            symbolName,
            source: signal.source,
            signalId: signal.id,
            direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
            entryPrice: signal.entryPrice,
            riskAmount: sizing.actualRiskAmount,
            stopPrice: signal.stopPrice,
            targetPrice: signal.targetPrice,
            entryTime: Date.now(),
          });
          store.recordOrderOutcome({ symbol: symbolName, source: signal.source, signalId: signal.id, outcome: 'filled', executionType: 'RECONCILE_VERIFIED' });
          console.warn(
            `[auto-execute] no push confirmation for ${symbolName}, but reconcile found a REAL OPEN POSITION ` +
              `positionId=${verified.positionId} - adopted, belief kept (this is the orphan case the old ` +
              'assume-nothing-happened branch used to create).'
          );
          this._notifyText(
            `🟢 [${signal.source.toUpperCase()}] Position RÉELLEMENT ouverte sur ${symbolName} (confirmé en interrogeant le courtier, le message de confirmation s'est perdu) - suivie normalement.`
          );
        } else {
          // Genuinely nothing at the broker - now VERIFIED, not assumed.
          // 2026-09-14 reasoning still applies here: leaving the belief
          // stuck would reject every later signal on this symbol as
          // 'netting' until someone manually called
          // /admin/clear-believed-position, and there is nothing real to
          // protect, so clear it.
          store.strategyEngine.clearBelievedPosition(symbolName, signal.id);
          // 2026-09-18: name the refusal when the broker gave us one.
          // "no orderId within timeout ... never reached the broker" is
          // accurate but says nothing actionable, and it is what three real
          // refused orders looked like while the reason went unread. When
          // _submitOrder has just recorded a rejection for THIS submission
          // (lastOrderRejection, set moments ago on the same await chain),
          // the reason belongs in the line a human actually reads.
          // Bounded to this submission on purpose: lastOrderRejection is
          // the LAST refusal ever seen, so without this an unrelated
          // refusal from hours ago would get blamed for today's timeout -
          // a worse failure than saying nothing.
          const lastRefusal = this.lastOrderRejection;
          const refusal = lastRefusal && lastRefusal.receivedAtMs >= submittedAtMs ? lastRefusal : null;
          const reason = refusal ? ` Motif du courtier : ${refusal.errorCode ?? 'sans code'} - ${refusal.description ?? 'aucune description'}.` : '';
          console.warn(
            `[auto-execute] no orderId within timeout for ${symbolName} AND reconcile found nothing real - order never reached the broker, clearing believed-open.` +
              (refusal ? ` Broker refusal: errorCode=${refusal.errorCode} description=${refusal.description}` : '')
          );
          this._notifyText(
            `⚠️ [${signal.source.toUpperCase()}] Aucune confirmation du courtier sur ${symbolName} et aucun ordre/position réels trouvés (vérifié) - signal abandonné, croyance nettoyée.${reason}`
          );
        }
      }
    } catch (err) {
      console.warn(`[auto-execute] failed to submit entry for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ [${signal.source.toUpperCase()}] Échec de l'envoi de l'entrée sur ${symbolName} (${err.message}) - à vérifier manuellement`);
    }
  }

  async _cancelOrder(orderId) {
    const accountId = Number(this.accountId);
    await this.connection.sendCommand('ProtoOACancelOrderReq', {
      ctidTraderAccountId: accountId,
      orderId: Number(orderId),
    });
  }

  _handleExecutionEvent(event) {
    const store = this.account;
    // Same observability gap as _handleAutoExecuteEntry above - every real
    // execution event (fill, reject, cancel, expiry) used to be invisible
    // in Render's server logs, visible only via ntfy (and only for the
    // subset _notifyText actually announces). One line per event, cheap
    // and unconditional, so "did the broker ever answer at all" is
    // answerable from `render logs` alone.
    console.log(`[execution-event] type=${event.executionType} orderId=${event.order?.orderId ?? 'n/a'} positionId=${event.position?.positionId ?? event.deal?.positionId ?? 'n/a'}`);
    // 2026-09-14 (Esdras, live: a real BTCUSD take-profit close on positionId
    // 41549468/orderId 50200971 produced exactly one ORDER_FILLED event that
    // did NOT enter the closePositionDetail branch below - the durable
    // real-P&L journal silently missed it. dealPairing.js proves
    // closePositionDetail definitely exists for this same close (it's what
    // ProtoOADealListReq/the boot "last 24h of closed deals" load and
    // /trade-history read), so the gap is in what THIS push event
    // (ProtoOAExecutionEvent) actually carries for a broker-triggered
    // TP/SL bracket fill specifically - never confirmed live before tonight
    // (every previously-logged real close in this journal was a MANUAL/
    // guardrail-driven close, a different code path). Dumping the raw
    // event.deal/event.position here (once, only on ORDER_FILLED, cheap)
    // until the next real close reveals the actual shape - don't guess at
    // a fix for an undocumented broker payload.
    if (event.executionType === 'ORDER_FILLED') {
      console.log('[execution-event:raw-fill] deal=' + JSON.stringify(event.deal) + ' position=' + JSON.stringify(event.position));
    }
    // A position closed on the broker side -> feed it into the guardrail engine
    // as ground truth (real trade, not a demo simulation).
    if (event.executionType === 'ORDER_FILLED' && event.deal?.closePositionDetail) {
      const pnl = Number(event.deal.closePositionDetail.grossProfit) / 100;
      // 2026-09-16: prefer the broker's OWN resulting balance over
      // `store.balance + pnl`. closePositionDetail carries a `balance` field
      // (an int64-as-string, same as everything else here) that is the
      // account's real balance right after this close - accumulating our own
      // running total instead drifts away from it on anything we don't see:
      // swaps, commissions, manual trades placed from the cTrader app, and
      // every close that happened while this process was down. Falls back to
      // the old running-total behaviour only when the field is absent.
      const balanceAfter = parseBrokerMoney(
        event.deal.closePositionDetail.balance,
        event.deal.closePositionDetail.moneyDigits
      );
      store.setBalance(balanceAfter !== null ? balanceAfter : store.balance + pnl);
      // String(...) (2026-09-18) - same reasoning as _loadClosedDeals' own
      // recordTrade call above: event.deal.symbolId comes from
      // ProtoOAExecutionEvent, a different message than symbolNameById's
      // ProtoOASymbolsListReq origin.
      store.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: store.balance, symbol: this.symbolNameById.get(String(event.deal.symbolId)) });

      // 2026-09-14 (Esdras: "corrige pour voir le vrai P&L du courtier"):
      // logs the REAL outcome/pnl to the durable Supabase journal, using
      // the context captured at fill time above - only for a position THIS
      // process actually opened via auto-execute (pyramid legs aren't
      // tracked here, a known gap, not fixed tonight). outcome/rMultiple
      // are derived from the real `pnl` above, not a simulated stop/target
      // guess - matches what dealPairing.js's trade-history view already
      // computes from the same closePositionDetail.
      {
        const closedPositionId = String(event.deal.positionId ?? event.position?.positionId);
        const info = this.openPositionInfoByPositionId.get(closedPositionId);
        if (info) {
          this.openPositionInfoByPositionId.delete(closedPositionId);
          logClosedTrade(this.tradeLogClient, {
            symbol: info.symbolName,
            source: info.source,
            direction: info.direction,
            outcome: pnl >= 0 ? 'win' : 'loss',
            rMultiple: info.riskAmount > 0 ? pnl / info.riskAmount : null,
            entryPrice: info.entryPrice,
            entryTime: info.entryTime,
            exitTime: Date.now(),
            // Real broker $ (pnl, computed above from grossProfit) and the
            // real resulting balance (store.setBalance already applied it
            // just above) - Esdras's calendar request needs actual dollars/
            // %, not just R-multiples.
            pnlUsd: pnl,
            balanceAfter: store.balance,
            extra: extraTradeFields(info, Number(event.deal.executionPrice)),
          });
          // 2026-09-14 (found live, monitoring BTCUSD right after the
          // null-orderId fix): the engine's own belief (openPositions) was
          // NEVER cleared by a REAL confirmed close - only by its OWN
          // internal candle-simulated stop/target check
          // (_resolveOpenPosition, liveStrategyEngine.js) catching up on a
          // LATER candle, or by the other clearBelievedPosition() call
          // sites (boot cleanup, an order that never filled at all). On
          // BTCUSD's fast M1 cadence the broker's real bracket order can
          // close a position before the engine's own per-candle simulation
          // re-checks it, leaving a real "believed-only" gap. Confirmed
          // live: after a real close, reconciliation kept reporting
          // botBelievesOpen:true/realOpenCount:0 for several minutes -
          // harmless to the account itself (netting correctly kept
          // rejecting every later signal rather than risking a second real
          // position on top), but it silently threw away every real signal
          // in that window, the exact "aucune erreure" gap Esdras asked to
          // watch for. Clearing it here, the moment reality is actually
          // confirmed, is the direct fix - matched by id so a newer signal
          // already superseding this one on the same symbol is never
          // clobbered (see clearBelievedPosition's own guard).
          store.strategyEngine.clearBelievedPosition(info.symbolName, info.signalId);
        }
      }
      // Prop-firm challenge target alert (2026-09, multi-account rollout -
      // see src/propFirms/index.js). Fires ONCE on the first real close that
      // confirms the target; GuardrailEngine now blocks every new entry until
      // the operator reviews the account and applies the next phase.
      if (store.guardrail.consumeTargetReachedEvent()) {
        this._notifyText(`🎯 Cible atteinte sur ${store.label} (+${store.guardrail.targetPct}%) - solde ${store.balance.toFixed(2)}. La prop firm devrait bientôt fournir le compte de la phase suivante.`);
      }

      // If the position that just closed was a pyramid add-on leg (tracked
      // purely by positionId here - see constructor comment), clean up the
      // side-map. Its win/loss is ALREADY counted above like any other
      // trade; this is bookkeeping only, not a second pnl application.
      const positionId = event.deal.positionId ?? event.position?.positionId;
      // BUG FOUND 2026-09-17 (execution-path audit): this was a bare `===`,
      // the ONLY positionId/orderId comparison anywhere in this file NOT
      // wrapped in Number(...) - every other one is (see
      // _findRealOrderOrPositionForLabel/_waitForOrderIdBySymbol/_loadBalance/
      // dealPairing.js), specifically because this broker is confirmed to
      // sometimes serialize the SAME conceptual int64 field as a JSON string
      // and sometimes as a number depending on the message type. `trackedId`
      // here can come from event.position?.positionId at pyramid-fill time
      // OR from a ProtoOAReconcileReq position.positionId (the
      // reconcile-verified fill path) - two different message shapes from
      // two different call sites, never guaranteed to agree on string vs
      // number with THIS event's own `positionId`. A silent mismatch would
      // leave pyramidPositionIdBySymbol never cleaned up (a small, permanent
      // leak) AND skip the pyramid-close notification - no safety impact
      // (the position itself is already correctly closed/journaled above,
      // independent of this map), but real, matching this file's own
      // established discipline everywhere else.
      for (const [symbolName, trackedId] of this.pyramidPositionIdBySymbol) {
        if (Number(trackedId) === Number(positionId)) {
          this.pyramidPositionIdBySymbol.delete(symbolName);
          this._notifyText(`🔺 Pyramide auto : unité ajoutée sur ${symbolName} clôturée (résultat ${pnl >= 0 ? 'gagnant' : 'perdant'}, ${pnl.toFixed(2)}$)`);
          break;
        }
      }
    }

    // The pyramid add-on's PENDING order just got filled (opened, not
    // closed) - tell the engine so it stops tracking it as "pending" (from
    // here it's a broker-managed bracket position, see markPyramidOrderFilled),
    // and remember its positionId so the eventual close above can be
    // attributed correctly. Matched by the broker-assigned orderId we
    // recorded at placement time, NOT by parsing the order's label - more
    // robust if a given API response doesn't echo the label back.
    if (event.executionType === 'ORDER_FILLED' && !event.deal?.closePositionDetail && event.order?.orderId != null) {
      const symbolName = this.pyramidOrderSymbolByOrderId.get(String(event.order.orderId));
      if (symbolName) {
        this.pyramidOrderSymbolByOrderId.delete(String(event.order.orderId));
        const filled = store.strategyEngine.markPyramidOrderFilled(symbolName);
        const positionId = event.position?.positionId ?? event.deal?.positionId;
        if (filled && positionId != null) {
          this.pyramidPositionIdBySymbol.set(symbolName, positionId);
          // BUG FOUND 2026-09-17 (execution-path audit): a pyramid leg used
          // to be tracked ONLY in pyramidPositionIdBySymbol (close-time
          // notification only) - never in openPositionInfoByPositionId,
          // which is what BOTH the periodic missing-stop-loss resubmission
          // sweep (_clearStaleBeliefsAgainstBroker -> computeMissingStopFixes
          // -> getTrackedStopPrice) AND the durable Supabase journal
          // (logClosedTrade, below in the closePositionDetail branch) read
          // from. Concretely: if the broker ever dropped a pyramid leg's
          // stop-loss (the exact 2026-09-14 BTCUSD incident, which happened
          // to an original entry, not a pyramid leg - but the code path is
          // identical), the automatic resubmission would silently skip it
          // ("never observed this position's own entry" - false, we did,
          // just not here), and its eventual win/loss would never reach the
          // durable journal either - both already flagged as "a known gap,
          // not fixed tonight" in this file's own history, closed now with
          // the one piece of data (filled.stopPrice/targetPrice/entryPrice)
          // this method already has and the two consumers already read.
          // signalId: null is safe - clearBelievedPosition (called below on
          // close) only clears a REAL match by id, and a pyramid leg was
          // never in `openPositions` under any id to begin with.
          this.openPositionInfoByPositionId.set(String(positionId), {
            symbolName,
            source: 'pyramid',
            signalId: null,
            direction: filled.direction,
            entryPrice: filled.entryPrice,
            riskAmount: filled.riskAmount,
            stopPrice: filled.stopPrice,
            targetPrice: filled.targetPrice,
            entryTime: Date.now(),
          });
          this._notifyText(`🔺 Pyramide auto : 2e unité REMPLIE sur ${symbolName} à ${filled.entryPrice} (stop ${filled.stopPrice}, cible ${filled.targetPrice})`);
        }
      }
    }

    // Real outcome of an auto-execute ENTRY order this process submitted
    // (see _handleAutoExecuteEntry/pendingEntryOrderByOrderId above) -
    // 2026-09, at Esdras's explicit request after "un ordre était passé"
    // turned out to only mean the engine's own optimistic belief, not a
    // confirmed broker fill. ORDER_FILLED here means a real position just
    // opened (never has closePositionDetail, matching the pyramid check
    // above); CANCELLED/EXPIRED/REJECTED mean the order never became a real
    // position at all - which the engine's own 'validated'-time belief
    // (openPositions, set optimistically before any of this is known) has
    // no way to find out about on its own. executionType names per
    // spotware/openapi-proto-messages' ProtoOAExecutionType - EXPIRED is
    // the one a GOOD_TILL_DATE limit that never got touched again should
    // produce, not yet confirmed against a real response (same "written
    // against documentation" caveat as the rest of this file).
    // BUG FOUND 2026-09-18 (execution-path audit continued): String(...) on
    // the lookup key, not the raw event.order.orderId - see the matching
    // fix/tests on pyramidOrderSymbolByOrderId above and the
    // openPositionInfoByPositionId/pyramidPositionIdBySymbol precedent this
    // mirrors. pendingEntryOrderByOrderId can be populated from THREE
    // different broker message types (a ProtoOAExecutionEvent ACCEPTED via
    // _waitForOrderIdBySymbol, or a ProtoOAReconcileRes order/position via
    // the reconcile-verified fallback - see _handleAutoExecuteEntry), and
    // this broker is confirmed (repeatedly, this session) to serialize the
    // same conceptual int64 field as a string or a number depending on which
    // message it came from. A bare `.has(event.order.orderId)` would
    // silently never match a fallback-adopted order whose type happened to
    // differ from this later FILLED/CANCELLED event's own orderId - exactly
    // the connection state the fallback exists to survive.
    const pendingOrderKey = String(event.order?.orderId);
    if (event.order?.orderId != null && this.pendingEntryOrderByOrderId.has(pendingOrderKey)) {
      const pending = this.pendingEntryOrderByOrderId.get(pendingOrderKey);
      const unfilledTypes = new Set(['ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_REJECTED']);
      if (event.executionType === 'ORDER_FILLED' && !event.deal?.closePositionDetail) {
        this.pendingEntryOrderByOrderId.delete(pendingOrderKey);
        // 2026-09-14: remember this REAL position (String() - see this
        // class's own openPositionInfoByPositionId comment for why) so the
        // eventual real close below can log a durable trade row from
        // confirmed broker data, not a simulated guess.
        const filledPositionId = event.position?.positionId ?? event.deal?.positionId;
        if (filledPositionId != null) {
          const fillPx = Number(event.deal?.executionPrice ?? event.order?.executionPrice);
          this.openPositionInfoByPositionId.set(String(filledPositionId), { ...pending, entryTime: Date.now(), fillPrice: Number.isFinite(fillPx) && fillPx > 0 ? fillPx : null, spreadAtEntry: this.lastSpreadBySymbol.get(pending.symbolName) ?? null });
        }
        logOrderEvent(this.tradeLogClient, { symbol: pending.symbolName, source: pending.source, event: 'filled', side: pending.direction === 'bullish' ? 'buy' : 'sell', price: Number(event.deal?.executionPrice ?? event.order?.executionPrice), detail: `orderId=${event.order.orderId} signalPrice=${pending.signalPrice}` });
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'filled', executionType: event.executionType });
        console.log(`[auto-execute] CONFIRMED FILLED: ${pending.symbolName} source=${pending.source} orderId=${event.order.orderId} - real position opened at the broker.`);
        this._notifyText(`✅ [${pending.source.toUpperCase()}] Ordre confirmé REMPLI sur ${pending.symbolName} - position réellement ouverte chez le courtier.`);
      } else if (unfilledTypes.has(event.executionType)) {
        this.pendingEntryOrderByOrderId.delete(pendingOrderKey);
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'unfilled', executionType: event.executionType });
        logOrderEvent(this.tradeLogClient, { symbol: pending.symbolName, source: pending.source, event: event.executionType === 'ORDER_REJECTED' ? 'rejected' : event.executionType === 'ORDER_EXPIRED' ? 'expired' : 'cancelled', side: pending.direction === 'bullish' ? 'buy' : 'sell', price: pending.signalPrice, detail: `orderId=${event.order.orderId} ${event.executionType}` });
        console.log(`[auto-execute] CONFIRMED UNFILLED: ${pending.symbolName} source=${pending.source} orderId=${event.order.orderId} executionType=${event.executionType} - no real position, clearing believed-open.`);
        // The engine believed this was open the moment it validated the
        // signal (see _processFvgEvent etc.) - now confirmed wrong. Clear
        // it so the dashboard stops showing a ghost "believed open"
        // position for up to 5 days (maxHoldingCandles) instead of the
        // true "nothing happened" state, matched by id so a NEWER signal
        // on the same symbol (opened after this one) is never clobbered by
        // a late-arriving confirmation for the old one.
        store.strategyEngine.clearBelievedPosition(pending.symbolName, pending.signalId);
        this._notifyText(`⚠️ [${pending.source.toUpperCase()}] Ordre JAMAIS rempli sur ${pending.symbolName} (${event.executionType}) - aucune position réelle, signal abandonné.`);
      }
    }
  }

  _notify(events) {
    const store = this.account;
    if (!CONFIG.notifications.ntfyTopic) return;
    for (const e of events) {
      if (e.type !== 'validated') continue;
      // Divergence/NWOG/Judas Swing signals have no `zone` (that's an FVG-only concept) - describe generically.
      const range = e.zone ? ` (${e.zone.bottom.toFixed(2)}-${e.zone.top.toFixed(2)})` : '';
      const label =
        e.source === 'divergence' ? 'divergence' :
        e.source === 'nwog' ? 'NWOG (gap week-end)' :
        e.source === 'judaswing' ? 'Judas Swing (killzone Londres)' :
        e.source === 'weeklysweep' ? 'Weekly Liquidity Sweep (GER40)' :
        e.source === 'breakerblock' ? 'Breaker Block (GER40)' :
        e.source === 'silverbullet' ? 'Silver Bullet (killzone 10h-11h NY)' :
        // BUG FOUND 2026-09-18: cbdr went live on US100 today but was
        // missing here - every real CBDR alert would have been pushed as
        // the generic "FVG rempli" fallback below, misleading Esdras about
        // what actually fired. Same recurring gap already found once for
        // breakerblock (dealPairing.js's own comment) - fixed at every
        // downstream label site in the same pass, not just this one.
        e.source === 'cbdr' ? 'CBDR (fenêtre 14h-20h NY)' :
        'FVG rempli';
      // Forward-test démo OBSERVATION ONLY (2026-09) - re-tags here rather than
      // reusing pushSignalEvents' already-tagged copy, so this stays a pure
      // addition with zero effect on `events`/`actionable` (used above for
      // auto-execute) - see accountRuntime.js's tagVolatilityObservation() and HANDOFF.md.
      const tagged = store.tagVolatilityObservation(e);
      const volNote = tagged.volRegime
        ? ` [obs. vol: ${tagged.volRegime}, taille sugg. ${tagged.suggestedRiskPct.toFixed(2)}% — non appliqué]`
        : '';
      const text = `${e.suggestedSide.toUpperCase()} ${e.symbol} — ${label}${range}${volNote}`;
      recordAlert(text);
      fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
        console.warn('[ntfy] push failed', err.message)
      );
    }
  }

  /** Same push channel as _notify(), for a plain text message (pyramid auto-execution confirmations/warnings). */
  _notifyText(text) {
    recordAlert(text);
    if (!CONFIG.notifications.ntfyTopic) return;
    fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
      console.warn('[ntfy] push failed', err.message)
    );
  }
}
