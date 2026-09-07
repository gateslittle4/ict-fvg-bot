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
import { store, pushSignalEvents, setBalance, isAutoExecuteActive } from '../store.js';
import { CONFIG } from '../config.js';
import { calculateLotSize, getDefaultSpec } from '../engines/lotCalculator.js';

const HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com'; // use live.ctraderapi.com for a real (non-demo) account
const PORT = 5035;

// cTrader trendbar period enum name for our configured timeframe.
const PERIOD_BY_TIMEFRAME = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1' };

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

export class CTraderDataSource {
  constructor() {
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
    // balance is typically returned in the account's smallest unit (cents);
    // divide by 100 - VERIFY this against the real response the first time.
    const rawBalance = res.trader?.balance;
    if (typeof rawBalance === 'number') {
      setBalance(rawBalance / 100);
    }
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

  async _subscribeLiveCandles(accountId) {
    const period = PERIOD_BY_TIMEFRAME[CONFIG.timeframe] || 'M15';

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
      console.log(`[cTrader] ${symbolName}: received ${(history.trendbar || []).length} warm-up candles, replaying...`);
      const sortedBars = (history.trendbar || []).sort((a, b) => a.utcTimestampInMinutes - b.utcTimestampInMinutes);
      // ingestCandle() rebuilds the whole filtered engine from scratch on every
      // call (see liveStrategyEngine.js's "rebuild-and-replay" header comment) -
      // O(n) per candle, so O(n^2) to replay this whole warm-up window, measured
      // at several minutes for ~8640 candles on a modest CPU. Run synchronously
      // for that long and Node's event loop never gets a turn - in particular the
      // heartbeat setInterval above never fires, cTrader silently drops the
      // session for inactivity, and the FIRST request sent afterwards (spot
      // subscribe or live-trendbar subscribe, observed both ways live) times out
      // with no response. Yielding every YIELD_EVERY candles costs nothing
      // measurable but lets pending timers/socket reads run, so the heartbeat
      // keeps firing and the session stays alive through the whole replay.
      const YIELD_EVERY = 200;
      for (let i = 0; i < sortedBars.length; i++) {
        const candle = this._trendbarToCandle(sortedBars[i]);
        const events = store.strategyEngine.ingestCandle(symbolName, candle);
        pushSignalEvents(events);
        store.lastCandleBySymbol.set(symbolName, candle);
        // Deliberately no notify/trade-open side effects during warm-up replay -
        // these are historical bars, not a live tick; only the LATEST state matters
        // once warm-up is done (any position LiveStrategyEngine "opened" mid-replay
        // reflects real, already-past price action and is left as accurate context).
        if (i % YIELD_EVERY === YIELD_EVERY - 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

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
        if (event.symbolId !== symbolId || !event.trendbar) return;
        for (const bar of event.trendbar) {
          const candle = this._trendbarToCandle(bar);
          const events = store.strategyEngine.ingestCandle(symbolName, candle);
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
        }
      });
    }
  }

  _trendbarToCandle(bar) {
    // Trendbars encode OHLC as deltas from `low` in relative price units;
    // exact scaling depends on symbol digits - VERIFY against a real response.
    const low = bar.low / 100000;
    return {
      time: bar.utcTimestampInMinutes * 60 * 1000,
      open: low + bar.deltaOpen / 100000,
      high: low + bar.deltaHigh / 100000,
      low,
      close: low + bar.deltaClose / 100000,
    };
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
   * (see liveStrategyEngine.js _detectFvgSignal/_detectDivergenceSignal):
   *   - FVG: entryPrice is the gap's own edge, a level price has ALREADY
   *     touched by the time 'validated' fires this candle - a LIMIT order
   *     there is the faithful automation of "place a limit at this level
   *     and see if it fills again", not a chase at a worse price. Given a
   *     short expiration so a stale unfilled limit doesn't linger forever
   *     if price never returns (same outcome as a human who never got
   *     filled - not a new gap, see the "believed netting" caveat above).
   *   - Divergence: entryPrice IS candle.open of the very candle whose spot
   *     event we're processing right now - a MARKET order is the direct
   *     equivalent, not an approximation.
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
        label: `auto-entry-${symbolName}`,
        expirationTimestamp,
      });
      if (brokerOrderId != null) {
        this._notifyText(
          `🤖 Mode indisponible : entrée auto envoyée sur ${symbolName} (${signal.suggestedSide.toUpperCase()}, entrée ${signal.entryPrice}, stop ${signal.stopPrice}, cible ${signal.targetPrice}, ${sizing.lots} lots)`
        );
      }
    } catch (err) {
      console.warn(`[auto-execute] failed to submit entry for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ Mode indisponible : échec de l'envoi de l'entrée sur ${symbolName} (${err.message}) - à vérifier manuellement`);
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

  _notify(events) {
    if (!CONFIG.notifications.ntfyTopic) return;
    for (const e of events) {
      if (e.type !== 'validated') continue;
      // Divergence-sourced signals have no `zone` (that's an FVG-only concept) - describe generically.
      const range = e.zone ? ` (${e.zone.bottom.toFixed(2)}-${e.zone.top.toFixed(2)})` : '';
      const label = e.source === 'divergence' ? 'divergence' : 'FVG rempli';
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
