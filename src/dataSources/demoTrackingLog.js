// demoTrackingLog.js
// Demo forward-test instrumentation (2026-09-20, Esdras: "on recupere autant d'informations que possible" to compare the
// real bot with the simulations): spread per 15-minute bucket, order lifecycle events, and the extra fields of a closed
// trade (stop, target, exit price/reason, signal vs fill price, spread at entry, timings, risk %). Everything writes to
// bot_* tables only (bot_spread_samples, bot_order_events, extra nullable columns of bot_trade_events), fire-and-forget:
// a database hiccup must never disturb the live loop (same philosophy as supabaseTradeLog.js).

export const SPREAD_BUCKET_MS = 15 * 60 * 1000;

/** Aggregates bid/ask spreads per (symbol, 15-minute bucket): min / avg / max / count. Pure, injectable clock. */
export function createSpreadAggregator({ bucketMs = SPREAD_BUCKET_MS } = {}) {
  const buckets = new Map(); // `${symbol}|${start}` -> {symbol,start,n,sum,min,max}
  return {
    record(symbol, spread, tsMs) {
      if (!symbol || !Number.isFinite(spread) || spread < 0 || !Number.isFinite(tsMs)) return;
      const start = Math.floor(tsMs / bucketMs) * bucketMs;
      const key = `${symbol}|${start}`;
      const b = buckets.get(key);
      if (!b) buckets.set(key, { symbol, start, n: 1, sum: spread, min: spread, max: spread });
      else { b.n++; b.sum += spread; if (spread < b.min) b.min = spread; if (spread > b.max) b.max = spread; }
    },
    /** Removes and returns the buckets that ended before nowMs (or all of them when force). */
    take(nowMs, { force = false } = {}) {
      const out = [];
      for (const [key, b] of buckets) if (force || b.start + bucketMs <= nowMs) { out.push(b); buckets.delete(key); }
      return out;
    },
    get size() { return buckets.size; },
  };
}

export const toSpreadRow = (b) => ({
  bucket_start: new Date(b.start).toISOString(),
  symbol: b.symbol,
  samples: b.n,
  spread_min: b.min,
  spread_avg: b.sum / b.n,
  spread_max: b.max,
});

export const toOrderEventRow = ({ symbol, source = null, event, side = null, price = null, detail = null, time = Date.now() }) => ({
  event_time: new Date(time).toISOString(),
  symbol,
  source,
  event,
  side,
  price: Number.isFinite(price) ? price : null,
  detail: detail == null ? null : String(detail).slice(0, 500),
});

/** Why a real close happened, from where it closed relative to the stop / target we set (tolerance = a fraction of the stop distance). */
export function classifyExit(info, exitPrice, tolerance = 0.15) {
  if (!info || !Number.isFinite(exitPrice)) return null;
  const { stopPrice, targetPrice, entryPrice } = info;
  const dist = Number.isFinite(stopPrice) && Number.isFinite(entryPrice) ? Math.abs(entryPrice - stopPrice) : null;
  const tol = dist ? dist * tolerance : 0;
  if (Number.isFinite(stopPrice) && Math.abs(exitPrice - stopPrice) <= tol) return 'stop';
  if (Number.isFinite(targetPrice) && Math.abs(exitPrice - targetPrice) <= tol) return 'target';
  if (Number.isFinite(stopPrice) && Number.isFinite(entryPrice) && (entryPrice > stopPrice ? exitPrice < stopPrice : exitPrice > stopPrice)) return 'stop (gap)';
  return 'other';
}

/** The extra columns of a closed trade, from what was remembered at signal/fill time. Missing values stay null (never guessed). */
export function extraTradeFields(info, exitPrice) {
  const n = (x) => (Number.isFinite(x) ? x : null);
  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
  const fill = n(info?.fillPrice);
  const signal = n(info?.signalPrice ?? info?.entryPrice);
  const sideSign = info?.direction === 'bullish' ? 1 : info?.direction === 'bearish' ? -1 : 0;
  return {
    stop_price: n(info?.stopPrice),
    target_price: n(info?.targetPrice),
    exit_price: n(exitPrice),
    exit_reason: classifyExit(info, exitPrice),
    signal_price: signal,
    fill_price: fill,
    // adverse move between the signal price and the real fill (positive = we paid more than planned)
    slippage: fill !== null && signal !== null && sideSign ? sideSign * (fill - signal) : null,
    spread_at_entry: n(info?.spreadAtEntry),
    signal_time: iso(info?.signalTime),
    order_time: iso(info?.orderTime),
    risk_pct: n(info?.riskPct),
  };
}

export async function insertRows(client, table, rows, { log = console } = {}) {
  if (!client || !rows || (Array.isArray(rows) && rows.length === 0)) return;
  try {
    const { error } = await client.from(table).insert(rows);
    if (error) log.warn(`[demo-tracking] insert into ${table} failed (non-fatal): ${error.message}`);
  } catch (err) {
    log.warn(`[demo-tracking] insert into ${table} threw (non-fatal): ${err.message}`);
  }
}

export async function upsertSpreadRows(client, rows, { log = console } = {}) {
  if (!client || rows.length === 0) return;
  try {
    const { error } = await client.from('bot_spread_samples').upsert(rows, { onConflict: 'bucket_start,symbol' });
    if (error) log.warn(`[demo-tracking] spread upsert failed (non-fatal): ${error.message}`);
  } catch (err) {
    log.warn(`[demo-tracking] spread upsert threw (non-fatal): ${err.message}`);
  }
}

export const logOrderEvent = (client, ev, opts) => insertRows(client, 'bot_order_events', toOrderEventRow(ev), opts);
