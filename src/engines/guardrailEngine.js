// guardrailEngine.js
// Anti-overtrading / anti-revenge-trading gate.
//
// Rules enforced (all configurable, defaults match the user's chosen settings):
//   - maxTradesPerDay: hard cap on number of trades allowed per trading day
//   - cooldownMinutesAfterLoss: forced pause after any losing trade
//   - dailyLossLimitPct: once today's realized loss reaches this % of the
//     day's starting balance, all further signals are blocked until rollover
//   - maxDrawdownPct/maxDrawdownType (2026-09, multi-account/prop-firm
//     rollout - see src/propFirms/index.js): once the account's OVERALL
//     balance drops to this phase's real drawdown floor, ALL further signals
//     are blocked (not just for today - this does not reset at day rollover,
//     unlike dailyLossLimitPct) until Esdras intervenes. Optional - omitting
//     it (the default) keeps every existing caller's behavior identical.
//   - targetPct (same rollout): once OVERALL balance reaches this phase's
//     profit target, `getStatus().targetReached` flips true - this does NOT
//     block anything (trading keeps going, matching every account-impact
//     backtest script in this project) and does NOT auto-advance to a next
//     phase (Esdras adds a new account for that once the prop firm actually
//     grants it) - it only exists so a caller can fire a one-time alert, via
//     consumeTargetReachedEvent() below.
//
// The engine does not execute anything itself - it is a pure gate that the
// dashboard/notifier consults before showing a signal as "actionable".

export class GuardrailEngine {
  /**
   * @param {object} opts
   * @param {number} [opts.maxTradesPerDay]
   * @param {number} [opts.cooldownMinutesAfterLoss]
   * @param {number} [opts.dailyLossLimitPct] - e.g. 2 for 2%
   * @param {number} [opts.dayBoundaryHourUTC] - hour (0-23, UTC) at which the
   *   "trading day" rolls over. Defaults to 0 (midnight UTC). Adjust this if
   *   your broker's server day rolls over at a different hour.
   * @param {number|null} [opts.targetPct] - overall profit target for the
   *   CURRENT phase, e.g. 10 for +10% - see src/propFirms/index.js. null
   *   (default) disables target tracking entirely.
   * @param {number|null} [opts.maxDrawdownPct] - overall max-loss cap for the
   *   current phase, e.g. 10 for 10%. null (default) disables overall-
   *   drawdown blocking entirely (the daily-loss gate above still applies).
   * @param {'static'|'trailing-eod'|'trailing-locks-at-start-balance'|null} [opts.maxDrawdownType]
   *   - 'static': floor = initial balance * (1 - maxDrawdownPct/100), never moves.
   *   - 'trailing-eod': floor = highest END-OF-DAY balance ever reached * (1 - maxDrawdownPct/100).
   *   - 'trailing-locks-at-start-balance': floor = min(highest real-time
   *     balance ever reached * (1 - maxDrawdownPct/100), initial balance) -
   *     see propFirms/fundingPips.js's Zero program.
   *   Required (non-null) whenever maxDrawdownPct is set - an unrecognized/
   *   missing type disables the check entirely rather than guessing, since a
   *   wrong guess here could silently block (or fail to block) real trading.
   */
  constructor({
    maxTradesPerDay = 2,
    cooldownMinutesAfterLoss = 30,
    dailyLossLimitPct = 2,
    dayBoundaryHourUTC = 0,
    targetPct = null,
    maxDrawdownPct = null,
    maxDrawdownType = null,
  } = {}) {
    this.maxTradesPerDay = maxTradesPerDay;
    this.cooldownMinutesAfterLoss = cooldownMinutesAfterLoss;
    this.dailyLossLimitPct = dailyLossLimitPct;
    this.dayBoundaryHourUTC = dayBoundaryHourUTC;
    this.targetPct = targetPct;
    this.maxDrawdownPct = maxDrawdownPct;
    this.maxDrawdownType = maxDrawdownType;

    this.dayKey = null;
    this.trades = []; // { time, pnl, isLoss }
    this.startingBalance = null;
    this.currentBalance = null;

    // Overall (not per-day) balance tracking for target/drawdown - see the
    // constructor doc above for exactly how each is used.
    this.initialBalance = null; // first balance this engine ever saw - the CURRENT phase's own starting point
    this.peakBalance = null; // highest balance ever seen, real-time
    this.peakEodBalance = null; // highest balance ever seen AT a day boundary (for 'trailing-eod')
    this._targetAlertSent = false; // edge-trigger guard for consumeTargetReachedEvent()
    this._targetEverReached = false; // sticky - once true, getStatus().targetReached stays true even after a pullback
  }

  /** Shared by setBalance()/recordTrade() - keeps initialBalance/peakBalance in sync wherever a fresh balance is learned from. */
  _trackOverallBalance(balance) {
    if (this.initialBalance === null) this.initialBalance = balance;
    this.peakBalance = this.peakBalance === null ? balance : Math.max(this.peakBalance, balance);
  }

  _dayKeyFor(now) {
    const shifted = now - this.dayBoundaryHourUTC * 3600 * 1000;
    return new Date(shifted).toISOString().slice(0, 10);
  }

  _ensureDay(now) {
    const key = this._dayKeyFor(now);
    if (this.dayKey !== key) {
      // Capture the CLOSING balance of the day that's ending, for the
      // 'trailing-eod' drawdown variant - this.currentBalance right at this
      // instant is exactly that (the day boundary is one instant shared by
      // "yesterday's close" and "today's open").
      if (this.currentBalance !== null) {
        this.peakEodBalance = this.peakEodBalance === null ? this.currentBalance : Math.max(this.peakEodBalance, this.currentBalance);
      }
      this.dayKey = key;
      this.trades = [];
      // Roll the starting balance forward to whatever we last knew, so a
      // fresh day starts its loss-% calculation from today's actual equity.
      this.startingBalance = this.currentBalance;
    }
  }

