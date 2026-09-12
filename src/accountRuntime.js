// accountRuntime.js
// Per-account in-memory runtime state (2026-09, multi-account rollout - see
// HANDOFF.md "Multi-compte"). This is what used to be the single module-level
// `store` object in store.js - moved into a class, unchanged in behavior,
// so that a future registry (see accountRegistry.js) can hold N independent
// instances (one per broker account/challenge/prop firm) instead of exactly
// one process-wide singleton. Phase 1 of the rollout still only ever builds
// ONE instance (id: 'default') - see accountRegistry.js - so this change by
// itself is not supposed to alter any live behavior.
//
// The live/demo bot runs candles through LiveStrategyEngine (the streaming
// port of the validated filtered-FVG + Divergence combo - see
// src/liveStrategyEngine.js) instead of one raw FvgEngine per symbol.

import { LiveStrategyEngine } from './liveStrategyEngine.js';
import { GuardrailEngine } from './engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';
import { MIN_RISK_PCT, MAX_RISK_PCT } from './config.js';
import { resampleCandles } from './backtest/htfBias.js';
import { makeVolatilityRegimeLookup, DAY_MS, LOW_REGIME_RISK_SCALE } from './backtest/volatilityRegime.js';

const MAX_LOG_LENGTH = 200;

// Hard ceiling on a SINGLE arm call. This does NOT rule out staying armed
// indefinitely: AUTO_EXECUTE_ALWAYS_ON (server.js's boot sequence) re-arms a
// fresh MAX_AUTO_EXECUTE_HOURS window on every single boot, which in practice
// never lets the window run out given how often this process restarts on
// Render's free tier - a deliberate choice (2026-09, explicit user request:
// "passive income", no manual re-arming possible) over silently reverting to
// semi-automatic without her noticing.
export const MAX_AUTO_EXECUTE_HOURS = 7 * 24;

// Sources covered by the volatility-regime research (checkVolatilityRegimeImpactFullCombo.js /
// runFtmo1StepVolAdaptiveRiskAccountImpact.js) - NWOG/Judas Swing/pyramid were never part of
// that study, so tagging them would imply a finding that was never actually tested.
const VOL_REGIME_SOURCES = new Set(['fvg', 'divergence']);

