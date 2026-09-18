// alertHistory.js
// 2026-09-18 (Esdras: "continue, ne t'arrête pas" after the Lab tab) -
// closes a gap already documented in HANDOFF.md: every ntfy push this bot
// sends is fire-and-forget (cTraderDataSource.js's own _notify()/
// _notifyText(), mirrored in matchTraderDataSource.js and
// mockDataSource.js) and Render keeps no history of them - once a push
// leaves the process, the only record of it is whatever's still on
// Esdras's phone. "A vrai trou d'observabilité" per that entry.
//
// Deliberately in-memory only, not Supabase-backed: this is a convenience
// window into "what has this process pushed since it last started", not a
// durable audit trail (that's what the Supabase trade journal is for).
// Simpler, zero new config, and correct about its own limits (resets on
// every restart, same as GuardrailEngine.tradesToday before its own
// replay-on-boot fix - except here that's fine, there's nothing to replay
// since ntfy itself never handed anything back to reconstruct from).

const MAX_ALERTS = 200;
let alerts = [];

/** Records one alert exactly as it was pushed (or would have been, had a
 * topic been configured) - called from the SAME call sites that already
 * push to ntfy, never a new decision point of its own. */
export function recordAlert(text) {
  alerts.push({ text, at: Date.now() });
  if (alerts.length > MAX_ALERTS) alerts.shift();
}

/** Newest first - what a dashboard card wants, not what a log file wants. */
export function getRecentAlerts(limit = MAX_ALERTS) {
  const n = Math.max(0, Math.min(limit, alerts.length));
  return alerts.slice(alerts.length - n).reverse();
}

/** Test-only - the module-level array is process-wide state, and tests
 * must not leak into each other. */
export function _resetAlertHistoryForTests() {
  alerts = [];
}
