// supabaseTradeLog.js
// Durable trade-outcome log, at the user's explicit request after realizing
// store.signalLog (see accountRuntime.js's MAX_LOG_LENGTH) only keeps the 200 most
// recent entries IN MEMORY - every Render restart (a deploy, or the free
// tier's own sleep/wake cycle) wipes it, so "how has US500 actually been
// doing" had no real answer beyond whatever fit in a 90-day in-memory replay
// of candle history that ALSO resets on every restart.
//
// Table lives in the "Chfproject" Supabase project - reused deliberately
// (it already sits inside the free-tier project-count quota the user is
// using for an unrelated clinic app; see HANDOFF.md for the full reasoning
// and the security caveat) but kept structurally isolated: table name
// prefixed bot_, no shared columns/keys with any clinic table, RLS enabled
// with NO anon/authenticated policies (only the service_role key - used
// here, server-side only - can reach it; see the migration in
// supabase/migrations or HANDOFF.md for the exact DDL). Meant to be moved to
// its own project later; being a single self-contained table with no
// foreign keys into anything else in that project, that's a plain
// pg_dump/restore whenever it happens.
//
// Deliberately just the OUTCOME of each resolved trade (one row per
// 'closed' event from LiveStrategyEngine), not every candle - the ask was
// "d'où vient la perte sur US500", which needs a per-symbol trade journal,
// not a candle-level replay archive (that was the older, paused, and much
// heavier "candle-history persistence" task - a different piece of work).

import { createClient } from '@supabase/supabase-js';
import { summarizeTrades } from '../backtest/backtestEngine.js';

const TABLE = 'bot_trade_events';

/**
 * @param {{url?: string, serviceKey?: string}} [env] - defaults to reading
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY from process.env, but accepts
 *   explicit values so this stays trivially testable without env leakage.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null} null when
 *   not configured - persistence is OPT-IN (same pattern as keepAlive.js),
 *   so a bot running without these env vars keeps working exactly as
 *   before, just without a durable trade log.
 */
export function createTradeLogClient({ url, serviceKey } = {}) {
  const supabaseUrl = url ?? process.env.SUPABASE_URL;
  const key = serviceKey ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}

/**
 * Maps a LiveStrategyEngine 'closed' event (paired with the 'validated'
 * event that opened it - same shape recentPerformanceReport.js already
 * builds) to the row shape bot_trade_events expects.
 */
export function toTradeRow({ symbol, source, direction, outcome, rMultiple, entryPrice, entryTime, exitTime, pnlUsd, balanceAfter }) {
  return {
    symbol,
    source,
    direction,
    outcome,
    r_multiple: rMultiple ?? null,
    entry_price: entryPrice,
    entry_time: new Date(entryTime).toISOString(),
    exit_time: new Date(exitTime).toISOString(),
    // pnl_usd/balance_after added 2026-09-15 (Esdras: "calendrier des jours
    // du mois... chiffre brut et %") - the real broker $ P&L and the real
    // resulting account balance, both already known at the call site
    // (cTraderDataSource.js's _handleExecutionEvent computes `pnl` from the
    // broker's own closePositionDetail.grossProfit before calling this).
    // Optional/nullable: existing rows logged before this column existed
    // simply have pnl_usd=null - never backfilled with a guess.
    pnl_usd: pnlUsd ?? null,
    balance_after: balanceAfter ?? null,
  };
}

/**
 * Fire-and-forget insert - a DB hiccup must never take down the live tick
 * loop it's called from (same swallow-errors philosophy as keepAlive.js's
 * ping and cTraderDataSource.js's _notify ntfy push). Returns the promise
 * anyway so callers/tests that DO want to await it can.
 */
export async function logClosedTrade(client, trade, { log = console } = {}) {
  if (!client) return;
  try {
    const { error } = await client.from(TABLE).insert(toTradeRow(trade));
    if (error) log.warn?.('[supabaseTradeLog] insert failed:', error.message);
  } catch (err) {
    log.warn?.('[supabaseTradeLog] insert threw:', err.message);
  }
}

function accumulate(bucket, row) {
  bucket.count++;
  if (row.outcome === 'win') bucket.wins++;
  else if (row.outcome === 'loss') bucket.losses++;
  else bucket.timeouts++;
  bucket.totalR += row.r_multiple || 0;
}

function finalizeBucket(b) {
  const decided = b.wins + b.losses;
  b.winRatePct = decided > 0 ? Math.round((b.wins / decided) * 1000) / 10 : null;
  b.totalR = Math.round(b.totalR * 100) / 100;
}

