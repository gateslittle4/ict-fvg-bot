// healthReport.js
// Builds the payload behind GET /healthz. Kept pure and separate from
// server.js so it can be tested without booting an HTTP server or a broker
// connection.
//
// WHY THIS EXISTS BEYOND "is the process up?"
// keepAlive.js can only PREVENT Render from sleeping the service, never
// recover from it: once the process is dead there is nothing left running to
// send a ping - or to raise an alarm. So the watchdog has to live OUTSIDE
// this process, and this endpoint is what it reads. Three failure modes,
// increasingly sneaky:
//   1. the process is gone          -> the request itself fails
//   2. the broker socket is gone    -> accountsConnected drops to 0
//   3. the price feed went silent   -> lastCandleAgeSec keeps growing while
//      everything above still looks green. This is the dangerous one: the
//      dashboard is up, the socket is open, and no signal can fire because
//      no candle ever arrives.
//
// !!! lastCandleAgeSec USES THE NEWEST CANDLE, NOT THE OLDEST !!!
// Deliberate, and the opposite choice would produce nightly false alarms.
// The watched symbols do not trade the same hours: the index CFDs (US100,
// US500, GER40) close overnight while EURUSD/XAUUSD keep ticking. Taking the
// OLDEST candle would therefore report a "stale feed" every single night,
// purely because an index is closed - and an alarm that cries wolf nightly is
// an alarm nobody reads. The newest candle answers the question that actually
// matters: has ANYTHING arrived recently, i.e. is the feed alive at all?
//
// !!! candle.time HERE IS GENUINE UTC, NOT THIS PROJECT'S ENGINE TIME !!!
// store/account.lastCandleBySymbol is explicitly the display copy, kept in
// real UTC (see cTraderDataSource.js:1333 and :1496). Only _toEngineCandle()
// shifts by FIXED_EST_TO_UTC_OFFSET_MS on the way into the strategy engine.
// So `now - candle.time` is already correct here, and "correcting" it with
// that offset would be the bug, not the fix - it would report every candle as
// five hours in the future. Verified against live production data on
// 2026-09-18: raw 12:15:00Z at a wall clock of 12:27Z, i.e. a ~13 min old M15
// candle, exactly as a real-UTC reading predicts.

import { isMarketOpen } from './keepAlive.js';

/**
 * Pure. Returns the /healthz body.
 *
 * @param {object[]} accounts  AccountRuntime-shaped: { liveDataSource, lastCandleBySymbol }
 * @param {number} now         epoch ms
 * @param {number} bootedAt    epoch ms
 */
export function buildHealthReport({ accounts = [], now = Date.now(), bootedAt = now } = {}) {
  const connected = accounts.filter((account) => account?.liveDataSource != null);

  let newestCandleMs = null;
  for (const account of connected) {
    // A brand-new account has the Map but nothing in it yet; a mock/test
    // double may not have the Map at all. Neither is an error.
    const candles = account?.lastCandleBySymbol;
    if (!candles || typeof candles.values !== 'function') continue;
    for (const candle of candles.values()) {
      if (!Number.isFinite(candle?.time)) continue;
      if (newestCandleMs === null || candle.time > newestCandleMs) newestCandleMs = candle.time;
    }
  }

  // ---- execution health (the 4th signal) --------------------------------
  // Levels 1-3 above all read GREEN during the 2026-09-16..18 incident: the
  // process was up, the broker socket was open, candles were arriving - and
  // all three strategy orders came back with brokerOrderId=null, so nothing
  // was ever executed. A watchdog that cannot see that is a watchdog that
  // would have said "all good" for three days while the bot traded nothing.
  //
  // Two distinct ways an order fails to land, deliberately reported
  // separately because they need different fixes:
  //   - the broker explicitly REFUSED it  -> lastOrderRejection*
  //   - the broker said nothing at all    -> unconfirmedOrderStreak
  //
  // Both are read defensively off liveDataSource: lastOrderRejection is
  // populated by the ProtoOAOrderErrorEvent subscription added in a sibling
  // branch, so until that lands this simply reads null rather than breaking.
  // _consecutiveOrderConfirmationTimeouts is read rather than owned here -
  // observability must not fork the state that decides the forced restart.
  //
  // NOT built on the consecutive counter alone: that counter resets on the
  // next success AND on an explicit rejection, and it only forces a restart
  // at 2 in a row - which never happened, because orders are a day apart and
  // every deploy resets it to 0. The guardrail existed and could never fire.
  let lastOrderRejection = null;
  let unconfirmedOrderStreak = 0;
  for (const account of connected) {
    const source = account?.liveDataSource;
    const rejection = source?.lastOrderRejection;
    if (rejection && Number.isFinite(rejection.receivedAtMs)) {
      if (lastOrderRejection === null || rejection.receivedAtMs > lastOrderRejection.receivedAtMs) {
        lastOrderRejection = rejection;
      }
    }
    const streak = source?._consecutiveOrderConfirmationTimeouts;
    if (Number.isFinite(streak) && streak > unconfirmedOrderStreak) unconfirmedOrderStreak = streak;
  }

  return {
    ok: true,
    uptimeSec: Math.round((now - bootedAt) / 1000),
    accountsConnected: connected.length,
    accountsTotal: accounts.length,
    // null (not 0) when nothing has ever arrived - an external probe must be
    // able to tell "no candle yet, still warming up" from "a candle arrived
    // this second". Clamped at 0 so a candle timestamped microseconds into
    // the future (clock skew between the broker and this host) reads as fresh
    // rather than as a negative age.
    lastCandleAgeSec: newestCandleMs === null ? null : Math.max(0, Math.round((now - newestCandleMs) / 1000)),
    // Served from isMarketOpen() so the external watchdog reads the market
    // calendar instead of reimplementing it. That calendar is DST-aware and
    // already tested here; a second copy in a CI workflow would drift.
    // Without this, a watchdog would page every weekend, when this service is
    // asleep BY DESIGN (see keepAlive.js's market-hours gate).
    marketOpen: isMarketOpen(now),
    // null when no order was ever refused in this process's lifetime. A
    // restart therefore clears it - accepted, and the reason the external
    // probe polls every 10 minutes rather than hourly.
    lastOrderRejectionAgeSec:
      lastOrderRejection === null ? null : Math.max(0, Math.round((now - lastOrderRejection.receivedAtMs) / 1000)),
    // Carried so the alert can say WHY rather than just "something failed".
    lastOrderRejectionCode: lastOrderRejection?.errorCode ?? null,
    // 0 when the last order attempt was confirmed, or when none was tried.
    unconfirmedOrderStreak,
  };
}
