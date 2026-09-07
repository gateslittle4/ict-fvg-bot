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
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
    pyramidConfig: CONFIG.pyramid,
  }),
  balance: 10000, // demo starting balance; replaced by live account balance once connected
  signalLog: [], // { ...event, loggedAt }
  lastCandleBySymbol: new Map(),
  // "Mode indisponible" - Esdras flips this HIMSELF (dashboard button / API
  // call) right before a period he knows he won't be able to click
  // Buy/Sell (typically fin de mois). While active AND not expired, the
  // bot auto-executes the ORIGINAL entry itself instead of only alerting -
  // see isAutoExecuteActive()/_handleAutoExecuteEntry() in
  // cTraderDataSource.js. Off by default - the semi-automatic
  // alert-and-click flow is the norm; this is the deliberate, explicit
  // exception Esdras opts into for a bounded window, not a permanent switch.
  autoExecute: { enabled: false, expiresAt: null, enabledAt: null },
};

const MAX_AUTO_EXECUTE_HOURS = 7 * 24; // hard ceiling - even an explicit request can't leave this on for months unattended

/**
 * Turns the auto-execute window on for `hours` (required, capped at
 * MAX_AUTO_EXECUTE_HOURS) or off. Deliberately requires an explicit
 * duration to enable - no "on forever" option - so a forgotten toggle
 * reverts to the safer semi-automatic default on its own.
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