/**
 * Raw individual rows (not aggregated) for a recent window - added
 * 2026-09-15 at Esdras's explicit request ("toute information nécessaire
 * pour un vrai journal, le nombre de RRR etc") so the real per-trade
 * journal (cTraderDataSource.js's getTradeHistory, driven by the broker's
 * own deal history for the chart context) can be enriched with the R-
 * multiple this table already stores - cTrader's own deal history has NO
 * concept of "risk amount" once a position is closed, so r_multiple can
 * only ever come from here (computed at close time, when the real
 * riskAmount was still known - see cTraderDataSource.js's
 * openPositionInfoByPositionId). Matched to a broker deal by the caller
 * (symbol + closest exit_time within a tolerance) - see
 * enrichTradesWithRMultiple() below for that join, kept pure/testable
 * separately from this live query.
 */
export async function fetchRecentTradeRows(client, { days = 7 } = {}) {
  if (!client) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from(TABLE)
    .select('symbol, source, direction, outcome, r_multiple, entry_price, entry_time, exit_time, pnl_usd, balance_after')
    .gte('exit_time', since)
    .order('exit_time', { ascending: false });
  if (error) return [];
  return (data || []).map((row) => ({
    symbol: row.symbol,
    source: row.source,
    direction: row.direction,
    outcome: row.outcome,
    rMultiple: row.r_multiple ?? null,
    entryPrice: row.entry_price,
    entryTime: new Date(row.entry_time).getTime(),
    exitTime: new Date(row.exit_time).getTime(),
    // pnlUsd/balanceAfter added 2026-09-15 (Esdras: "preuve visuelle de
    // conformité" - the risk-check item needs the REAL $ risked, not just
    // the R-multiple) - null on any row logged before those columns
    // existed, never backfilled with a guess.
    pnlUsd: row.pnl_usd ?? null,
    balanceAfter: row.balance_after ?? null,
  }));
}

/**
 * Pure join: attaches `rMultiple` (and, ONLY when the broker deal's own
 * source came back unknown, the durable row's source as a fallback - never
 * overriding a real order-label match) from the durable journal onto each
 * broker-sourced trade (cTraderDataSource.js's getTradeHistory output),
 * matched by symbol + closest exit_time within `toleranceMs`. Best-effort,
 * same discipline as dealPairing.js's own matching: on this broker, two
 * trades on the same symbol rarely close within seconds of each other, but
 * never guaranteed-unique - a trade with no close match simply keeps
 * rMultiple: null rather than guessing. Exported separately from the live
 * query above so this join logic is unit-testable without a real Supabase
 * connection.
 * @param {Array} brokerTrades - getTradeHistory()'s trade objects (symbol, exitTime, ...)
 * @param {Array} durableRows - fetchRecentTradeRows()'s output
 * @param {number} [toleranceMs] - default 30s: durable rows use Date.now() at
 *   close-handling time, broker deals use the broker's own executionTimestamp -
 *   a few seconds of processing latency apart, never more on this broker.
 */
export function enrichTradesWithRMultiple(brokerTrades, durableRows, toleranceMs = 30000) {
  const used = new Set(); // each durable row matched to at most one broker trade
  return brokerTrades.map((trade) => {
    let best = null;
    let bestDiff = Infinity;
    durableRows.forEach((row, i) => {
      if (used.has(i) || row.symbol !== trade.symbol) return;
      const diff = Math.abs(row.exitTime - trade.exitTime);
      if (diff <= toleranceMs && diff < bestDiff) {
        best = i;
        bestDiff = diff;
      }
    });
    if (best === null) return { ...trade, rMultiple: null, pnlUsd: null, balanceAfter: null };
    used.add(best);
    return { ...trade, rMultiple: durableRows[best].rMultiple, pnlUsd: durableRows[best].pnlUsd, balanceAfter: durableRows[best].balanceAfter };
  });
}

/**
 * Pure join, same matching logic as enrichTradesWithRMultiple (its own
 * independent pass, not chained off that function's result - keeps each
 * concern separately testable): attaches `signalEntryPrice` and `slippage`
 * to each broker trade (2026-09-15, Esdras: "qualité d'exécution"). The
 * durable journal's own `entryPrice` is the price the SIGNAL targeted at
 * order-submission time (see cTraderDataSource.js's
 * openPositionInfoByPositionId/_handleExecutionEvent - `info.entryPrice`
 * comes straight from `signal.entryPrice`, never a broker fill); the
 * broker trade's `entryPrice` (dealPairing.js's `opening.executionPrice`)
 * is the REAL price the broker actually filled at. Neither is invented -
 * both already existed for other reasons, this just compares them.
 *
 * `slippage` is signed so positive always means "cost" (a worse fill than
 * the signal wanted) regardless of direction: for a bullish (buy) trade a
 * HIGHER real fill than intended is a cost; for a bearish (sell) trade a
 * LOWER real fill than intended is a cost - see the sign flip below.
 * Expressed in raw price units (NOT comparable across symbols with
 * different price scales - callers wanting a cross-symbol view should
 * normalize by signalEntryPrice themselves, e.g. slippage/signalEntryPrice).
 *
 * @param {Array} brokerTrades - getTradeHistory()'s trade objects (symbol, direction, entryPrice, exitTime, ...)
 * @param {Array} durableRows - fetchRecentTradeRows()'s output
 * @param {number} [toleranceMs] - default 30s, same reasoning as enrichTradesWithRMultiple
 */
