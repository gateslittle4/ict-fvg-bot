// supabaseTradeLog.js
// Durable trade-outcome log, at the user's explicit request after realizing
// store.signalLog (see store.js's MAX_LOG_LENGTH) only keeps the 200 most
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
export function toTradeRow({ symbol, source, direction, outcome, rMultiple, entryPrice, entryTime, exitTime }) {
  return {
    symbol,
    source,
    direction,
    outcome,
    r_multiple: rMultiple ?? null,
    entry_price: entryPrice,
    entry_time: new Date(entryTime).toISOString(),
    exit_time: new Date(exitTime).toISOString(),
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
  let query = client.from(TABLE).select('symbol, source, outcome, r_multiple, exit_time').order('exit_time', { ascending: false });
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
  const overall = chronological.length > 0
    ? summarizeTrades(chronological.map((row) => ({ outcome: row.outcome, rMultiple: row.r_multiple ?? 0 })))
    : null;
  const equityCurve = overall
    ? chronological.map((row, i) => ({ time: row.exit_time, cumulativeR: overall.equityCurve[i] }))
    : [];

  return { bySymbol, bySource, overall, equityCurve };
}
