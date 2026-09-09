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
 * ACTIVE-HOURS WINDOWS (KEEP_ALIVE_WINDOWS) - narrower than the market-hours
 * gate above, added 2026-09-09 at the user's request ("on pourrait programmer
 * le keep alive uniquement dans les heures où on a le plus de chance d'avoir
 * un trade").
 *
 * Grounded in the actual entry-time distribution of this exact production
 * config replayed over 2019-2025 (1120 real entries), not a guess:
 *   - FVG (the validated core): 100% between 07h and 10h NY, Mon-Fri. Zero
 *     outside - its session filters already constrain it that tightly.
 *   - NWOG: 351 of 361 entries on SUNDAY, 18h-19h NY (the weekly re-open gap).
 *   - Divergence: the only source with no session filter, so it is spread
 *     thinly across all 24 hours.
 * Measured trade-off for "Mon-Fri@06:30-12:00,Sun@17:00-22:00": keeps 926 of
 * 1120 entries and +595R of the +651R total (91%) for 30 h/week instead of
 * 120 h/week, and the kept trades are HIGHER quality (0.643R expectancy vs
 * 0.289R for the ones dropped, all of which are Divergence or stray NWOG -
 * no FVG entry is ever lost).
 *
 * Format: comma-separated `Day[-Day]@HH:MM-HH:MM` segments in NEW YORK local
 * time (DST-aware, same basis as everything else here), e.g.
 *   KEEP_ALIVE_WINDOWS=Mon-Fri@06:30-12:00,Sun@17:00-22:00
 * A window must not cross midnight - express that as two segments instead
 * (this is validated, not silently mis-parsed).
 */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WINDOW_RE = /^([A-Za-z]{3})(?:\s*-\s*([A-Za-z]{3}))?@(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

function normalizeDay(raw) {
  const key = raw.charAt(0).toUpperCase() + raw.slice(1, 3).toLowerCase();
  const index = DAY_INDEX[key];
  if (index === undefined) throw new Error(`unknown day "${raw}" (expected one of ${DAY_NAMES.join(', ')})`);
  return index;
}

function daysInRange(fromIndex, toIndex) {
  // Inclusive, and wraps across the week end (so Fri-Mon is Fri,Sat,Sun,Mon).
  const days = new Set();
  for (let i = 0, d = fromIndex; i < 7; i++, d = (d + 1) % 7) {
    days.add(d);
    if (d === toIndex) break;
  }
  return days;
}

/**
 * Pure parser. Throws with a precise message on a malformed spec rather than
 * silently ignoring a segment - a typo here would quietly stop the bot from
 * being kept awake during real trading hours, which is exactly the kind of
 * silent failure this project avoids everywhere else.
 * @returns {Array<{days: Set<number>, startMin: number, endMin: number}>|null} null when unset/empty
 */
export function parseKeepAliveWindows(spec) {
  if (!spec || !spec.trim()) return null;
  const windows = [];
  for (const raw of spec.split(',')) {
    const segment = raw.trim();
    if (!segment) continue;
    const m = WINDOW_RE.exec(segment);
    if (!m) throw new Error(`unparseable KEEP_ALIVE_WINDOWS segment "${segment}" (expected e.g. Mon-Fri@06:30-12:00)`);
    const [, fromDay, toDay, h1, m1, h2, m2] = m;
    const startMin = Number(h1) * 60 + Number(m1);
    const endMin = Number(h2) * 60 + Number(m2);
    if (Number(h1) > 23 || Number(h2) > 24 || Number(m1) > 59 || Number(m2) > 59) {
      throw new Error(`out-of-range time in KEEP_ALIVE_WINDOWS segment "${segment}"`);
    }
    if (endMin <= startMin) {
      throw new Error(`KEEP_ALIVE_WINDOWS segment "${segment}" ends at or before it starts - a window crossing midnight must be split into two segments`);
    }
    const fromIndex = normalizeDay(fromDay);
    const days = toDay ? daysInRange(fromIndex, normalizeDay(toDay)) : new Set([fromIndex]);
    windows.push({ days, startMin, endMin });
  }
  return windows.length > 0 ? windows : null;
}

/**
 * Pure: does this real UTC instant fall inside any of the given windows?
 * @param {number} nowMs - a genuine UTC timestamp (e.g. Date.now())
 */
export function isWithinKeepAliveWindows(nowMs, windows) {
  if (!windows || windows.length === 0) return true; // no windows configured -> never the reason to skip a ping
  const parts = nyPartsFormatter.formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === 'weekday').value;
  const day = DAY_INDEX[weekday];
  if (day === undefined) return true; // unrecognized locale output: fail OPEN, same choice as isMarketOpen()
  const nowMin = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  return windows.some((w) => w.days.has(day) && nowMin >= w.startMin && nowMin < w.endMin);
}

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
export function resolveKeepAliveConfig(env = {}, { log = console } = {}) {
  const intervalMinutes = clampInterval(Number(env.KEEP_ALIVE_MINUTES) || DEFAULT_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;
  const marketHoursOnly = env.KEEP_ALIVE_ALWAYS !== 'true';

  // A malformed spec falls back to the WIDER market-hours gate rather than
  // to no pinging at all: a typo should cost instance-hours, never silently
  // leave the bot asleep through a trading session.
  let windows = null;
  try {
    windows = parseKeepAliveWindows(env.KEEP_ALIVE_WINDOWS);
  } catch (err) {
    log.warn?.(`[keep-alive] ignoring KEEP_ALIVE_WINDOWS - ${err.message}. Falling back to the market-hours gate.`);
    windows = null;
  }

  if (env.KEEP_ALIVE !== 'true') {
    return { enabled: false, url: null, intervalMs, marketHoursOnly, windows, reason: 'KEEP_ALIVE is not set to "true"' };
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
      windows,
      reason: 'no KEEP_ALIVE_URL and no RENDER_EXTERNAL_URL - nothing to ping (this is normal off-Render, e.g. locally)',
    };
  }

  return { enabled: true, url: `${url.replace(/\/+$/, '')}/healthz`, intervalMs, marketHoursOnly, windows, reason: 'enabled' };
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
  const config = resolveKeepAliveConfig(env, { log });
  if (!config.enabled) {
    log.log(`[keep-alive] disabled - ${config.reason}`);
    return null;
  }

  // KEEP_ALIVE_WINDOWS, when set, REPLACES the market-hours gate (it is
  // strictly narrower by construction - see its own comment for the measured
  // trade-off behind the recommended value).
  const scope = config.windows
    ? `only during the configured active-trade windows (${env.KEEP_ALIVE_WINDOWS}, New York time)`
    : config.marketHoursOnly
      ? 'while the market is open (Sun 17:00 -> Fri 17:00 NY); asleep on weekends by design'
      : 'around the clock (KEEP_ALIVE_ALWAYS=true)';
  log.log(`[keep-alive] enabled - pinging ${config.url} every ${config.intervalMs / 60000} min ${scope}`);

  const timer = setInterval(async () => {
    if (config.windows) {
      if (!isWithinKeepAliveWindows(now(), config.windows)) return; // outside the hours where this config actually trades
    } else if (config.marketHoursOnly && !isMarketOpen(now())) {
      return; // market closed - let Render sleep it, nothing to watch anyway
    }
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
