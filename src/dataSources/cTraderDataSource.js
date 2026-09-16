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
import { calculateLotSize, getDefaultSpec } from '../engines/lotCalculator.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../backtest/nySession.js';
import { pairDealsIntoTrades } from './dealPairing.js';
import { reconcileAccount, estimateEquity, computeStaleBeliefsToClear, computeMissingStopFixes } from './accountReconciliation.js';
import { createTradeLogClient, logClosedTrade, fetchRecentTradeRows, enrichTradesWithRMultiple, enrichTradesWithSlippage } from './supabaseTradeLog.js';
import { buildFvgComplianceChecklist, requiredH1LookbackCandles } from './tradeCompliance.js';
import { buildChartOverlays } from '../backtest/chartOverlays.js';
import { evaluateLiveFilters } from '../backtest/liveFvgFilterStatus.js';

const HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com'; // use live.ctraderapi.com for a real (non-demo) account
const PORT = 5035;

// Phase 1 of the multi-account rollout (see HANDOFF.md/accountRegistry.js):
// this data source, like the other two, still only ever drives the single
// default account - kept as a local `store` alias so the rest of this file
// (and its comments referring to "store.X") reads exactly as before.
const store = getDefaultAccount();

// cTrader trendbar period enum name for our configured timeframe.
const PERIOD_BY_TIMEFRAME = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1' };
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
    // caught this immediately - lesson for next time.
    this.connection.on('ProtoOAExecutionEvent', (event) => this._handleExecutionEvent(event.descriptor));

    store.mode = 'live';
    console.log(`[cTrader:${store.id}] connected and live for account`, accountId);
  }

  async stop() {
    const store = this.account;
    if (this._heartbeat) clearInterval(this._heartbeat);
    if (this._staleBeliefSweep) clearInterval(this._staleBeliefSweep);
    if (this.connection) await this.connection.close?.();
    store.mode = 'demo';
  }

  async _loadSymbols(accountId) {
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOASymbolsListReq', {
      ctidTraderAccountId: Number(accountId),
    });
    for (const sym of res.symbol || []) {
      this.symbolIdByName.set(sym.symbolName, sym.symbolId);
      this.symbolNameById.set(sym.symbolId, sym.symbolName);
    }
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
    const rawBalance = res.trader?.balance;
    if (typeof rawBalance === 'number') {
      const moneyDigits = res.trader?.moneyDigits ?? 2;
      store.setBalance(rawBalance / 10 ** moneyDigits);
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
        store.guardrail.recordTrade({ pnl, time: Number(deal.executionTimestamp), symbol: this.symbolNameById.get(deal.symbolId) });
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
      orderLabelsById = new Map(
        (orderRes.order || []).map((o) => [o.orderId, o.tradeData && o.tradeData.label])
      );
    } catch (err) {
      console.warn('[cTrader] trade history: failed to fetch order labels (source will show as unknown):', err.message);
    }

    const trades = pairDealsIntoTrades(res.deal || [], orderLabelsById).slice(0, maxTrades);

    const enriched = [];
    for (const trade of trades) {
      const symbolName = this.symbolNameById.get(trade.symbolId) || `#${trade.symbolId}`;
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
   * "Preuve visuelle de conformité" (2026-09-15, Esdras, after seeing a
   * mockup: "donne tout, pour l'avoir dès le départ") - for each trade,
   * reconstructs whether it actually followed the live strategy's own real
   * procedure, reusing the SAME production functions (FvgEngine,
   * computeStop, buildHtfBiasSeries) rather than a second implementation -
   * see tradeCompliance.js's own header for the full reasoning and its
   * honestly-scoped limits (only 'fvg'-source trades get the rich zone/
   * stop/bias reconstruction; every trade gets the risk-% check, which
   * needs only what's already in `trade` by this point).
   *
   * The HTF-bias item needs its OWN extra broker fetch (H1 candles far
   * enough back to seed the configured EMA - requiredH1LookbackCandles) -
   * unlike the chart-context candles above, this is NOT reused for
   * anything else, so it's only fetched when a trade's symbol actually has
   * a non-'baseline' bias variant configured. A failure here degrades to
   * "non vérifiable" for that one item, never blocks the rest of the
   * trade's history from loading.
   */
  async _attachComplianceChecklists(trades, accountId) {
    const expectedRiskPct = this.account.strategyEngine?.riskPctPerTrade ?? null;
    const out = [];
    for (const trade of trades) {
      const cfg = trade.source === 'fvg' ? CONFIG.fvg.perSymbol[trade.symbol] : null;
      let h1Candles = null;
      if (cfg) {
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
      const { zone, items } = buildFvgComplianceChecklist({ trade, candles: trade.candles || [], cfg, h1Candles, expectedRiskPct });
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
   * Time convention, easy to get backwards (see liveFvgFilterStatus.js's
   * own header): `candles` here is store.strategyEngine's OWN retained
   * history, already in ENGINE time (real UTC - 5h, see _toEngineCandle()) -
   * so `atTime` (this symbol's freshest candle) is engine time too, and the
   * freshly-fetched H1 candles below are shifted the SAME way before use,
   * so the bias lookup stays self-consistent with atTime. tradeCompliance.js's
   * OWN bias check (for a closed trade) doesn't need this shift - it compares
   * two real-UTC values against each other - but that trick doesn't apply
   * here since atTime is forced into engine time by where it comes from.
   */
  async getPendingZoneChecklists(symbol) {
    const store = this.account;
    const cfg = CONFIG.fvg.perSymbol[symbol];
    if (!cfg) return { symbol, zones: [], reason: 'not an FVG-strategy symbol' };

    const historyBySymbol = {};
    for (const s of CONFIG.symbols) historyBySymbol[s] = store.strategyEngine.getHistory(s);
    const candles = historyBySymbol[symbol];
    if (!candles || candles.length === 0) return { symbol, zones: [], reason: 'no candle history yet' };

    const { zones } = buildChartOverlays(historyBySymbol, { symbol });
    const watching = zones.filter((z) => z.status === 'watching');
    if (watching.length === 0) return { symbol, zones: [] };

    const atTime = candles[candles.length - 1].time;

    let h1Candles = null;
    const lookback = requiredH1LookbackCandles(cfg.variant);
    if (lookback > 0) {
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

    return {
      symbol,
      zones: watching.map((z) => ({
        id: z.id,
        direction: z.direction,
        top: z.top,
        bottom: z.bottom,
        formedAt: z.formedAt,
        checklist: evaluateLiveFilters({ candles, h1Candles, cfg, direction: z.direction, atTime }),
      })),
    };
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

    return { ...result, balance: store.balance, equityEstimate: estimateEquity(store.balance, result.floatingPnlEstimate) };
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
      getTrackedStopPrice: (positionId) => this.openPositionInfoByPositionId.get(positionId) || null,
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
  async getHistoricalCandles({ symbol, days }) {
    const symbolId = this.symbolIdByName.get(symbol);
    if (!symbolId) throw new Error(`Unknown symbol "${symbol}" on this cTrader account`);
    const period = PERIOD_BY_TIMEFRAME[CONFIG.timeframe] || 'M15';
    const toTimestamp = Date.now();
    const fromTimestamp = toTimestamp - days * 24 * 60 * 60 * 1000;
    const count = days * 24 * 4; // M15 candles/day cap, same convention as the warm-up request below

    const history = await sendCommandWithTimeout(
      this.connection,
      'ProtoOAGetTrendbarsReq',
      { ctidTraderAccountId: Number(this.accountId), fromTimestamp, toTimestamp, symbolId, period, count },
      60000 // can be tens of thousands of bars for an 8-month window - same generous timeout as the warm-up request
    );
    return (history.trendbar || [])
      .map((bar) => this._trendbarToCandle(bar))
      .sort((a, b) => a.time - b.time);
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
            // Date.now() explicitly (2026-09-14) - see liveStrategyEngine.js's
            // ingestCandle() comment: _toEngineCandle's -5h shift is correct
            // for signal/session logic but must NOT reach GuardrailEngine's
            // real-calendar-day bookkeeping, or its cooldown/daily-trade-count
            // protection silently resets itself every day between ~00:00-05:00
            // UTC (confirmed live: a real loss's 30-min cooldown vanished
            // after ~3 minutes instead of holding for the full 30).
            // deferCloseToRealConfirmation: true (2026-09-14, real
            // double-position bug found monitoring overnight - see
            // liveStrategyEngine.js's _resolveOpenPosition for the full
            // story) - only this live call site gets it: this data source
            // alone has the real ProtoOAExecutionEvent confirmation loop
            // (_handleExecutionEvent -> clearBelievedPosition) needed to
            // eventually release a belief held pending under this flag.
            const events = store.strategyEngine.ingestCandle(symbolName, this._toEngineCandle(candle), Date.now(), {
              deferCloseToRealConfirmation: true,
            });
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
          if (ticks.length > MAX_SPREAD_SAMPLES) ticks.shift();
        }
      });
    }
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
      const spec = getDefaultSpec(symbolName);
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
      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: 'STOP',
        tradeSide: e.direction === 'bullish' ? 'BUY' : 'SELL',
        lots: sizing.lots,
        symbolSpec: spec,
        price: e.entryPrice, // the order's OWN trigger price - NOT the protective stop-loss below
        stopLoss: e.stopPrice,
        takeProfit: e.targetPrice,
        label: `pyramid-add-${symbolName}`,
      });
      if (brokerOrderId != null) {
        store.strategyEngine.markPyramidOrderPlaced(symbolName, brokerOrderId);
        this.pyramidOrderSymbolByOrderId.set(brokerOrderId, symbolName);
        this._notifyText(`🔺 Pyramide auto : ordre stop programmé sur ${symbolName} (entrée ${e.entryPrice}, stop ${e.stopPrice}, cible ${e.targetPrice}, ${sizing.lots} lots)`);
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
      this.pyramidOrderSymbolByOrderId.delete(e.brokerOrderId);
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
  _waitForOrderIdBySymbol(symbolId, timeoutMs = 10000) {
    return new Promise((resolve) => {
      let uuid;
      const safeRemove = () => {
        try {
          if (uuid != null) this.connection.removeEventListener(uuid);
        } catch (err) {
          console.error('[_submitOrder] removeEventListener failed (non-fatal):', err.message);
        }
      };
      const timer = setTimeout(() => {
        safeRemove();
        // Resolves null, same as the old (broken) synchronous-response path
        // did on every call - callers already handle a null brokerOrderId
        // by skipping tracking/notification rather than throwing.
        resolve(null);
      }, timeoutMs);
      uuid = this.connection.on('ProtoOAExecutionEvent', (event) => {
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
      });
    });
  }

  async _submitOrder({ symbolId, orderType, tradeSide, lots, symbolSpec, price, stopLoss, takeProfit, label, expirationTimestamp }) {
    const accountId = Number(this.accountId);
    // rawVolume (2026-09-13, temporary BTCUSD spec - see lotCalculator.js):
    // that spec's `lots` is already forced to exactly the broker's own
    // minVolume, in the broker's OWN volume units - sending it straight
    // through avoids stacking a guessed lotSize on top of an already
    // guessed contract spec. Every other symbol keeps the existing
    // (still-unverified) lots*lotSize*100 convention unchanged.
    let volume;
    if (symbolSpec.rawVolume) {
      volume = Math.round(lots);
    } else {
      const lotSize = symbolSpec.lotSize || 100000; // VERIFY: fall back is a forex-standard-lot guess, not confirmed for indices/metals here
      volume = Math.round(lots * lotSize * 100); // VERIFY units against a real response before going live
    }
    const payload = { ctidTraderAccountId: accountId, symbolId, orderType, tradeSide, volume, stopLoss, takeProfit, label };
    if (orderType === 'STOP') payload.stopPrice = price;
    if (orderType === 'LIMIT') payload.limitPrice = price;
    if (expirationTimestamp) {
      payload.expirationTimestamp = expirationTimestamp;
      payload.timeInForce = 'GOOD_TILL_DATE'; // VERIFY exact enum name against a real API response
    }
    // Registered BEFORE sendCommand so the listener is armed no matter how
    // quickly the broker replies - see _waitForOrderIdBySymbol's own
    // comment for why this exists at all.
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
    console.log(`[_submitOrder] ${payload.orderType} ${payload.tradeSide} sent for symbolId=${symbolId}, rawRes=${JSON.stringify(res)}`);
    const syncOrderId = res?.order?.orderId ?? res?.orderId ?? null;
    if (syncOrderId != null) return syncOrderId; // some future response shape DOES carry it directly - trust it, no need to wait for the event
    return orderIdFromEvent;
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
   *   - Divergence AND NWOG: entryPrice IS candle.open of the very candle
   *     whose spot event we're processing right now - a MARKET order is the
   *     direct equivalent, not an approximation. For NWOG specifically
   *     (2026-09, live auto-execute at the user's explicit request - see
   *     HANDOFF.md) this is a genuine, KNOWN execution-quality gap worth
   *     naming rather than hiding: the live spot event carrying a completed
   *     trendbar only arrives once that M15 candle has CLOSED, so the
   *     MARKET order is submitted with price already having moved away from
   *     `entryPrice` (that candle's OPEN) by however much it drifted during
   *     those 15 minutes - especially relevant right after a weekend gap,
   *     when volatility is elevated. Same approximation Divergence has
   *     always made; not new here, just newly worth calling out since NWOG
   *     has no live execution history yet to confirm how much this matters
   *     in practice.
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
    try {
      const spec = getDefaultSpec(symbolName);
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

      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: isFvg ? 'LIMIT' : 'MARKET',
        tradeSide: signal.suggestedSide.toUpperCase(),
        lots: sizing.lots,
        symbolSpec: spec,
        price: isFvg ? signal.entryPrice : undefined,
        stopLoss: signal.stopPrice,
        takeProfit: signal.targetPrice,
        // Source in the label so it's identifiable directly in cTrader's own
        // order/position list, not just in the ntfy push below - the user
        // explicitly asked to be able to "voir et vérifier" each execution,
        // and the broker's own UI is the most durable place to check that
        // (survives even if a push notification is missed/dismissed).
        label: `auto-${signal.source}-${symbolName}`,
        expirationTimestamp,
      });
      // Logged unconditionally (null included) - a null brokerOrderId with
      // no thrown error would otherwise be silently indistinguishable from
      // a real success in every log Render actually keeps.
      console.log(`[auto-execute] _submitOrder resolved for ${symbolName}: brokerOrderId=${brokerOrderId}`);
      if (brokerOrderId != null) {
        // Tracked so _handleExecutionEvent can confirm the REAL outcome
        // (filled vs cancelled/expired/rejected) instead of leaving the
        // engine's own 'validated'-time belief unverified indefinitely.
        this.pendingEntryOrderByOrderId.set(brokerOrderId, {
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
        // 2026-09-14 (found live, monitoring BTCUSD's M1 cadence: a
        // _waitForOrderIdBySymbol timeout - no ProtoOAExecutionEvent within
        // 10s - left the engine's 'validated'-time belief stuck open with
        // NOTHING ever able to clear it, since pendingEntryOrderByOrderId
        // was never populated for this signal - every later signal on this
        // symbol was rejected as 'netting' until someone manually called
        // /admin/clear-believed-position. Clearing it here immediately is
        // the same judgment call that route already makes (never touch a
        // CONFIRMED position) applied one step earlier: this branch by
        // definition never learned a real orderId, so there is nothing to
        // confirm against either way - leaving the belief stuck helps
        // nobody. The rare case where the broker actually DID accept this
        // order despite the timeout isn't silently lost: real-vs-believed
        // reconciliation (/api/account) still flags it 'real-only' the
        // moment it's checked, exactly the safety net already built for
        // this.
        store.strategyEngine.clearBelievedPosition(symbolName, signal.id);
        console.warn(`[auto-execute] no orderId within timeout for ${symbolName} - clearing believed-open so future signals aren't netting-blocked.`);
        this._notifyText(`⚠️ [${signal.source.toUpperCase()}] Aucune confirmation du courtier sur ${symbolName} (délai dépassé) - signal abandonné, croyance nettoyée.`);
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
      store.setBalance(store.balance + pnl);
      store.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: store.balance, symbol: this.symbolNameById.get(event.deal.symbolId) });

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
      // see src/propFirms/index.js). Fires ONCE, the first real trade close
      // that confirms the target is reached - trading keeps going either way
      // (see GuardrailEngine's own header on why this never blocks). Esdras
      // adds the next-phase account herself once the firm actually grants it.
      if (store.guardrail.consumeTargetReachedEvent()) {
        this._notifyText(`🎯 Cible atteinte sur ${store.label} (+${store.guardrail.targetPct}%) - solde ${store.balance.toFixed(2)}. La prop firm devrait bientôt fournir le compte de la phase suivante.`);
      }

      // If the position that just closed was a pyramid add-on leg (tracked
      // purely by positionId here - see constructor comment), clean up the
      // side-map. Its win/loss is ALREADY counted above like any other
      // trade; this is bookkeeping only, not a second pnl application.
      const positionId = event.deal.positionId ?? event.position?.positionId;
      for (const [symbolName, trackedId] of this.pyramidPositionIdBySymbol) {
        if (trackedId === positionId) {
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
      const symbolName = this.pyramidOrderSymbolByOrderId.get(event.order.orderId);
      if (symbolName) {
        this.pyramidOrderSymbolByOrderId.delete(event.order.orderId);
        const filled = store.strategyEngine.markPyramidOrderFilled(symbolName);
        const positionId = event.position?.positionId ?? event.deal?.positionId;
        if (filled && positionId != null) {
          this.pyramidPositionIdBySymbol.set(symbolName, positionId);
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
    if (event.order?.orderId != null && this.pendingEntryOrderByOrderId.has(event.order.orderId)) {
      const pending = this.pendingEntryOrderByOrderId.get(event.order.orderId);
      const unfilledTypes = new Set(['ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_REJECTED']);
      if (event.executionType === 'ORDER_FILLED' && !event.deal?.closePositionDetail) {
        this.pendingEntryOrderByOrderId.delete(event.order.orderId);
        // 2026-09-14: remember this REAL position (String() - see this
        // class's own openPositionInfoByPositionId comment for why) so the
        // eventual real close below can log a durable trade row from
        // confirmed broker data, not a simulated guess.
        const filledPositionId = event.position?.positionId ?? event.deal?.positionId;
        if (filledPositionId != null) {
          this.openPositionInfoByPositionId.set(String(filledPositionId), { ...pending, entryTime: Date.now() });
        }
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'filled', executionType: event.executionType });
        console.log(`[auto-execute] CONFIRMED FILLED: ${pending.symbolName} source=${pending.source} orderId=${event.order.orderId} - real position opened at the broker.`);
        this._notifyText(`✅ [${pending.source.toUpperCase()}] Ordre confirmé REMPLI sur ${pending.symbolName} - position réellement ouverte chez le courtier.`);
      } else if (unfilledTypes.has(event.executionType)) {
        this.pendingEntryOrderByOrderId.delete(event.order.orderId);
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'unfilled', executionType: event.executionType });
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
      fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
        console.warn('[ntfy] push failed', err.message)
      );
    }
  }

  /** Same push channel as _notify(), for a plain text message (pyramid auto-execution confirmations/warnings). */
  _notifyText(text) {
    if (!CONFIG.notifications.ntfyTopic) return;
    fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
      console.warn('[ntfy] push failed', err.message)
    );
  }
}
