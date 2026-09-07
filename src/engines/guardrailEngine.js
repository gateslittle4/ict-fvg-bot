// guardrailEngine.js
// Anti-overtrading / anti-revenge-trading gate.
//
// Rules enforced (all configurable, defaults match the user's chosen settings):
//   - maxTradesPerDay: hard cap on number of trades allowed per trading day
//   - cooldownMinutesAfterLoss: forced pause after any losing trade
//   - dailyLossLimitPct: once today's realized loss reaches this % of the
//     day's starting balance, all further signals are blocked until rollover
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
   */
  constructor({
    maxTradesPerDay = 2,
    cooldownMinutesAfterLoss = 30,
    dailyLossLimitPct = 2,
    dayBoundaryHourUTC = 0,
  } = {}) {
    this.maxTradesPerDay = maxTradesPerDay;
    this.cooldownMinutesAfterLoss = cooldownMinutesAfterLoss;
    this.dailyLossLimitPct = dailyLossLimitPct;
    this.dayBoundaryHourUTC = dayBoundaryHourUTC;

    this.dayKey = null;
    this.trades = []; // { time, pnl, isLoss }
    this.startingBalance = null;
    this.currentBalance = null;
  }

  _dayKeyFor(now) {
    const shifted = now - this.dayBoundaryHourUTC * 3600 * 1000;
    return new Date(shifted).toISOString().slice(0, 10);
  }

  _ensureDay(now) {
    const key = this._dayKeyFor(now);
    if (this.dayKey !== key) {
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
    }

    this.trades.push({ time, pnl, isLoss: pnl < 0 });
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

    const blockReasons = [];
    if (tradesToday >= this.maxTradesPerDay) blockReasons.push('max_trades_reached');
    if (cooldownRemainingMs > 0) blockReasons.push('cooldown_active');
    if (dailyLossPct >= this.dailyLossLimitPct) blockReasons.push('daily_loss_limit_reached');

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
      blocked: blockReasons.length > 0,
      blockReasons,
    };
  }

  canTakeNewTrade(now = Date.now()) {
    return !this.getStatus(now).blocked;
  }
}
