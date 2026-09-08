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
// across every free service on that account. A service kept awake 24/7
// burns ~720 of those hours by itself, i.e. essentially the entire monthly
// budget, which can starve the account's other free services. That
// trade-off is the user's to make, not this code's - hence off unless
// explicitly switched on. The clean alternative is a paid plan (Render
// Starter, ~$7/month), which removes sleeping altogether and does not
// consume the free-hours pool.

const DEFAULT_INTERVAL_MINUTES = 10; // comfortably under Render's ~15 min idle-shutdown threshold
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 14; // above this the instance can fall asleep between two pings, defeating the point

/**
 * Pure: decides whether keep-alive should run, and with what target/interval.
 * Kept separate from the timer/network code so the decision itself is
 * testable without a server or a clock.
 *
 * @param {Record<string, string|undefined>} env - process.env (or a fake, in tests)
 * @returns {{enabled: boolean, url: string|null, intervalMs: number, reason: string}}
 */
export function resolveKeepAliveConfig(env = {}) {
  const intervalMinutes = clampInterval(Number(env.KEEP_ALIVE_MINUTES) || DEFAULT_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;

  if (env.KEEP_ALIVE !== 'true') {
    return { enabled: false, url: null, intervalMs, reason: 'KEEP_ALIVE is not set to "true"' };
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
      reason: 'no KEEP_ALIVE_URL and no RENDER_EXTERNAL_URL - nothing to ping (this is normal off-Render, e.g. locally)',
    };
  }

  return { enabled: true, url: `${url.replace(/\/+$/, '')}/healthz`, intervalMs, reason: 'enabled' };
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
export function startKeepAlive({ env = process.env, fetchImpl = globalThis.fetch, log = console } = {}) {
  const config = resolveKeepAliveConfig(env);
  if (!config.enabled) {
    log.log(`[keep-alive] disabled - ${config.reason}`);
    return null;
  }

  log.log(`[keep-alive] enabled - pinging ${config.url} every ${config.intervalMs / 60000} min to stop Render's free tier from sleeping this service`);

  const timer = setInterval(async () => {
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
