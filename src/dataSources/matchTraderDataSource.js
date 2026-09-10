// matchTraderDataSource.js
// Live data source backed by the Match-Trader "Platform API" (trader-facing
// REST API, docs: https://docs.match-trade.com/docs/match-trader-api-documentation/
// PDF: https://docs.match-trade.com/wp-content/uploads/2024/05/MTR-Match-TraderPlatformAPI.pdf).
// Written to replace cTraderDataSource.js after the 2026-09-07 decision to
// abandon cTrader (see HANDOFF.md "Prochaines étapes" #1): no third-party app
// approval to wait for here - auth is direct email/password/brokerId, like
// logging into the Match-Trader web app itself.
//
// !!! STATUS: WRITTEN AGAINST DOCUMENTATION, NOT YET TESTED LIVE !!!
// Same discipline as cTraderDataSource.js was written under (see that file's
// header for the general pattern) - this is even LESS proven, for three
// reasons specific to Match-Trader's documented API surface:
//
// 1. NO HISTORICAL-CANDLE ENDPOINT EXISTS. The Platform API documents
//    "Market Watch" (a live quotations SNAPSHOT: bid/ask/high/low as of now)
//    but nothing resembling cTrader's ProtoOAGetTrendbarsReq. There is also
//    no live-push candle stream - polling is the only documented option
//    (docs/MATCHTRADER_SETUP.md #6 already flagged this). Consequence: this
//    module can only BUILD M15 candles forward from the moment it starts
//    polling (see M15CandleBuilder below) - it cannot backfill the ~90 days
//    of M15 history the filtered-FVG combo's slowest lookback (H4/EMA200)
//    needs to produce a meaningful bias reading. Checked 2026-09-07: this
//    project's own data/backtest-input/*.csv end 2025-12-31, ~8-9 months
//    before "now" - too stale a gap to splice onto live candles without
//    silently corrupting every rolling indicator across the gap, so this
//    file does NOT attempt CSV-seeded warmup. `start()` begins with an
//    EMPTY history and accepts that the combo's filters (H4/EMA200 bias,
//    Divergence's 100-bar z-score lookback, etc.) will read as
//    "insufficient data"/neutral for a real warm-up period after first
//    connecting - LiveStrategyEngine's own lookback guards already handle
//    "not enough history yet" safely (see fvgEngine.js/htfBias.js null-bias
//    handling), so this is a "no signals for a while" problem, not a
//    correctness bug. The most promising fix (not implemented here, flagged
//    for a future session): use cTrader ONLY as a read-only market-data
//    source (once/if the pending Open API app is approved, or even an
//    unrelated free demo account - reading public trendbars needs no
//    FundingPips-specific access) to backfill+keep this file's `ingestCandle`
//    stream warm, while Match-Trader handles order execution only. Until
//    then, budget for a real multi-week "silent" period after switching.
//
// 2. NO "Get Symbols"/CONTRACT-SPEC ENDPOINT DOCUMENTED. Unlike cTrader
//    (ProtoOASymbolsListReq gives lotSize/digits per symbol), nothing in the
//    Platform API docs lists tradable-instrument specs. `lotCalculator.js`'s
//    DEFAULT_SYMBOL_SPECS (already `verified:false`) stays the ONLY source
//    of lot-size/volume-step truth here too - still needs manual
//    confirmation against FundingPips' published contract specs before
//    trusting any lot size this file computes.
//
// 3. THE EXACT RESPONSE SHAPE OF `position/open`/`pending-order/create` IS
//    NOT CONFIRMED TO INCLUDE A USABLE ORDER/POSITION ID (the one example
//    in the docs PDF only shows {status, nativeCode, errorMessage}). To
//    correlate "the order I just placed" with a broker-side id (needed to
//    cancel a pyramid add-on, or attribute a fill), this file falls back to
//    polling GET .../active-orders and GET .../open-positions immediately
//    after submission and matching by (instrument, side, ~volume, recency) -
//    a best-effort heuristic, NOT a guaranteed-unique match. It will
//    misattribute if Esdras ALSO manually places a pending order on the same
//    instrument/side while the bot has an order in flight - acceptable for
//    now (pyramid/auto-execute are both off by default, opt-in, and scoped -
//    see config.js) but a real limitation to know about, worse than
//    cTrader's `label` field (Match-Trader's documented order bodies have no
//    comment/label field at all).
//
// Also unconfirmed and flagged inline below: the exact base URL split
// between `/manager/...` (login/refresh) and `/mtr-api/{systemUuid}/...`
// (everything else) - assumed to share MATCHTRADER_PLATFORM_URL as origin;
// what `systemUuid` actually is (assumed to be supplied alongside brokerId
// by FundingPips support, see docs/MATCHTRADER_SETUP.md); whether
// `/last-finance` actually surfaces realized trade P&L (its one documented
// example only shows a DEPOSIT-type ledger entry) or only cash movements -
// if it doesn't, guardrail warm-up on boot will simply start from "no
// trades today" instead of true history, same graceful degradation as an
// empty response would already produce.