export class AccountRuntime {
  /**
   * @param {{id: string, label?: string, config: object, spreads?: object, accountMode?: string, platform?: string, propFirmProgramId?: string|null, phaseIndex?: number|null}} opts
   * `config` is a CONFIG-shaped object (symbols, fvg, divergence, nwog,
   * judasSwing, guardrails, risk, pyramid) - today always the global CONFIG
   * (single account), later one per-account effective config built by
   * accountRegistry.js (which is also where propFirmProgramId/phaseIndex get
   * resolved into config.guardrails' targetPct/maxDrawdownPct/maxDrawdownType
   * - see src/propFirms/index.js). `accountMode`/`platform`/
   * `propFirmProgramId`/`phaseIndex` are metadata only (surfaced on
   * GET /api/accounts) - AccountRuntime itself doesn't act on them, it just
   * carries them alongside the state that DOES act on their consequences
   * (this.guardrail already has the resolved numbers baked in).
   */
  constructor({
    id,
    label = id,
    config,
    spreads = DEFAULT_SPREADS,
    accountMode = 'challenge',
    platform = 'mock',
    propFirmProgramId = null,
    phaseIndex = null,
  } = {}) {
    if (!id) throw new Error('AccountRuntime requires an id');
    if (!config) throw new Error('AccountRuntime requires a config to build its strategy engine from');
    this.id = id;
    this.label = label;
    this.accountMode = accountMode;
    this.platform = platform;
    this.propFirmProgramId = propFirmProgramId;
    this.phaseIndex = phaseIndex;
    this.mode = 'demo'; // 'demo' | 'live' - flipped once the data source connects successfully
    this.guardrail = new GuardrailEngine(config.guardrails);
    this.strategyEngine = new LiveStrategyEngine({
      symbols: config.symbols,
      fvgConfig: config.fvg.perSymbol,
      divergenceConfig: config.divergence,
      // LIVE, auto-executed - see config.js's `nwog` comment and HANDOFF.md.
      // Explicitly opted in ONLY here (the one real live-tracking engine) -
      // LiveStrategyEngine's constructor deliberately does NOT default this
      // the way fvgConfig/divergenceConfig do, so the backtest/report
      // engines (chartOverlays.js, forwardTest.js, recentPerformanceReport.js)
      // stay unaffected.
      nwogConfig: config.nwog,
      // LIVE, auto-executed - see config.js's `judasSwing` comment. Same
      // opt-in-only pattern as nwogConfig above.
      judasSwingConfig: config.judasSwing,
      guardrail: this.guardrail,
      riskPctPerTrade: config.risk.riskPctPerTrade,
      spreads,
      pyramidConfig: config.pyramid,
    });
    this.balance = 10000; // demo starting balance; replaced by live account balance once connected
    // Set by the live data source once connected - fixes the dashboard
    // hard-coding a broker name regardless of which broker/environment the
    // connected account actually belongs to. brokerName comes from
    // ProtoOATrader.brokerName (the broker's own whitelabel name for the
    // account) - null until known or if the broker never sets it. isDemo is
    // derived from which cTrader host was connected to (demo.ctraderapi.com
    // vs live.ctraderapi.com), not guessed.
    this.broker = { name: null, isDemo: null };
    this.signalLog = []; // { ...event, loggedAt }
    // Ground-truth outcome of every REAL order this account's data source
    // actually submitted to the broker (2026-09, at Esdras's explicit
    // request after "un ordre était passé" turned out to mean only the
    // engine's own belief, not a confirmed broker fill). Populated
    // exclusively from real ProtoOAExecutionEvent outcomes
    // (_handleExecutionEvent), never from the engine's own optimistic
    // 'validated' belief - this is the one place "did the order actually go
    // through" has a real answer instead of an inference.
    // { symbol, source, signalId, outcome: 'filled'|'unfilled', executionType, at }
    this.orderOutcomeLog = [];
    this.lastCandleBySymbol = new Map();
    // Raw (bid, ask) tick samples per symbol - lets a diagnostic route verify
    // whether the REAL live spread matches the "INDICATIVE, verify against
    // the broker's spec" placeholder values in transactionCosts.js's
    // DEFAULT_SPREADS. ProtoOASpotEvent carries both bid AND ask on every
    // tick (see foldLiveBidIntoCandle's own comment). Small ring buffer (see
    // MAX_SPREAD_SAMPLES in cTraderDataSource.js), display/diagnostic only -
    // never fed into any trading decision.
    this.recentTicksBySymbol = new Map();
    // "Mode indisponible" - flipped either by hand (dashboard button / API
    // call, e.g. right before a period with no time to click Buy/Sell), or
    // automatically at every boot when AUTO_EXECUTE_ALWAYS_ON=true. While
    // active AND not expired, the bot auto-executes the ORIGINAL entry
    // itself instead of only alerting - see isAutoExecuteActive()/
    // _handleAutoExecuteEntry() in cTraderDataSource.js. Off by default
    // (opt-in) - the semi-automatic alert-and-click flow is still the norm
    // for anyone who hasn't set AUTO_EXECUTE_ALWAYS_ON.
    this.autoExecute = { enabled: false, expiresAt: null, enabledAt: null };
    // Set by server.js once a live broker connection succeeds
    // (CTraderDataSource or MatchTraderDataSource instance) - lets routes
    // like GET /api/trade-history reach broker-specific methods without
    // server.js reaching into a data source module directly. Stays null in
    // demo mode (no broker to query).
    this.liveDataSource = null;
  }

  /**
   * Turns the auto-execute window on for `hours` (required, capped at
   * MAX_AUTO_EXECUTE_HOURS) or off. A single call never leaves it on
   * forever - the cap above still applies - but nothing stops a caller from
   * calling this again before it expires (a human re-clicking the dashboard
   * button, or AUTO_EXECUTE_ALWAYS_ON re-arming it at every boot - see that
   * constant's comment).
   */
  setAutoExecute(enabled, hours, now = Date.now()) {
    if (!enabled) {
      this.autoExecute = { enabled: false, expiresAt: null, enabledAt: null };
      return this.autoExecute;
    }
    if (!(hours > 0)) throw new Error('setAutoExecute(true, hours) requires a positive `hours` duration');
    const cappedHours = Math.min(hours, MAX_AUTO_EXECUTE_HOURS);
    this.autoExecute = { enabled: true, enabledAt: now, expiresAt: now + cappedHours * 3600 * 1000 };
    return this.autoExecute;
  }

  /** Pure check - true only while the window is both turned on AND not yet expired. */
  isAutoExecuteActive(now = Date.now()) {
    const a = this.autoExecute;
    return Boolean(a.enabled && a.expiresAt && now < a.expiresAt);
  }

  setBrokerInfo({ name, isDemo }) {
    this.broker = { name: name ?? null, isDemo: isDemo ?? null };
  }

