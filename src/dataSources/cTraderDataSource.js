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
import { store, pushSignalEvents, setBalance, setBrokerInfo, isAutoExecuteActive } from '../store.js';
import { CONFIG } from '../config.js';
import { calculateLotSize, getDefaultSpec } from '../engines/lotCalculator.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../backtest/nySession.js';
import { pairDealsIntoTrades } from './dealPairing.js';
import { reconcileAccount, estimateEquity } from './accountReconciliation.js';
import { createTradeLogClient, logClosedTrade } from './supabaseTradeLog.js';

const HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com'; // use live.ctraderapi.com for a real (non-demo) account
const PORT = 5035;

// cTrader trendbar period enum name for our configured timeframe.
const PERIOD_BY_TIMEFRAME = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1' };
const MAX_SPREAD_SAMPLES = 500; // ring buffer size for store.recentTicksBySymbol - a few hours of ticks, plenty for a spread sanity check

// @reiryoku/ctrader-layer's sendCommand() has NO built-in timeout - its promise
// only settles when a response with a matching clientMsgId arrives, so a
// request the server never answers (rate limit, oversized response, an
// unexpected field) hangs start() forever with zero error and zero log line -
// confirmed live on the first real deploy (boot stalled silently right after
// account auth). Every boot-time request is wrapped in this so a stuck call
// fails loud instead of hanging the whole connection indefinitely.
const CTRADER_REQUEST_TIMEOUT_MS = 20000;

