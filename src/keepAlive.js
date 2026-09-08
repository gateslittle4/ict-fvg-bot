// keepAlive.js
// Render's free tier spins a web service down after ~15 minutes without
// inbound HTTP traffic. For an ordinary website that just means a slow
// first load. For THIS bot it is much worse: spinning down kills the whole
// Node process, so the cTrader connection dies with it and the bot stops
// watching the market entirely - silently - until someone happens to open
// the dashboard. That visit then pays a cold start (Render's own container
// spin-up, tens of seconds, plus our ~9s warm-up), which from a phone looks
// exactly like "the site is broken": a blank page with a stalled progress
// bar. Confirmed from this service's own logs on 2026-09-08: it booted at
// 10:31 and 10:43 UTC with NO deploy at either time - i.e. two wake-ups
// from sleep, both triggered by someone trying to open the dashboard.
//
// This module keeps the instance awake by having the service ping its OWN
// public URL on a timer, which counts as the inbound traffic Render looks
// for. It can only PREVENT sleep, never recover from it: once the process
// is dead there is nothing left running to send a ping. That is acceptable
// - the process only dies when Render sleeps it (which this prevents) or on
// a deploy (which immediately starts a fresh one).
//
// !!! DELIBERATE OPT-IN (KEEP_ALIVE=true) - READ BEFORE ENABLING !!!
// Render grants 750 free instance-hours per MONTH per ACCOUNT, shared
// across every free service on that account. Staying awake around the clock
// burns ~720 of those by itself - essentially the whole monthly budget -
// which would starve the account's other free services.
//
// MARKET-HOURS GATE (on by default when enabled): pinging is skipped while
// the market is closed, i.e. outside Sunday 17:00 -> Friday 17:00 New York
// time. This costs NOTHING functionally - the bot cannot trade a closed
// market, and thanks to the fast warm-up fix it rebuilds its entire state
// from cTrader's own history in ~9s whenever it does come back up - but it
// cuts roughly 200 instance-hours a month of pure waste (every weekend),
// taking usage from ~720h to ~520h and leaving real headroom for the
// account's other free services. Set KEEP_ALIVE_ALWAYS=true to ping around
// the clock instead.

const DEFAULT_INTERVAL_MINUTES = 10; // comfortably under Render's ~15 min idle-shutdown threshold
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 14; // above this the instance can fall asleep between two pings, defeating the point

// Real New York wall-clock time, DST-aware. Deliberately NOT reusing
// nySession.js's toRealNyHourMinute(): that one takes a candle `.time` in
// this project's fixed-EST-as-UTC convention (see its header), whereas here
// the input is a genuine UTC instant (Date.now()). Feeding one into the
// other is exactly the convention mismatch that caused the live session-
// window bug fixed on 2026-09-08, so this keeps its own explicit conversion.
const nyPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MARKET_OPEN_DAY = 0; // Sunday
const MARKET_OPEN_HOUR = 17; // 17:00 NY
const MARKET_CLOSE_DAY = 5; // Friday
const MARKET_CLOSE_HOUR = 17; // 17:00 NY

/**
 * Pure: is the (24/5) market open at this real UTC instant?
 * Open from Sunday 17:00 New York time through Friday 17:00 New York time.
 * @param {number} nowMs - a genuine UTC timestamp (e.g. Date.now())
 */
export function isMarketOpen(nowMs) {
  const parts = nyPartsFormatter.formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === 'weekday').value;
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const day = DAY_INDEX[weekday];
  if (day === undefined) return true; // unrecognized locale output: fail OPEN rather than silently muting the bot

  if (day === MARKET_OPEN_DAY) return hour >= MARKET_OPEN_HOUR; // Sunday: opens at 17:00
  if (day === MARKET_CLOSE_DAY) return hour < MARKET_CLOSE_HOUR; // Friday: closes at 17:00
  if (day === 6) return false; // Saturday: closed all day
  return true; // Monday-Thursday: open all day
}

/**
 * Pure: decides whether keep-alive should run, and with what target/interval.
 * Kept separate from the timer/network code so the decision itself is
 * testable without a server or a clock.
 *
 * @param {Record<string, string|undefined>} env - process.env (or a fake, in tests)
 * @returns {{enabled: boolean, url: string|null, intervalMs: number, marketHoursOnly: boolean, reason: string}}
 */
export function resolveKeepAliveConfig(env = {}) {
  const intervalMinutes = clampInterval(Number(env.KEEP_ALIVE_MINUTES) || DEFAULT_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;
  const marketHoursOnly = env.KEEP_ALIVE_ALWAYS !== 'true';

  if (env.KEEP_ALIVE !== 'true') {
    return { enabled: false, url: null, intervalMs, marketHoursOnly, reason: 'KEEP_ALIVE is not set to "true"' };
  }

  // RENDER_EXTERNAL_URL is set automatically by Render for web services.
  // An explicit KEEP_ALIVE_URL wins, so this also works on another host (or
  // in a test) without pretending to be Render.
  const url = env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || null;
  if (!url) {
    return {
      enabled: false,
      url: null,
      intervalMs,
      marketHoursOnly,
      reason: 'no KEEP_ALIVE_URL and no RENDER_EXTERNAL_URL - nothing to ping (this is normal off-Render, e.g. locally)',
    };
  }

  return { enabled: true, url: `${url.replace(/\/+$/, '')}/healthz`, intervalMs, marketHoursOnly, reason: 'enabled' };
}

function clampInterval(minutes) {
  if (!Number.isFinite(minutes)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(Math.max(minutes, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES);
}

/**
 * Starts the keep-alive timer if the config says so. Returns the interval
 * handle (or null when disabled) so a caller/test can stop it.
 *
 * A failed ping is logged and otherwise ignored on purpose: a transient
 * network blip must never take down a running trading bot, and the next
 * tick will try again well before the idle threshold is reached.
 */
export function startKeepAlive({ env = process.env, fetchImpl = globalThis.fetch, log = console, now = Date.now } = {}) {
  const config = resolveKeepAliveConfig(env);
  if (!config.enabled) {
    log.log(`[keep-alive] disabled - ${config.reason}`);
    return null;
  }

  const scope = config.marketHoursOnly
    ? 'while the market is open (Sun 17:00 -> Fri 17:00 NY); asleep on weekends by design'
    : 'around the clock (KEEP_ALIVE_ALWAYS=true)';
  log.log(`[keep-alive] enabled - pinging ${config.url} every ${config.intervalMs / 60000} min ${scope}`);

  const timer = setInterval(async () => {
    if (config.marketHoursOnly && !isMarketOpen(now())) return; // market closed - let Render sleep it, nothing to watch anyway
    try {
      const res = await fetchImpl(config.url, { method: 'GET' });
      if (!res.ok) log.warn(`[keep-alive] ping returned HTTP ${res.status}`);
    } catch (err) {
      log.warn('[keep-alive] ping failed:', err.message);
    }
  }, config.intervalMs);

  // Never let this timer be the reason the process stays alive on shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}