  /** Keep balance, guardrail, and the strategy engine's own risk calc all in sync - use this instead of assigning this.balance directly. */
  setBalance(balance, now = Date.now()) {
    this.balance = balance;
    this.guardrail.setBalance(balance, now);
    this.strategyEngine.setBalance(balance);
  }

  /**
   * Changes the LIVE risk % per trade with immediate effect ("page
   * réglages") - sizes every new position from the next signal onward, never
   * retroactively. Bounds enforced HERE (not trusted from the caller/HTTP
   * body) using config.js's MIN_RISK_PCT/MAX_RISK_PCT - this number scales
   * every live order, so a fat-fingered or malformed request must fail loud
   * rather than silently clamp-and-continue. Does NOT persist across a
   * restart by itself - see config.js's RISK_PCT_PER_TRADE comment for how to
   * make a change durable.
   */
  setRiskPctPerTrade(pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      throw new Error('riskPctPerTrade must be a finite number');
    }
    if (pct < MIN_RISK_PCT || pct > MAX_RISK_PCT) {
      throw new Error(`riskPctPerTrade must be between ${MIN_RISK_PCT} and ${MAX_RISK_PCT}`);
    }
    this.strategyEngine.setRiskPctPerTrade(pct);
  }

  /**
   * Forward-test OBSERVATION ONLY (2026-09, at Esdras's explicit request:
   * "forward-test démo d'abord" before changing any real position sizing) -
   * tags a validated signal with the volatility regime (src/backtest/
   * volatilityRegime.js) and what its risk % WOULD be under the tested
   * low-vol-half-size scheme, purely for later comparison against what
   * actually happened. Does NOT feed back into riskAmount/lot sizing anywhere
   * - this.strategyEngine.riskPctPerTrade (and therefore every real order)
   * stays completely untouched by this. Wrapped in try/catch: an observation
   * tag must never be able to break real signal logging.
   */
  tagVolatilityObservation(evt) {
    if (evt.type !== 'validated' || evt.blockedReason || !VOL_REGIME_SOURCES.has(evt.source)) return evt;
    try {
      const history = this.strategyEngine.getHistory(evt.symbol);
      const daily = resampleCandles(history, DAY_MS);
      const volRegime = makeVolatilityRegimeLookup(daily)(evt.validatedAt);
      if (!volRegime) return evt;
      const currentRiskPct = this.strategyEngine.riskPctPerTrade;
      const suggestedRiskPct = volRegime === 'low' ? currentRiskPct * LOW_REGIME_RISK_SCALE : currentRiskPct;
      return { ...evt, volRegime, suggestedRiskPct };
    } catch {
      return evt;
    }
  }

  pushSignalEvents(events) {
    if (!events || events.length === 0) return;
    for (const evt of events) {
      this.signalLog.push({ ...this.tagVolatilityObservation(evt), loggedAt: Date.now() });
    }
    if (this.signalLog.length > MAX_LOG_LENGTH) {
      this.signalLog.splice(0, this.signalLog.length - MAX_LOG_LENGTH);
    }
  }

  /**
   * Record the REAL outcome of an order this account's data source actually
   * submitted to the broker, learned from a real ProtoOAExecutionEvent (see
   * cTraderDataSource.js's _handleExecutionEvent) - never from the engine's
   * own belief. `outcome` is 'filled' (a real position opened) or 'unfilled'
   * (cancelled/expired/rejected - no real position ever existed).
   */
  recordOrderOutcome({ symbol, source, signalId, outcome, executionType }) {
    this.orderOutcomeLog.push({ symbol, source, signalId, outcome, executionType, at: Date.now() });
    if (this.orderOutcomeLog.length > MAX_LOG_LENGTH) {
      this.orderOutcomeLog.splice(0, this.orderOutcomeLog.length - MAX_LOG_LENGTH);
    }
  }

  getActionableSignals() {
    // Actionability is now decided AT SIGNAL TIME by LiveStrategyEngine (each
    // 'validated' event already carries its own `blockedReason`, computed
    // against the guardrail/netting/spread state as of that exact candle) -
    // not recomputed live against the CURRENT guardrail status, which could
    // otherwise retroactively mark an already-fired signal as blocked/unblocked
    // depending on what happened afterwards.
    return this.signalLog
      .filter((e) => e.type === 'validated')
      .slice(-20)
      .reverse()
      .map((sig) => ({
        ...sig,
        actionable: !sig.blockedReason,
        blockedReasons: sig.blockedReason ? [sig.blockedReason] : [],
      }));
  }
}