async function sendCommandWithTimeout(connection, payloadName, data, timeoutMs = CTRADER_REQUEST_TIMEOUT_MS) {
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

export class CTraderDataSource {
  constructor() {
    this.connection = null;
    this.symbolIdByName = new Map();
    this.symbolNameById = new Map();
    this._loggedSpotShapeFor = new Set(); // diagnostic-only, see the ProtoOASpotEvent handler's own comment
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
    // are set. openTradesById pairs a 'closed' event back to the 'validated'
    // event that opened it (same pairing recentPerformanceReport.js already
    // does for its own in-memory replay) so the logged row has an
    // entryTime/rrMultiple to work with - 'closed' events alone don't carry
    // either (see liveStrategyEngine.js's _resolveOpenPosition()).
    this.tradeLogClient = createTradeLogClient();
    this.openTradesById = new Map();
  }

  async start() {
    const { clientId, clientSecret, accessToken } = CONFIG.broker;
    let accountId = CONFIG.broker.accountId;
    if (!clientId || !clientSecret || !accessToken) {
      throw new Error('CTraderDataSource.start() called without full broker credentials in CONFIG.broker');
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
    console.log('[cTrader] loading last 24h of closed deals...');
    await this._loadClosedDeals(accountId);
    console.log('[cTrader] subscribing to live candles for', CONFIG.symbols.join(', '));
    await this._subscribeLiveCandles(accountId);

    this.connection.on('ProtoOAExecutionEvent', (event) => this._handleExecutionEvent(event));

    store.mode = 'live';
    console.log('[cTrader] connected and live for account', accountId);
  }

  async stop() {
    if (this._heartbeat) clearInterval(this._heartbeat);
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
      setBalance(rawBalance / 10 ** moneyDigits);
    }
    // Bug fix (2026-09): the dashboard banner used to hard-code "FundingPips"
    // no matter which broker/environment the connected account actually
    // belongs to. brokerName is the broker's own whitelabel name for the
    // account (ProtoOATrader.brokerName) - may be absent depending on the
    // broker, in which case the dashboard falls back to a generic label
    // rather than showing a name we don't actually know. isDemo is derived
    // from which cTrader host this process connected to (HOST above), not
    // guessed from account data.
    setBrokerInfo({ name: res.trader?.brokerName || null, isDemo: HOST.includes('demo') });
  }

  async _loadClosedDeals(accountId) {
    const to = Date.now();
    const from = to - 24 * 3600 * 1000; // last 24h is enough to seed today's guardrail state
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOADealListReq', {
      ctidTraderAccountId: Number(accountId),
      fromTimestamp: from,
      toTimestamp: to,
    });
    for (const deal of res.deal || []) {
      if (deal.closePositionDetail) {
        const pnl = deal.closePositionDetail.grossProfit / 100; // VERIFY units against real response
        store.guardrail.recordTrade({ pnl, time: deal.executionTimestamp });
      }
    }
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
    const trades = pairDealsIntoTrades(res.deal || []).slice(0, maxTrades);

    const period = PERIOD_BY_TIMEFRAME[CONFIG.timeframe] || 'M15';
    const CHART_MARGIN_MS = 12 * 15 * 60 * 1000; // ~3h of M15 padding on each side, for visual context around the trade

    const enriched = [];
    for (const trade of trades) {
      const symbolName = this.symbolNameById.get(trade.symbolId) || `#${trade.symbolId}`;
      let candles = [];
      try {
        const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp: trade.entryTime - CHART_MARGIN_MS,
          toTimestamp: trade.exitTime + CHART_MARGIN_MS,
          symbolId: trade.symbolId,
          period,
        });
        candles = (history.trendbar || [])
          .map((bar) => this._trendbarToCandle(bar))
          .sort((a, b) => a.time - b.time);
      } catch (err) {
        console.warn(
          `[cTrader] trade history: failed to fetch chart candles for ${symbolName} position ${trade.positionId}:`,
          err.message
        );
      }
      enriched.push({ ...trade, symbol: symbolName, candles });
    }
    return enriched;
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
    const accountId = this.accountId;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(accountId),
    });

    const currentPriceBySymbol = {};
    for (const [symbol, candle] of store.lastCandleBySymbol) {
      currentPriceBySymbol[symbol] = candle.close;
    }
    const believedOpenBySymbol = {};
    for (const symbol of CONFIG.symbols) {
      believedOpenBySymbol[symbol] = Boolean(store.strategyEngine.getOpenPosition(symbol));
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
    const period = PERIOD_BY_TIMEFRAME[CONFIG.timeframe] || 'M15';

    // DIAGNOSTIC, temporary (2026-09-09): registered ONCE, unconditionally,
    // before the per-symbol loop below (which registers its own filtered
    // 'ProtoOASpotEvent' listener 3 times, once per symbol - not new, not
    // touched here). This one exists purely to answer a yes/no question
    // with zero ambiguity: does 'ProtoOASpotEvent' fire AT ALL on this
    // connection, regardless of symbolId matching? If this line never logs
    // either, the problem is upstream of anything in this file (event name,
    // subscription itself, or the connection/library layer) - not the
    // symbolId comparison fixed just above. Remove once confirmed.
    let loggedAnySpotEvent = false;
    this.connection.on('ProtoOASpotEvent', (event) => {
      if (loggedAnySpotEvent) return;
      loggedAnySpotEvent = true;
      console.log('[diagnostic] first ProtoOASpotEvent on this connection, UNFILTERED:', JSON.stringify(event, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
    });

    for (const symbolName of CONFIG.symbols) {
      const symbolId = this.symbolIdByName.get(symbolName);
      if (!symbolId) {
        console.warn(`[cTrader] symbol "${symbolName}" not found on this account - skipping`);
        continue;
      }

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
      const WARMUP_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days
      const WARMUP_M15_CANDLES = 90 * 24 * 4; // ~90 days, used as a response-size cap
      const toTimestamp = Date.now();
      const fromTimestamp = toTimestamp - WARMUP_MS;
      console.log(`[cTrader] ${symbolName}: requesting ${WARMUP_M15_CANDLES} ${period} candles of warm-up history...`);
      const history = await sendCommandWithTimeout(
        this.connection,
        'ProtoOAGetTrendbarsReq',
        {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp,
          toTimestamp,
          symbolId,
          period,
          count: WARMUP_M15_CANDLES,
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

      this.connection.on('ProtoOASpotEvent', (event) => {
        // 2026-09-09 fix: was `event.symbolId !== symbolId` (strict
        // inequality). protobuf int64 fields are sometimes decoded as
        // BigInt rather than Number depending on the specific field/library
        // path - `1n !== 1` is ALWAYS true (different types), so if
        // ProtoOASpotEvent.symbolId ever arrives as a BigInt while the
        // `symbolId` captured from ProtoOASymbolsListReq's response is a
        // plain Number (or vice versa), this guard silently rejected EVERY
        // single spot event for EVERY symbol - no crash, no error, just
        // nothing past this line ever running. This is the leading
        // suspect for the spread-check endpoint's "zero samples after 10+
        // minutes of a stable connection" symptom (see the diagnostic log
        // below, added the same day to confirm one way or the other).
        // Number() is safe for both BigInt and Number here: cTrader symbol
        // ids are small, well within Number.MAX_SAFE_INTEGER.
        if (Number(event.symbolId) !== Number(symbolId)) return;

        // DIAGNOSTIC, temporary (2026-09-09): the spread-check endpoint
        // reported zero samples after 10+ minutes of a stable connection -
        // real market hours, no errors, same instance the whole time. Log
        // the first event per symbol (BigInt-safe replacer, since a plain
        // JSON.stringify throws on any BigInt field and would otherwise
        // fail SILENTLY here - an uncaught exception inside an EventEmitter
        // listener has no visible effect on this process, it just never
        // finishes running) so the actual field names/types are known
        // instead of assumed. Remove once confirmed either way.
        if (!this._loggedSpotShapeFor.has(symbolName)) {
          this._loggedSpotShapeFor.add(symbolName);
          try {
            const safe = JSON.stringify(event, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value));
            console.log(`[diagnostic] ${symbolName} first ProtoOASpotEvent shape:`, safe);
          } catch (err) {
            console.log(`[diagnostic] ${symbolName} failed to stringify ProtoOASpotEvent:`, err.message, '- raw keys:', Object.keys(event));
          }
        }

        // Signal detection is driven by full candle BARS (the trendbar
        // payload, present only on some spot events).
        if (event.trendbar) {
          for (const bar of event.trendbar) {
            const candle = this._trendbarToCandle(bar);
            const events = store.strategyEngine.ingestCandle(symbolName, this._toEngineCandle(candle));
            pushSignalEvents(events);
            store.lastCandleBySymbol.set(symbolName, candle);
            const actionable = events.filter((e) => e.type === 'validated' && !e.blockedReason);
            if (actionable.length > 0) this._notify(actionable);
            if (actionable.length > 0 && isAutoExecuteActive()) {
              for (const sig of actionable) this._handleAutoExecuteEntry(symbolName, symbolId, sig);
            }

            for (const e of events) {
              if (e.type === 'pyramid-order-requested') this._handlePyramidOrderRequested(symbolName, symbolId, e);
              if (e.type === 'pyramid-order-cancel-requested') this._handlePyramidOrderCancelRequested(symbolName, e);
            }

            this._logTradeOutcomes(events);
          }
        }

        // LIVE PRICE: bid/ask arrive on EVERY tick, far more often than a
        // trendbar update. Fold the freshest bid into the displayed last
        // candle so the chart/dashboard price is genuinely live between
        // trendbar updates instead of frozen (see foldLiveBidIntoCandle).
        // Same /100000 scaling as _trendbarToCandle - VERIFY against a real
        // spot event's bid units before trusting the magnitude (display-only,
        // so a scaling error is cosmetic, never a wrong order).
        const bid = typeof event.bid === 'number' ? event.bid / 100000 : null;
        const existing = store.lastCandleBySymbol.get(symbolName);
        const folded = foldLiveBidIntoCandle(existing, bid);
        if (folded && folded !== existing) store.lastCandleBySymbol.set(symbolName, folded);

        // Real-spread sampling (2026-09, at the user's request: "est-ce que
        // le spread est celui qu'on avait planifié?" - see store.js's
        // recentTicksBySymbol comment). Same /100000 scaling assumption as
        // bid above (VERIFY against a real response, same caveat). Only
        // recorded when the SAME tick carries both sides - a tick with just
        // one side updated doesn't represent a real spread at that instant.
        const ask = typeof event.ask === 'number' ? event.ask / 100000 : null;
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
    try {
      const spec = getDefaultSpec(symbolName);
      if (!spec) {
        console.warn(`[pyramid] no symbol spec for ${symbolName} - skipping add-on order`);
        return;
      }
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: CONFIG.risk.riskPctPerTrade,
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
  async _submitOrder({ symbolId, orderType, tradeSide, lots, symbolSpec, price, stopLoss, takeProfit, label, expirationTimestamp }) {
    const accountId = Number(this.accountId);
    const lotSize = symbolSpec.lotSize || 100000; // VERIFY: fall back is a forex-standard-lot guess, not confirmed for indices/metals here
    const volume = Math.round(lots * lotSize * 100); // VERIFY units against a real response before going live
    const payload = { ctidTraderAccountId: accountId, symbolId, orderType, tradeSide, volume, stopLoss, takeProfit, label };
    if (orderType === 'STOP') payload.stopPrice = price;
    if (orderType === 'LIMIT') payload.limitPrice = price;
    if (expirationTimestamp) {
      payload.expirationTimestamp = expirationTimestamp;
      payload.timeInForce = 'GOOD_TILL_DATE'; // VERIFY exact enum name against a real API response
    }
    const res = await this.connection.sendCommand('ProtoOANewOrderReq', payload);
    return res?.order?.orderId ?? res?.orderId ?? null; // VERIFY response shape against real API
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
    try {
      const spec = getDefaultSpec(symbolName);
      if (!spec) {
        console.warn(`[auto-execute] no symbol spec for ${symbolName} - skipping entry`);
        return;
      }
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: CONFIG.risk.riskPctPerTrade,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        symbolSpec: spec,
      });
      const isFvg = signal.source === 'fvg';
      const FVG_LIMIT_EXPIRY_CANDLES = 4; // ~1h of M15 - VERIFY this window is sensible once live
      const lastCandle = store.lastCandleBySymbol.get(symbolName);
      const expirationTimestamp =
        isFvg && lastCandle ? lastCandle.time + FVG_LIMIT_EXPIRY_CANDLES * 15 * 60 * 1000 : undefined;

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
      if (brokerOrderId != null) {
        this._notifyText(
          `🤖 [${signal.source.toUpperCase()}] Entrée auto envoyée sur ${symbolName} (${signal.suggestedSide.toUpperCase()}, entrée ${signal.entryPrice}, stop ${signal.stopPrice}, cible ${signal.targetPrice}, ${sizing.lots} lots)`
        );
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
    // A position closed on the broker side -> feed it into the guardrail engine
    // as ground truth (real trade, not a demo simulation).
    if (event.executionType === 'ORDER_FILLED' && event.deal?.closePositionDetail) {
      const pnl = event.deal.closePositionDetail.grossProfit / 100;
      setBalance(store.balance + pnl);
      store.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: store.balance });

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
  }

  // Pairs each 'closed' event back to the 'validated' event that opened it
  // (same id, matching recentPerformanceReport.js's own openById pairing)
  // and persists the outcome via supabaseTradeLog.js. A no-op when
  // tradeLogClient is null (SUPABASE_URL/SUPABASE_SERVICE_KEY unset) -
  // logClosedTrade() already checks that, but skipping the pairing work
  // entirely when it can't go anywhere avoids growing openTradesById for no
  // reason on a bot that never configured persistence.
  _logTradeOutcomes(events) {
    if (!this.tradeLogClient) return;
    for (const e of events) {
      if (e.type === 'validated' && !e.blockedReason) {
        this.openTradesById.set(e.id, e);
      }
      if (e.type === 'closed') {
        const opened = this.openTradesById.get(e.id);
        if (!opened) continue; // opened before this process started tracking (e.g. right after a restart) - no real entryTime to log, same "exclude rather than guess" call recentPerformanceReport.js makes
        this.openTradesById.delete(e.id);
        const rMultiple = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
        logClosedTrade(this.tradeLogClient, {
          symbol: e.symbol,
          source: e.source,
          direction: e.direction,
          outcome: e.outcome,
          rMultiple,
          entryPrice: opened.entryPrice,
          entryTime: opened.validatedAt,
          exitTime: e.exitTime,
        });
      }
    }
  }

  _notify(events) {
    if (!CONFIG.notifications.ntfyTopic) return;
    for (const e of events) {
      if (e.type !== 'validated') continue;
      // Divergence/NWOG signals have no `zone` (that's an FVG-only concept) - describe generically.
      const range = e.zone ? ` (${e.zone.bottom.toFixed(2)}-${e.zone.top.toFixed(2)})` : '';
      const label = e.source === 'divergence' ? 'divergence' : e.source === 'nwog' ? 'NWOG (gap week-end)' : 'FVG rempli';
      const text = `${e.suggestedSide.toUpperCase()} ${e.symbol} — ${label}${range}`;
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