import { store, pushSignalEvents, setBalance, isAutoExecuteActive } from '../store.js';
import { CONFIG } from '../config.js';
import { calculateLotSize, getDefaultSpec } from '../engines/lotCalculator.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../backtest/nySession.js';

const M15_MS = 15 * 60 * 1000;

// No live push documented (see file header, point 1) - poll quotations on a
// short interval instead. 15s is a guess balancing "M15 candle forms with
// reasonable OHLC fidelity" against "don't hammer the API" - VERIFY there's
// no documented rate limit before trusting this in production.
const POLL_QUOTES_MS = 15 * 1000;
// Detect fills/closes by diffing open-positions/active-orders snapshots -
// slower than the quote poll since a position/order changing state is a
// rarer event than a new price tick.
const POLL_POSITIONS_MS = 20 * 1000;
// The documented co-auth cookie lives 3600s (docs/PDF, see file header) -
// refresh well before that so a slow request never lands just past expiry.
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;
// How long to keep trying to match a just-placed order/position against a
// poll snapshot before giving up and logging an "unattributed" warning
// (see point 3 above) - a handful of poll cycles at POLL_POSITIONS_MS.
const ATTRIBUTION_TIMEOUT_MS = 90 * 1000;

// Match-Trader's exact instrument naming is NOT confirmed (docs/MATCHTRADER_SETUP.md
// #6) - identity map for now, override an entry here once the first real
// quotations call confirms the real name differs (e.g. "US100.cash").
const SYMBOL_MAP = { US100: 'US100', US500: 'US500', XAUUSD: 'XAUUSD', EURUSD: 'EURUSD', GBPUSD: 'GBPUSD' };

/**
 * Pure, no-network M15 candle builder from a stream of {time, bid, ask}
 * quote samples. Exists because the Match-Trader Platform API documents no
 * historical-candle or live-candle-push endpoint (see file header) - only a
 * live quotations snapshot polled on an interval. Aggregates the MID price
 * ((bid+ask)/2) of every sample landing in the same fixed-width UTC M15
 * bucket (floor(time / M15_MS) * M15_MS - plain wall-clock buckets, not the
 * NY-session-shifted convention used for backtesting elsewhere in this repo,
 * since there's no session-open anchoring need for a live tick aggregator).
 *
 * addSample() returns a newly CLOSED candle only once a sample from a LATER
 * bucket arrives - the still-forming current bucket is never returned, so a
 * caller can never observe a mid-candle read (same no-lookahead discipline
 * this project applies everywhere else, just enforced by construction here
 * instead of by a backtest-engine rule).
 */
export class M15CandleBuilder {
  constructor() {
    this.current = null; // { bucketStart, open, high, low, close }
  }

