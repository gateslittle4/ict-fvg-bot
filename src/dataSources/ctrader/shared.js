// shared.js - constantes et fonctions pures de la connexion cTrader (sorties de cTraderDataSource.js le 2026-09-24, inchangées ;
// réexportées par cTraderDataSource.js pour les imports existants).

import { getDefaultAccount } from '../../accountRegistry.js';
import { CONFIG } from '../../config.js';

// 2026-09-22: single source of truth for the daily strategy's identifier, used by _loadDailyAlertEngines (registers the engine), the mutual-
// exclusion check and the fill/close handlers below - was two inconsistent literals ('rsi2-daily' vs 'rsi2daily') before this constant, which
// would have silently broken both the self-exemption and the fill tracking (caught by test/dailyStrategyRealExecution.test.js before deploy).
// (now defined once in src/execution/entryPolicy.js, shared with the faithful replay)
// 2026-09-24: sources whose real position is opened AND closed by their own engine (not LiveStrategyEngine's netting/beliefs) - RSI(2)
// journalier, A (ORB 5 min, US100) and B (noise area, US500). One entry per symbol in dailyPositionBySymbol, with its source.
// Candles shown on each side of a trade in the journal chart (getTradeHistory).
export const CHART_MARGIN_CANDLES = 90;

export const HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com'; // use live.ctraderapi.com for a real (non-demo) account
export const PORT = 5035;

// Phase 1 of the multi-account rollout (see HANDOFF.md/accountRegistry.js):
// this data source, like the other two, still only ever drives the single
// default account - kept as a local `store` alias so the rest of this file
// (and its comments referring to "store.X") reads exactly as before.
export const store = getDefaultAccount();

// cTrader trendbar period enum name for our configured timeframe.
export const PERIOD_BY_TIMEFRAME = { M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30', H1: 'H1' };
// 2026-09-21: the broker returns AT MOST ~14 000 bars per trendbar response (M15 exports came back with exactly 14 000). Windows of 16 days of M1
// (24 000 counted, ~16 400 real trading bars) silently lost ~2 days at one edge every window (~14 % of all M1). 11 520 = 8 days of M1 (~11 500 real
// bars, probe verified gap-free) keeps every window under that cap; M15 splits into ~120-day windows.
export const MAX_TRENDBARS_PER_REQUEST = 11520;

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
export const TIMEFRAME_DURATION_MS = { M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000 };

// 2026-09-13 (Esdras: "on fait le changement pour m1 pour btc seulement,
// laisser tout les autres pairs a leur configuration normale") - per-symbol
// timeframe override, TEMPORARY alongside every other BTCUSD entry (see
// config.js). Every other symbol keeps reading CONFIG.timeframe (M15)
// exactly as before - this only branches for a symbol that explicitly sets
// its own `timeframe` in CONFIG.fvg.perSymbol[symbolName].
export function resolveSymbolTimeframe(symbolName) {
  return CONFIG.fvg.perSymbol?.[symbolName]?.timeframe || CONFIG.timeframe;
}
export const MAX_SPREAD_SAMPLES = 500; // ring buffer size for store.recentTicksBySymbol - a few hours of ticks, plenty for a spread sanity check

// @reiryoku/ctrader-layer's sendCommand() has NO built-in timeout - its promise
// only settles when a response with a matching clientMsgId arrives, so a
// request the server never answers (rate limit, oversized response, an
// unexpected field) hangs start() forever with zero error and zero log line -
// confirmed live on the first real deploy (boot stalled silently right after
// account auth). Every boot-time request is wrapped in this so a stuck call
// fails loud instead of hanging the whole connection indefinitely.
export const CTRADER_REQUEST_TIMEOUT_MS = 20000;

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