  /**
   * Update the known account balance (e.g. polled from the broker).
   * Call this at least once before relying on dailyLossPct.
   */
  setBalance(balance, now = Date.now()) {
    this._ensureDay(now);
    this.currentBalance = balance;
    if (this.startingBalance === null) this.startingBalance = balance;
    this._trackOverallBalance(balance);
  }

  /**
   * Record a closed trade.
   * @param {object} trade
   * @param {number} trade.pnl - profit (positive) or loss (negative), in account currency
   * @param {number} [trade.time] - epoch ms, defaults to now
   * @param {number} [trade.balanceAfter] - account balance after this trade closed
   */
  recordTrade({ pnl, time = Date.now(), balanceAfter } = {}) {
    if (typeof pnl !== 'number') throw new Error('recordTrade requires a numeric pnl');
    this._ensureDay(time);

    if (typeof balanceAfter === 'number') {
      this.currentBalance = balanceAfter;
      if (this.startingBalance === null) this.startingBalance = balanceAfter - pnl;
      this._trackOverallBalance(balanceAfter);
    }

    this.trades.push({ time, pnl, isLoss: pnl < 0 });
  }

  /** Pure - the current phase's real drawdown floor, or null if not configured/not enough data yet. */
  _overallDrawdownFloor() {
    if (this.maxDrawdownPct == null || this.initialBalance == null) return null;
    const keep = 1 - this.maxDrawdownPct / 100;
    if (this.maxDrawdownType === 'static') return this.initialBalance * keep;
    if (this.maxDrawdownType === 'trailing-eod') return (this.peakEodBalance ?? this.initialBalance) * keep;
    if (this.maxDrawdownType === 'trailing-locks-at-start-balance') {
      return Math.min((this.peakBalance ?? this.initialBalance) * keep, this.initialBalance);
    }
    return null; // unrecognized/missing type - fail OPEN (never block on a guess) rather than fail closed on a typo
  }

  /** Pure - the current phase's target balance, or null if not configured/not enough data yet. */
  _targetBalance() {
    if (this.targetPct == null || this.initialBalance == null) return null;
    return this.initialBalance * (1 + this.targetPct / 100);
  }

  /**
   * Edge-triggered: returns true EXACTLY ONCE, the first call after the
   * target has been reached - callers (e.g. a push-notification hook) should
   * use this to fire a one-time alert, not getStatus().targetReached (which
   * stays true on every subsequent poll, by design - see the class header).
   */
  consumeTargetReachedEvent(now = Date.now()) {
    if (this._targetAlertSent) return false;
    if (this.getStatus(now).targetReached) {
      this._targetAlertSent = true;
      return true;
    }
    return false;
  }

  /**
   * Evaluate current gate status.
   * @param {number} [now]
   */
  getStatus(now = Date.now()) {
    this._ensureDay(now);

    const tradesToday = this.trades.length;
    const lastTrade = this.trades[this.trades.length - 1];

    let cooldownRemainingMs = 0;
    if (lastTrade && lastTrade.isLoss) {
      const cooldownEnd = lastTrade.time + this.cooldownMinutesAfterLoss * 60 * 1000;
      cooldownRemainingMs = Math.max(0, cooldownEnd - now);
    }

    const dailyPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const dailyLossPct =
      this.startingBalance && this.startingBalance > 0 && dailyPnl < 0
        ? (-dailyPnl / this.startingBalance) * 100
        : 0;

    const overallDrawdownFloor = this._overallDrawdownFloor();
    const overallDrawdownBreached =
      overallDrawdownFloor !== null && this.currentBalance !== null && this.currentBalance <= overallDrawdownFloor;
    const targetBalance = this._targetBalance();
    const targetReachedNow = targetBalance !== null && this.currentBalance !== null && this.currentBalance >= targetBalance;
    if (targetReachedNow) this._targetEverReached = true;
    const targetReached = this._targetEverReached; // sticky - see class header

    const blockReasons = [];
    if (tradesToday >= this.maxTradesPerDay) blockReasons.push('max_trades_reached');
    if (cooldownRemainingMs > 0) blockReasons.push('cooldown_active');
    if (dailyLossPct >= this.dailyLossLimitPct) blockReasons.push('daily_loss_limit_reached');
    // Not per-day like the check above - does NOT reset at day rollover.
    if (overallDrawdownBreached) blockReasons.push('overall_drawdown_breached');

    return {
      dayKey: this.dayKey,
      tradesToday,
      maxTradesPerDay: this.maxTradesPerDay,
      cooldownRemainingMs,
      cooldownMinutesAfterLoss: this.cooldownMinutesAfterLoss,
      dailyPnl,
      dailyLossPct,
      dailyLossLimitPct: this.dailyLossLimitPct,
      startingBalance: this.startingBalance,
      currentBalance: this.currentBalance,
      // Overall (not per-day) challenge tracking - null/false when
      // targetPct/maxDrawdownPct weren't configured (every existing caller).
      maxDrawdownPct: this.maxDrawdownPct,
      maxDrawdownType: this.maxDrawdownType,
      overallDrawdownFloor,
      overallDrawdownBreached,
      targetPct: this.targetPct,
      targetBalance,
      targetReached,
      blocked: blockReasons.length > 0,
      blockReasons,
    };
  }

  canTakeNewTrade(now = Date.now()) {
    return !this.getStatus(now).blocked;
  }
}