export function enrichTradesWithSlippage(brokerTrades, durableRows, toleranceMs = 30000) {
  const used = new Set();
  return brokerTrades.map((trade) => {
    let best = null;
    let bestDiff = Infinity;
    durableRows.forEach((row, i) => {
      if (used.has(i) || row.symbol !== trade.symbol) return;
      const diff = Math.abs(row.exitTime - trade.exitTime);
      if (diff <= toleranceMs && diff < bestDiff) {
        best = i;
        bestDiff = diff;
      }
    });
    const signalEntryPrice = best === null ? null : durableRows[best].entryPrice;
    if (signalEntryPrice == null || trade.entryPrice == null) {
      return { ...trade, signalEntryPrice: null, slippage: null };
    }
    used.add(best);
    const rawDiff = trade.entryPrice - signalEntryPrice;
    const slippage = trade.direction === 'bearish' ? -rawDiff : rawDiff;
    return { ...trade, signalEntryPrice, slippage };
  });
}

/**
 * Per-symbol/per-strategy win/loss/timeout/R aggregation over a real,
 * durable window - unlike /api/recent-performance (recentPerformanceReport.js),
 * this reads whatever has actually been logged since persistence was turned
 * on, so it survives restarts and grows over calendar time rather than being
 * capped to a fixed in-memory replay window.
 *
 * `overall` and `equityCurve` reuse summarizeTrades() (backtestEngine.js) -
 * the SAME profitFactor/expectancy/maxDrawdown math already used everywhere
 * else in this project, rather than reimplementing it a second way here -
 * so a "pro" dashboard card built on this can show the same vocabulary
 * (espérance, profit factor, drawdown) as every strategy-analysis report.
 * summarizeTrades() expects trades in chronological (oldest-first) order
 * for a meaningful equity curve, so the query's own descending order (kept
 * for the existing bySymbol/bySource "most recent first" use) is reversed
 * locally rather than issuing a second query.
 */
export async function fetchPerformanceBySymbol(client, { days = null } = {}) {
  if (!client) return { bySymbol: {}, bySource: {}, overall: null, equityCurve: [], reason: 'not configured' };
  let query = client.from(TABLE).select('symbol, source, outcome, r_multiple, entry_time, exit_time, pnl_usd, balance_after').order('exit_time', { ascending: false });
  if (days != null) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('exit_time', since);
  }
  const { data, error } = await query;
  if (error) return { bySymbol: {}, bySource: {}, overall: null, equityCurve: [], reason: error.message };

  const bySymbol = {};
  const bySource = {};
  for (const row of data || []) {
    bySymbol[row.symbol] ??= { wins: 0, losses: 0, timeouts: 0, totalR: 0, count: 0 };
    accumulate(bySymbol[row.symbol], row);
    if (row.source) {
      bySource[row.source] ??= { wins: 0, losses: 0, timeouts: 0, totalR: 0, count: 0 };
      accumulate(bySource[row.source], row);
    }
  }
  for (const b of Object.values(bySymbol)) finalizeBucket(b);
  for (const b of Object.values(bySource)) finalizeBucket(b);

  const chronological = [...(data || [])].reverse();
  // rMultiple: row.r_multiple (2026-09-18 fix, no more `?? 0`) - a row with
  // a genuinely unknown r_multiple (see toTradeRow/cTraderDataSource.js's
  // _handleExecutionEvent) must reach summarizeTrades() as the true
  // null/undefined it is, not a silently-invented 0R - see that function's
  // own comment for the avgR-dilution bug this used to cause. `?? null`
  // normalizes an absent column the same way either shape would read.
  const overall = chronological.length > 0
    ? summarizeTrades(chronological.map((row) => ({ outcome: row.outcome, rMultiple: row.r_multiple ?? null })))
    : null;
  // entryTime added 2026-09-15 (Esdras: "stats par session") - a trade's
  // TRADING SESSION (Asie/Londres/New York) is a property of when it was
  // ENTERED, not when it happened to close (an ICT setup swept liquidity
  // during a specific session; the close can land hours later in a
  // completely different one) - so the journal page needs entry_time
  // alongside exit_time on every equityCurve point to bucket by it.
  // pnlUsd/balanceAfter added 2026-09-15 (Esdras: "calendrier... chiffre
  // brut et %") - null on any row logged before those columns existed
  // (never backfilled with a guess), so callers must handle a null pnlUsd.
  const equityCurve = overall
    ? chronological.map((row, i) => ({
        time: row.exit_time,
        entryTime: row.entry_time,
        cumulativeR: overall.equityCurve[i],
        pnlUsd: row.pnl_usd ?? null,
        balanceAfter: row.balance_after ?? null,
      }))
    : [];

  return { bySymbol, bySource, overall, equityCurve };
}