  /**
   * @param {{time:number, bid:number, ask:number}} sample
   * @returns {{time:number, open:number, high:number, low:number, close:number}|null}
   */
  addSample({ time, bid, ask }) {
    if (typeof bid !== 'number' || typeof ask !== 'number' || !Number.isFinite(time)) return null;
    const mid = (bid + ask) / 2;
    const bucketStart = Math.floor(time / M15_MS) * M15_MS;

    if (!this.current) {
      this.current = { bucketStart, open: mid, high: mid, low: mid, close: mid };
      return null;
    }

    if (bucketStart === this.current.bucketStart) {
      this.current.high = Math.max(this.current.high, mid);
      this.current.low = Math.min(this.current.low, mid);
      this.current.close = mid;
      return null;
    }

    if (bucketStart < this.current.bucketStart) {
      // Out-of-order sample (clock skew / retried request) - drop it rather
      // than corrupt the bucket already in progress.
      return null;
    }

    // A later bucket started: the one we were building is now closed.
    const { bucketStart: closedTime, ...ohlc } = this.current;
    const closedCandle = { time: closedTime, ...ohlc };
    this.current = { bucketStart, open: mid, high: mid, low: mid, close: mid };
    return closedCandle;
  }
}

/** Minimal manual cookie jar - Node's fetch does not persist Set-Cookie across calls. */
function parseCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const part of parts) {
    const match = part.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

export class MatchTraderDataSource {
  constructor() {
    this.baseUrl = null; // platformUrl, no trailing slash
    this.systemUuid = null;
    this.coAuthToken = null; // cookie: co-auth
    this.refreshToken = null; // cookie: rt
    this.tradingApiToken = null; // header: Auth-trading-api
    this.tradingAccountId = null;

    this.candleBuilders = new Map(); // symbol -> M15CandleBuilder
    this.knownOpenPositions = new Map(); // matchTraderSymbol -> last-seen position snapshot
    this.knownActiveOrders = new Map(); // orderId -> { instrument, side, placedAt }
    this.pendingAttribution = new Map(); // ourRequestId -> { symbol, side, volume, kind, resolve, timeoutAt }

    this.pyramidOrderSymbolByOrderId = new Map();
    this.pyramidPositionKeyBySymbol = new Map(); // symbol -> a best-effort position identity (see file header point 3)

    // How many ms to ADD to an engine-held candle time to recover a genuine
    // UTC instant. Mirrors cTraderDataSource.js exactly: M15CandleBuilder
    // produces genuine-UTC candles, but the shared filtered-engine pipeline
    // (SessionFilteredFvgEngine -> nySession.js) was validated against
    // HistData's FIXED EST-as-UTC convention (candle .time is 5h BEHIND true
    // UTC). So the copy handed to the strategy engine is shifted by
    // -FIXED_EST_TO_UTC_OFFSET_MS (see _toEngineCandle), and anything
    // DISPLAYING the engine's retained candles (/api/candles, /api/overlays)
    // adds this back. WITHOUT this shift the NY session windows (Silver
    // Bullet 10-11h, London-NY overlap 7-10h) were evaluated 5h off on the
    // live Match-Trader path - the identical bug found+fixed on the cTrader
    // path 2026-09-08 but never ported here, even though Match-Trader is the
    // ACTIVE broker (see config.js).
    this.candleTimeOffsetMs = FIXED_EST_TO_UTC_OFFSET_MS;
  }

  // See candleTimeOffsetMs above and cTraderDataSource.js's _toEngineCandle()
  // for the full rationale. Shifts ONLY the copy fed to the strategy engine
  // into the backtest's fixed-EST-as-UTC convention; the original genuine-UTC
  // candle stays what's stored in store.lastCandleBySymbol (display) and used
  // for any real broker timestamp. 5h is an exact multiple of the M15 bucket
  // width, so this only relabels bars - it never shifts an M15 boundary.
  _toEngineCandle(candle) {
    return { ...candle, time: candle.time - FIXED_EST_TO_UTC_OFFSET_MS };
  }

  async start() {
    const cfg = CONFIG.broker.matchTrader;
    if (!cfg || !cfg.email || !cfg.password || !cfg.brokerId || !cfg.platformUrl) {
      throw new Error('MatchTraderDataSource.start() called without full credentials in CONFIG.broker.matchTrader');
    }
    this.baseUrl = cfg.platformUrl.replace(/\/$/, '');
    this.systemUuid = cfg.systemUuid || cfg.brokerId; // VERIFY: assumed same value unless support says otherwise - see file header

    await this._login(cfg);

    this._refreshTimer = setInterval(() => this._refreshAuth().catch((err) => {
      console.error('[matchtrader] token refresh failed:', err.message);
    }), 3600 * 1000 - TOKEN_REFRESH_MARGIN_MS);

    await this._fetchBalance();
    await this._seedGuardrailFromLedger();

    for (const symbol of CONFIG.symbols) this.candleBuilders.set(symbol, new M15CandleBuilder());

    this._quotePoll = setInterval(() => this._pollQuotes().catch((err) => {
      console.error('[matchtrader] quote poll failed:', err.message);
    }), POLL_QUOTES_MS);
    this._positionPoll = setInterval(() => this._pollPositionsAndOrders().catch((err) => {
      console.error('[matchtrader] position/order poll failed:', err.message);
    }), POLL_POSITIONS_MS);

    store.mode = 'live';
    console.log('[matchtrader] connected and live, account', this.tradingAccountId);
  }

  async stop() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (this._quotePoll) clearInterval(this._quotePoll);
    if (this._positionPoll) clearInterval(this._positionPoll);
    store.mode = 'demo';
  }

  // ---- auth ----

  async _login({ email, password, brokerId }) {
    const res = await fetch(`${this.baseUrl}/manager/co-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, brokerId }),
    });
    if (!res.ok) throw new Error(`Match-Trader login failed: HTTP ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    this.coAuthToken = parseCookie(setCookie, 'co-auth');
    this.refreshToken = parseCookie(setCookie, 'rt');
    const body = await res.json();
    this.coAuthToken = this.coAuthToken || body.token; // VERIFY: fall back to body field if the cookie isn't set as documented
    const accounts = body.accounts || [];
    const account = CONFIG.broker.matchTrader.accountId
      ? accounts.find((a) => String(a.tradingAccountId) === String(CONFIG.broker.matchTrader.accountId))
      : accounts[0];
    if (!account) throw new Error('Match-Trader login succeeded but no matching trading account in response.accounts');
    this.tradingApiToken = account.tradingApiToken;
    this.tradingAccountId = account.tradingAccountId;
  }

  async _refreshAuth() {
    const res = await fetch(`${this.baseUrl}/manager/refresh-token`, {
      method: 'POST',
      headers: { Cookie: `rt=${this.refreshToken}` },
    });
    if (!res.ok) throw new Error(`Match-Trader token refresh failed: HTTP ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    this.coAuthToken = parseCookie(setCookie, 'co-auth') || this.coAuthToken;
  }

  _authHeaders() {
    return {
      'Auth-trading-api': this.tradingApiToken,
      Cookie: `co-auth=${this.coAuthToken}`,
    };
  }

  async _apiFetch(pathAndQuery, { method = 'GET', body } = {}) {
    const res = await fetch(`${this.baseUrl}/mtr-api/${this.systemUuid}${pathAndQuery}`, {
      method,
      headers: { ...this._authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Match-Trader API ${method} ${pathAndQuery} -> HTTP ${res.status}`);
    return res.json();
  }

  // ---- market data (polling, see file header point 1) ----

  async _pollQuotes() {
    const symbols = CONFIG.symbols.map((s) => SYMBOL_MAP[s] || s);
    const data = await this._apiFetch(`/quotations?symbols=${symbols.join(',')}`);
    const quotes = Array.isArray(data) ? data : data.quotations || [];
    const now = Date.now();

    for (const symbol of CONFIG.symbols) {
      const mtSymbol = SYMBOL_MAP[symbol] || symbol;
      const quote = quotes.find((q) => q.symbol === mtSymbol);
      if (!quote) continue;

      const builder = this.candleBuilders.get(symbol);
      const closedCandle = builder.addSample({
        time: quote.timestampSec ? quote.timestampSec * 1000 : now,
        bid: quote.bid,
        ask: quote.ask,
      });

      // LIVE PRICE (fix 2026-09): expose the freshest price on EVERY poll,
      // including the still-forming M15 bucket, so the dashboard/chart show a
      // genuinely live price between M15 closes instead of freezing at the
      // last closed candle for up to 15 minutes. This is DISPLAY-ONLY state
      // (store.lastCandleBySymbol) and stays in genuine UTC - it is never fed
      // to the strategy engine, so no-lookahead is preserved (only CLOSED
      // candles below reach ingestCandle). builder.current is the bucket in
      // progress; after a close it's already the NEW bucket's first sample.
      const forming = builder.current;
      if (forming) {
        store.lastCandleBySymbol.set(symbol, {
          time: forming.bucketStart,
          open: forming.open,
          high: forming.high,
          low: forming.low,
          close: forming.close,
        });
      }

      if (!closedCandle) continue;

      // A bucket closed -> feed the ENGINE. _toEngineCandle shifts it into the
      // backtest's fixed-EST-as-UTC convention so the NY session filter reads
      // the correct wall-clock hour (see _toEngineCandle / candleTimeOffsetMs).
      const events = store.strategyEngine.ingestCandle(symbol, this._toEngineCandle(closedCandle));
      pushSignalEvents(events);

      const actionable = events.filter((e) => e.type === 'validated' && !e.blockedReason);
      if (actionable.length > 0) this._notify(actionable);
      if (actionable.length > 0 && isAutoExecuteActive()) {
        for (const sig of actionable) await this._handleAutoExecuteEntry(symbol, sig);
      }
      for (const e of events) {
        if (e.type === 'pyramid-order-requested') await this._handlePyramidOrderRequested(symbol, e);
        if (e.type === 'pyramid-order-cancel-requested') await this._handlePyramidOrderCancelRequested(symbol, e);
      }
    }
  }

  // ---- account state ----

  async _fetchBalance() {
    const data = await this._apiFetch('/balance');
    if (typeof data.balance === 'number') setBalance(data.balance);
  }

  /**
   * Best-effort guardrail warm-up from realized P&L history. UNVERIFIED
   * whether `/last-finance` actually includes trade P&L entries (the one
   * documented example is a DEPOSIT ledger row) - see file header point 3's
   * neighbor caveat. Filters defensively for entries that look like a trade
   * (`profit` present and a `type` not obviously a cash movement) rather
   * than assuming a specific `type` value; falls back to "no history seeded"
   * (same as a fresh boot) if the shape doesn't match, which is safe (the
   * guardrail just starts from zero for today) rather than throwing.
   */
  async _seedGuardrailFromLedger() {
    try {
      const to = Date.now();
      const from = to - 24 * 3600 * 1000;
      const data = await this._apiFetch('/last-finance', {
        method: 'POST',
        body: { types: ['TRADE'], resultSize: 200 }, // VERIFY 'TRADE' is a real `type` value against a real account
      });
      const entries = Array.isArray(data) ? data : data.operations || data.ledgers || [];
      for (const entry of entries) {
        if (typeof entry.profit !== 'number' || !entry.time) continue;
        if (entry.time < from || entry.time > to) continue;
        store.guardrail.recordTrade({ pnl: entry.profit, time: entry.time });
      }
    } catch (err) {
      console.warn('[matchtrader] guardrail history seed skipped (last-finance shape unconfirmed):', err.message);
    }
  }

  // ---- positions/orders polling (fill/close detection, see file header point 3) ----

  async _pollPositionsAndOrders() {
    const [positions, orders] = await Promise.all([
      this._apiFetch('/open-positions').catch(() => []),
      this._apiFetch('/active-orders').catch(() => []),
    ]);
    const positionList = Array.isArray(positions) ? positions : positions.positions || [];
    const orderList = Array.isArray(orders) ? orders : orders.orders || [];

    await this._detectClosedPositions(positionList);
    await this._detectFilledOrders(orderList, positionList);
    await this._fetchBalance(); // cheap, keeps store.balance/guardrail in sync between trades too
  }

  async _detectClosedPositions(currentPositions) {
    const currentByKey = new Map(currentPositions.map((p) => [this._positionKey(p), p]));
    for (const [key, prevSnapshot] of this.knownOpenPositions) {
      if (currentByKey.has(key)) continue; // still open
      // Vanished from open-positions -> closed. Realized pnl not directly
      // given here (no close-event payload without the closed-positions
      // websocket, see file header point 1's neighbor caveat) - approximate
      // with the position's last-known unrealized `profit` field, which is
      // exact if there was no slippage between the last poll and the actual
      // close and only approximate otherwise. Flagged, not silently assumed exact.
      const pnl = typeof prevSnapshot.profit === 'number' ? prevSnapshot.profit : 0;
      store.guardrail.recordTrade({ pnl, time: Date.now() });

      for (const [symbol, trackedKey] of this.pyramidPositionKeyBySymbol) {
        if (trackedKey === key) {
          this.pyramidPositionKeyBySymbol.delete(symbol);
          this._notifyText(`🔺 Pyramide auto : unité ajoutée sur ${symbol} clôturée (résultat approx. ${pnl >= 0 ? 'gagnant' : 'perdant'}, ${pnl.toFixed(2)}$ - dernière valeur connue, pas un événement de clôture exact)`);
          break;
        }
      }
    }
    this.knownOpenPositions = currentByKey;
  }

  async _detectFilledOrders(currentOrders, currentPositions) {
    const currentOrderIds = new Set(currentOrders.map((o) => o.id));
    for (const [orderId, tracked] of this.knownActiveOrders) {
      if (currentOrderIds.has(orderId)) continue; // still pending
      // Vanished from active-orders: either filled or cancelled/expired.
      // Match against open-positions by (instrument, side) as the best
      // available signal it became a real position (see file header point 3).
      const filledPosition = currentPositions.find(
        (p) => p.instrument === tracked.instrument && (p.side || p.orderSide) === tracked.side && !this.knownOpenPositions.has(this._positionKey(p))
      );
      if (filledPosition) {
        const symbol = tracked.symbol;
        if (this.pyramidOrderSymbolByOrderId.get(orderId) === symbol) {
          this.pyramidOrderSymbolByOrderId.delete(orderId);
          const filled = store.strategyEngine.markPyramidOrderFilled(symbol);
          if (filled) {
            this.pyramidPositionKeyBySymbol.set(symbol, this._positionKey(filledPosition));
            this._notifyText(`🔺 Pyramide auto : 2e unité REMPLIE sur ${symbol} (entrée ${filled.entryPrice}, stop ${filled.stopPrice}, cible ${filled.targetPrice})`);
          }
        }
      }
      this.knownActiveOrders.delete(orderId);
    }
    for (const o of currentOrders) {
      if (!this.knownActiveOrders.has(o.id)) {
        this.knownActiveOrders.set(o.id, { instrument: o.instrument, side: o.orderSide || o.side, symbol: this._symbolFromInstrument(o.instrument) });
      }
    }
  }

  _positionKey(p) {
    // No confirmed unique numeric id field in the docs (see file header
    // point 3) - build a best-effort composite key. Replace with `p.id` /
    // `p.positionId` once a real response confirms the field name.
    return p.id ?? p.positionId ?? `${p.instrument}:${p.side || p.orderSide}:${p.openPrice ?? p.openTime}`;
  }

  _symbolFromInstrument(instrument) {
    const entry = Object.entries(SYMBOL_MAP).find(([, mt]) => mt === instrument);
    return entry ? entry[0] : instrument;
  }

  // ---- order placement ----

  /**
   * @param {object} p
   * @param {string} p.symbol - our internal symbol name (mapped to the Match-Trader instrument name)
   * @param {'MARKET'|'LIMIT'|'STOP'} p.orderType
   * @param {'BUY'|'SELL'} p.side
   * @param {number} p.lots
   * @param {number} [p.price] - required for LIMIT/STOP, the order's own trigger price
   * @param {number} p.stopLoss
   * @param {number} p.takeProfit
   * @returns {Promise<{brokerOrderId: string|null}>}
   */
  async _submitOrder({ symbol, orderType, side, lots, price, stopLoss, takeProfit }) {
    const instrument = SYMBOL_MAP[symbol] || symbol;
    if (orderType === 'MARKET') {
      const result = await this._apiFetch('/position/open', {
        method: 'POST',
        body: { instrument, orderSide: side, volume: lots, slPrice: stopLoss, tpPrice: takeProfit, isMobile: false },
      });
      if (result.status && result.status !== 'OK') {
        throw new Error(`Match-Trader position/open rejected: ${result.status} ${result.errorMessage || ''}`);
      }
    } else {
      const result = await this._apiFetch('/pending-order/create', {
        method: 'POST',
        body: {
          instrument,
          orderSide: side,
          volume: lots,
          price,
          type: orderType, // 'LIMIT' | 'STOP'
          slPrice: stopLoss,
          tpPrice: takeProfit,
          isMobile: false,
        },
      });
      if (result.status && result.status !== 'OK') {
        throw new Error(`Match-Trader pending-order/create rejected: ${result.status} ${result.errorMessage || ''}`);
      }
    }
    // No order id in the documented response (see file header point 3) - the
    // caller (below) resolves it shortly after via _pollPositionsAndOrders's
    // active-orders snapshot instead of trusting a return value here.
    return { brokerOrderId: null };
  }

  async _cancelOrder(orderId, symbol, side) {
    const instrument = SYMBOL_MAP[symbol] || symbol;
    const tracked = this.knownActiveOrders.get(orderId);
    await this._apiFetch('/pending-order/cancel', {
      method: 'POST',
      body: { instrument, id: orderId, orderSide: side, type: tracked?.type || 'STOP', isMobile: false },
    });
  }

  /**
   * Resolves a just-placed order's broker id via a short poll loop against
   * /active-orders (see file header point 3 - the create response itself
   * carries no id). Matches the FRESHEST order for (instrument, side) not
   * already known before this call - a heuristic, not a guarantee.
   */
  async _resolveJustPlacedOrderId(symbol, side) {
    const instrument = SYMBOL_MAP[symbol] || symbol;
    const deadline = Date.now() + ATTRIBUTION_TIMEOUT_MS;
    const alreadyKnown = new Set(this.knownActiveOrders.keys());
    while (Date.now() < deadline) {
      const data = await this._apiFetch('/active-orders').catch(() => []);
      const orderList = Array.isArray(data) ? data : data.orders || [];
      const match = orderList.find((o) => o.instrument === instrument && (o.orderSide || o.side) === side && !alreadyKnown.has(o.id));
      if (match) {
        this.knownActiveOrders.set(match.id, { instrument, side, symbol, type: match.type });
        return match.id;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    console.warn(`[matchtrader] could not attribute the order just placed on ${symbol}/${side} to a broker id within ${ATTRIBUTION_TIMEOUT_MS}ms`);
    return null;
  }

  // ---- pyramid add-on (mirrors cTraderDataSource.js's design 1:1 - see there for the full rationale) ----

  async _handlePyramidOrderRequested(symbol, e) {
    try {
      const spec = getDefaultSpec(symbol);
      if (!spec) {
        console.warn(`[pyramid] no symbol spec for ${symbol} - skipping add-on order`);
        return;
      }
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: CONFIG.risk.riskPctPerTrade,
        entryPrice: e.entryPrice,
        stopPrice: e.stopPrice,
        symbolSpec: spec,
      });
      const side = e.direction === 'bullish' ? 'BUY' : 'SELL';
      await this._submitOrder({
        symbol,
        orderType: 'STOP',
        side,
        lots: sizing.lots,
        price: e.entryPrice,
        stopLoss: e.stopPrice,
        takeProfit: e.targetPrice,
      });
      const brokerOrderId = await this._resolveJustPlacedOrderId(symbol, side);
      if (brokerOrderId != null) {
        store.strategyEngine.markPyramidOrderPlaced(symbol, brokerOrderId);
        this.pyramidOrderSymbolByOrderId.set(brokerOrderId, symbol);
      }
      this._notifyText(`🔺 Pyramide auto : ordre stop programmé sur ${symbol} (entrée ${e.entryPrice}, stop ${e.stopPrice}, cible ${e.targetPrice}, ${sizing.lots} lots)`);
    } catch (err) {
      console.warn(`[pyramid] failed to place add-on order for ${symbol}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'envoi de l'ordre sur ${symbol} (${err.message}) - à vérifier manuellement`);
    }
  }

  async _handlePyramidOrderCancelRequested(symbol, e) {
    if (!e.brokerOrderId) return;
    try {
      await this._cancelOrder(e.brokerOrderId, symbol, undefined);
      this.pyramidOrderSymbolByOrderId.delete(e.brokerOrderId);
    } catch (err) {
      console.warn(`[pyramid] failed to cancel add-on order ${e.brokerOrderId} for ${symbol}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'annulation de l'ordre en attente sur ${symbol} - à annuler manuellement si toujours ouvert`);
    }
  }

  // ---- "mode indisponible" auto-execute (mirrors cTraderDataSource.js - see there for the full rationale) ----

  async _handleAutoExecuteEntry(symbol, signal) {
    try {
      const spec = getDefaultSpec(symbol);
      if (!spec) {
        console.warn(`[auto-execute] no symbol spec for ${symbol} - skipping entry`);
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
      const side = signal.suggestedSide.toUpperCase();
      await this._submitOrder({
        symbol,
        orderType: isFvg ? 'LIMIT' : 'MARKET',
        side,
        lots: sizing.lots,
        price: isFvg ? signal.entryPrice : undefined,
        stopLoss: signal.stopPrice,
        takeProfit: signal.targetPrice,
      });
      this._notifyText(
        `🤖 [${signal.source.toUpperCase()}] Entrée auto envoyée sur ${symbol} (${side}, entrée ${signal.entryPrice}, stop ${signal.stopPrice}, cible ${signal.targetPrice}, ${sizing.lots} lots)`
      );
      // Unlike cTrader's LIMIT order, Match-Trader's documented pending-order
      // body has no `expirationTimestamp`/time-in-force field - VERIFY
      // whether one exists before relying on it; until then, a stale unfilled
      // FVG limit order may sit open indefinitely instead of expiring after
      // ~1h like the cTrader path does. Worth an explicit manual check.
    } catch (err) {
      console.warn(`[auto-execute] failed to submit entry for ${symbol}:`, err.message);
      this._notifyText(`⚠️ [${signal.source.toUpperCase()}] Échec de l'envoi de l'entrée sur ${symbol} (${err.message}) - à vérifier manuellement`);
    }
  }

  // ---- notifications (same ntfy.sh channel as cTraderDataSource.js) ----

  _notify(events) {
    if (!CONFIG.notifications.ntfyTopic) return;
    for (const e of events) {
      if (e.type !== 'validated') continue;
      const range = e.zone ? ` (${e.zone.bottom.toFixed(2)}-${e.zone.top.toFixed(2)})` : '';
      const label =
        e.source === 'divergence' ? 'divergence' :
        e.source === 'nwog' ? 'NWOG (gap week-end)' :
        e.source === 'judaswing' ? 'Judas Swing (killzone Londres)' :
        'FVG rempli';
      const text = `${e.suggestedSide.toUpperCase()} ${e.symbol} — ${label}${range}`;
      fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
        console.warn('[ntfy] push failed', err.message)
      );
    }
  }

  _notifyText(text) {
    if (!CONFIG.notifications.ntfyTopic) return;
    fetch(`https://ntfy.sh/${CONFIG.notifications.ntfyTopic}`, { method: 'POST', body: text }).catch((err) =>
      console.warn('[ntfy] push failed', err.message)
    );
  }
}
