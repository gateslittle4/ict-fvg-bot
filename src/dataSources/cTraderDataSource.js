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

import { CONFIG } from '../config.js';
import { getDefaultSpec, buildSpecFromBrokerSymbol } from '../engines/lotCalculator.js';

import { FIXED_EST_TO_UTC_OFFSET_MS } from '../backtest/nySession.js';

import { createSpreadAggregator, toSpreadRow, upsertSpreadRows } from './demoTrackingLog.js';

import { TickBarBuilder } from '../intradayMomentumEngine.js';

import { refreshKillSwitch } from '../killSwitch.js';
import { adjustMarketProtectionForSpread } from '../execution/marketProtection.js';

import { createTradeLogClient } from './supabaseTradeLog.js';

import { recordAlert } from '../alertHistory.js';

import { CHART_MARGIN_CANDLES, HOST, PORT, store, MAX_TRENDBARS_PER_REQUEST, planHistoryWindows, RELATIVE_PRICE_SCALE, relativeProtectionStep, toRelativeProtectionDistance, sendCommandWithTimeout, pickAccountOrThrow, foldLiveBidIntoCandle, sortDealsChronologically, parseBrokerMoney } from './ctrader/shared.js';
import { marketDataMethods } from './ctrader/marketData.js';
import { executionMethods } from './ctrader/execution.js';
import { reconciliationMethods } from './ctrader/reconciliation.js';
import { tradeHistoryMethods } from './ctrader/tradeHistory.js';
import { managedStrategiesMethods } from './ctrader/managedStrategies.js';

// Découpé en modules le 2026-09-24 (Esdras : « découpe le fichier en modules ») : ce fichier garde la connexion (démarrage, symboles,
// solde, notifications) ; le reste est dans src/dataSources/ctrader/. Réexports pour les imports existants :
// adjustMarketProtectionForSpread lives in src/execution/marketProtection.js (shared with the replay).
export { adjustMarketProtectionForSpread, CHART_MARGIN_CANDLES, MAX_TRENDBARS_PER_REQUEST, planHistoryWindows, RELATIVE_PRICE_SCALE, relativeProtectionStep, toRelativeProtectionDistance, sendCommandWithTimeout, pickAccountOrThrow, foldLiveBidIntoCandle, sortDealsChronologically, parseBrokerMoney };

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
    // 2026-09-24: filet de sécurité (src/killSwitch.js) - état recalculé depuis le journal réel au démarrage, puis après chaque clôture.
    refreshKillSwitch(this.tradeLogClient).then((ks) => {
      const stopped = Object.entries(ks.legs).filter(([, l]) => !l.allowed).map(([k]) => k);
      console.log(`[kill-switch] ${Object.keys(ks.legs).length} jambes suivies ; arrêtées : ${stopped.length ? stopped.join(', ') : 'aucune'}`);
    }).catch((err) => console.warn(`[kill-switch] démarrage : ${err.message}`));
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
    // 2026-09-22 (RSI(2)/US500 daily, real execution): symbol -> {positionId, volumeCents} for the ONE real position this process's daily
    // strategy currently holds, if any - see _handleAutoExecuteEntry's mutual-exclusion check and _feedDailyAlertEngines' exit handling.
    this.dailyPositionBySymbol = new Map();
    // 2026-09-24 (A/B intraday momentum, same account as the combo): live engine fed with M1 bars built from bid ticks, the builder, and a
    // B reversal waiting for its own close to be confirmed before re-entering (symbol -> { ev, until }).
    this.intradayMomentum = null;
    this.tickBars = new TickBarBuilder();
    this.pendingEntryAfterClose = new Map();
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
    // Mode alerte (2026-09-22, Esdras: "suis le en mode alerte" - la candidate RSI(2)/US500, data/research-memory.json
    // `prereg-batch3-results-2026-09-21`, t=2.23, JAMAIS adoptee en execution reelle). Entierement decouple de strategyEngine/openPositions/
    // guardrail/ordres : voir dailyAlertEngine.js. Best-effort comme les autres lectures de demarrage - une erreur ici ne doit jamais bloquer
    // le vrai trading.
    this._loadDailyAlertEngines().catch((err) =>
      console.warn('[cTrader] could not warm up daily alert engines (non-fatal, mode-alerte only):', err.message)
    );
    console.log('[cTrader] subscribing to live candles for', this.symbols.join(', '));
    await this._subscribeLiveCandles(accountId);
    this._startIntradayMomentum().catch((err) =>
      console.warn('[cTrader] A/B (momentum intraday) warm-up failed (non-fatal, the rest of the bot trades normally):', err.message)
    );

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
    if (this._momentumClock) clearInterval(this._momentumClock);
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

Object.assign(CTraderDataSource.prototype, marketDataMethods, executionMethods, reconciliationMethods, tradeHistoryMethods, managedStrategiesMethods);
