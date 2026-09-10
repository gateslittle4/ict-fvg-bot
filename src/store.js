// store.js
// Central in-memory runtime state shared by the API routes and whichever
// data source (mock or live cTrader) is currently feeding candles in.
//
// 2026-09: the live/demo bot now runs candles through LiveStrategyEngine
// (the streaming port of the validated filtered-FVG + Divergence combo —
// see src/liveStrategyEngine.js) instead of one raw FvgEngine per symbol.
// This is the fix for the gap flagged in HANDOFF.md: the bot used to apply
// NO filter at all to its live signals.

import { LiveStrategyEngine } from './liveStrategyEngine.js';
import { GuardrailEngine } from './engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';
import { CONFIG } from './config.js';

const MAX_LOG_LENGTH = 200;

const guardrail = new GuardrailEngine(CONFIG.guardrails);

export const store = {
  mode: 'demo', // 'demo' | 'live' - flipped once the cTrader client connects successfully
  guardrail,
  strategyEngine: new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    // LIVE, auto-executed (2026-09) - see config.js's `nwog` comment and
    // HANDOFF.md. Explicitly opted in ONLY here (the one real live-tracking
    // engine) - LiveStrategyEngine's constructor deliberately does NOT
    // default this the way fvgConfig/divergenceConfig do, so the
    // backtest/report engines (chartOverlays.js, forwardTest.js,
    // recentPerformanceReport.js) stay unaffected - whether to fold NWOG
    // into THOSE historical reports too is a separate, not-yet-made decision.
    nwogConfig: CONFIG.nwog,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
    pyramidConfig: CONFIG.pyramid,
  }),
  balance: 10000, // demo starting balance; replaced by live account balance once connected
  // Set by the live data source once connected (2026-09, fixing a dashboard
  // bug: the banner used to hard-code "FundingPips" regardless of which
  // broker/environment the connected account actually belongs to).
  // brokerName comes from ProtoOATrader.brokerName (the broker's own
  // whitelabel name for the account) - null until known or if the broker
  // never sets it. isDemo is derived from which cTrader host we connected to
  // (demo.ctraderapi.com vs live.ctraderapi.com), not guessed.
  broker: { name: null, isDemo: null },
  signalLog: [], // { ...event, loggedAt }
  lastCandleBySymbol: new Map(),
  // Raw (bid, ask) tick samples per symbol - 2026-09, at the user's request
  // to verify whether the REAL live spread matches the "INDICATIVE, verify
  // against FundingPips cTrader spec" placeholder values in
  // transactionCosts.js's DEFAULT_SPREADS (never actually confirmed - see
  // that file's own comment, and the pending-checklist item in HANDOFF.md).
  // ProtoOASpotEvent carries both bid AND ask on every tick (see
  // foldLiveBidIntoCandle's own comment), but only bid was extracted before
  // now. Small ring buffer (see MAX_SPREAD_SAMPLES in cTraderDataSource.js),
  // display/diagnostic only - never fed into any trading decision.
  recentTicksBySymbol: new Map(),
  // "Mode indisponible" - flipped either by hand (dashboard button / API
  // call, e.g. right before a period with no time to click Buy/Sell), or
  // automatically at every boot when AUTO_EXECUTE_ALWAYS_ON=true (2026-09,
  // at the user's explicit request - see server.js's boot sequence and
  // MAX_AUTO_EXECUTE_HOURS below). While active AND not expired, the bot
  // auto-executes the ORIGINAL entry itself instead of only alerting - see
  // isAutoExecuteActive()/_handleAutoExecuteEntry() in cTraderDataSource.js.
  // Off by default (opt-in) - the semi-automatic alert-and-click flow is
  // still the norm for anyone who hasn't set AUTO_EXECUTE_ALWAYS_ON.
  autoExecute: { enabled: false, expiresAt: null, enabledAt: null },
  // Set by server.js once a live broker connection succeeds (CTraderDataSource
  // or MatchTraderDataSource instance) - lets routes like GET /api/trade-history
  // reach broker-specific methods without server.js reaching into a data
  // source module directly. Stays null in demo mode (no broker to query).
  liveDataSource: null,
};

// Hard ceiling on a SINGLE arm call - still true, still enforced below. This
// does NOT rule out staying armed indefinitely: AUTO_EXECUTE_ALWAYS_ON
// (server.js's boot sequence) re-arms a fresh MAX_AUTO_EXECUTE_HOURS window
// on every single boot, which in practice never lets the window run out
// given how often this process restarts on Render's free tier - a
// deliberate choice (2026-09, explicit user request: "passive income", no
// manual re-arming possible) over silently reverting to semi-automatic
// without her noticing. Exported so server.js's boot sequence can reuse the
// same ceiling rather than hard-coding a second number that could drift.
export const MAX_AUTO_EXECUTE_HOURS = 7 * 24;

/**
 * Turns the auto-execute window on for `hours` (required, capped at
 * MAX_AUTO_EXECUTE_HOURS) or off. A single call never leaves it on
 * forever - the cap above still applies - but nothing stops a caller from
 * calling this again before it expires (a human re-clicking the dashboard
 * button, or AUTO_EXECUTE_ALWAYS_ON re-arming it at every boot - see that
 * constant's comment).
 */
export function setAutoExecute(enabled, hours, now = Date.now()) {
  if (!enabled) {
    store.autoExecute = { enabled: false, expiresAt: null, enabledAt: null };
    return store.autoExecute;
  }
  if (!(hours > 0)) throw new Error('setAutoExecute(true, hours) requires a positive `hours` duration');
  const cappedHours = Math.min(hours, MAX_AUTO_EXECUTE_HOURS);
  store.autoExecute = { enabled: true, enabledAt: now, expiresAt: now + cappedHours * 3600 * 1000 };
  return store.autoExecute;
}

/** Pure check - true only while the window is both turned on AND not yet expired. */
export function isAutoExecuteActive(now = Date.now()) {
  const a = store.autoExecute;
  return Boolean(a.enabled && a.expiresAt && now < a.expiresAt);
}

/** Keep balance, guardrail, and the strategy engine's own risk calc all in sync - use this instead of assigning store.balance directly. */
export function setBrokerInfo({ name, isDemo }) {
  store.broker = { name: name ?? null, isDemo: isDemo ?? null };
}

export function setBalance(balance, now = Date.now()) {
  store.balance = balance;
  store.guardrail.setBalance(balance, now);
  store.strategyEngine.setBalance(balance);
}

export function pushSignalEvents(events) {
  if (!events || events.length === 0) return;
  for (const evt of events) {
    store.signalLog.push({ ...evt, loggedAt: Date.now() });
  }
  if (store.signalLog.length > MAX_LOG_LENGTH) {
    store.signalLog.splice(0, store.signalLog.length - MAX_LOG_LENGTH);
  }
}

export function getActionableSignals() {
  // Actionability is now decided AT SIGNAL TIME by LiveStrategyEngine (each
  // 'validated' event already carries its own `blockedReason`, computed
  // against the guardrail/netting/spread state as of that exact candle) -
  // not recomputed live against the CURRENT guardrail status, which could
  // otherwise retroactively mark an already-fired signal as blocked/unblocked
  // depending on what happened afterwards.
  return store.signalLog
    .filter((e) => e.type === 'validated')
    .slice(-20)
    .reverse()
    .map((sig) => ({
      ...sig,
      actionable: !sig.blockedReason,
      blockedReasons: sig.blockedReason ? [sig.blockedReason] : [],
    }));
}
