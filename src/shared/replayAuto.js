// replayAuto.js
// "Le bot joue seul" mode of the Simulateur (2026-09-19, Esdras: replay my combinations ALONE - the strategies'
// trades are taken automatically as the clock reaches them, so the P&L moves live, and manual trading is off).
// Pure and unit-tested; it drives the same simulated broker (replayBroker.js) the manual panel uses.
//
// Each strategy trade is entered at ITS OWN backtest entry price (a buy still pays the spread), sized to risk a
// fixed % of the balance between that entry and its stop, and then left to the broker's stops and targets on
// the replayed candles. A trade with no target (trend-followers) - or one the broker did not resolve by the time
// the backtest did - is closed at the backtest's own exit price when its exit time arrives. Optionally each entry
// first passes the bot's real guardrails (closed trades per day, cooldown after a loss, daily loss, one position
// per pair), evaluated live on the simulated account.

import { placeAtPrice, closePosition, sizeFromRisk } from './replayBroker.js';

export const MIN_STOP_SPREAD_MULTIPLE = 3;
export const DEFAULT_GUARD = { maxTradesPerDay: 3, cooldownMinutes: 30, dailyLossPct: 2, oneOpenPerSymbol: true };

export const tradeKey = (symbol, t) => `${symbol}|${t.strategyId}|${t.entrySec}`;

export function createAutoState() {
  return { taken: new Set(), open: new Map(), skipped: [] };
}

const nyDay = (() => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return (sec) => f.format(new Date(sec * 1000));
})();

/** Would the bot's guardrails let this entry through right now? {ok, reason} */
export function guardAllows(acc, symbol, nowSec, guard) {
  const today = nyDay(nowSec);
  const closedToday = acc.history.filter((h) => nyDay(h.closeTime) === today);
  if (closedToday.length >= guard.maxTradesPerDay) return { ok: false, reason: `déjà ${closedToday.length} trades clôturés aujourd'hui` };
  const lastClosed = acc.history.reduce((b, h) => (!b || h.closeTime > b.closeTime ? h : b), null);
  if (lastClosed && lastClosed.pnl < 0 && nowSec < lastClosed.closeTime + guard.cooldownMinutes * 60) return { ok: false, reason: `pause de ${guard.cooldownMinutes} min après une perte` };
  const pnlToday = closedToday.reduce((s, h) => s + h.pnl, 0);
  const dayStart = acc.balance - pnlToday;
  if (dayStart > 0 && pnlToday < 0 && (-pnlToday / dayStart) * 100 >= guard.dailyLossPct) return { ok: false, reason: `perte du jour de ${guard.dailyLossPct} % atteinte` };
  if (guard.oneOpenPerSymbol && acc.positions.some((p) => p.symbol === symbol)) return { ok: false, reason: `position déjà ouverte sur ${symbol}` };
  return { ok: true };
}

/**
 * Advances the automatic trader to `nowSec` for ONE pair. Call it after that pair's candle was fed to the broker.
 * @param {object} acc - the broker account
 * @param {ReturnType<typeof createAutoState>} state
 * @param {string} symbol
 * @param {Array<{strategyId:string, direction:string, entrySec:number, exitSec:number, entryPrice:number, stopPrice:number, targetPrice:number|null, exitPrice:number}>} trades
 * @param {number} nowSec
 * @param {{fromSec:number, riskPct:number, guard:object|null}} opts fromSec = replay start: earlier signals are context, never traded
 * @returns {Array<{type:'opened'|'closed'|'skipped', trade:object, pos?:object, reason?:string, pnl?:number}>}
 */
export function stepAuto(acc, state, symbol, trades, nowSec, { fromSec, riskPct, guard = null }) {
  const events = [];

  // 1) entries that are due
  for (const t of trades) {
    if (t.entrySec > nowSec || t.entrySec < fromSec) continue;
    const key = tradeKey(symbol, t);
    if (state.taken.has(key)) continue;
    state.taken.add(key); // decided once: taken OR skipped, never reconsidered
    if (guard) {
      const g = guardAllows(acc, symbol, nowSec, guard);
      if (!g.ok) { state.skipped.push({ key, reason: g.reason }); events.push({ type: 'skipped', trade: t, reason: g.reason }); continue; }
    }
    const side = t.direction === 'bullish' ? 'buy' : 'sell';
    const spread = acc.spreads?.[symbol] ?? acc.spread;
    // The live bot's own viability rule (liveStrategyEngine, MIN_DISTANCE_SPREAD_MULTIPLE): a stop tighter than 3x the spread is never traded
    if (spread > 0 && Math.abs(t.entryPrice - t.stopPrice) < MIN_STOP_SPREAD_MULTIPLE * spread) {
      const reason = `stop plus serré que ${MIN_STOP_SPREAD_MULTIPLE}× le spread (filtre du bot)`;
      state.skipped.push({ key, reason }); events.push({ type: 'skipped', trade: t, reason }); continue;
    }
    const rate = acc.rates?.[symbol] ?? acc.rate;
    const entry = side === 'buy' ? t.entryPrice + spread : t.entryPrice;
    const units = sizeFromRisk({ balance: acc.balance, riskPct, entry, stop: t.stopPrice, rate });
    if (!(units > 0)) { events.push({ type: 'skipped', trade: t, reason: 'taille nulle (stop trop proche ou solde nul)' }); continue; }
    try {
      const pos = placeAtPrice(acc, { side, price: t.entryPrice, time: nowSec, units, sl: t.stopPrice, tp: t.targetPrice, symbol, tag: t.strategyId });
      state.open.set(pos.id, t);
      events.push({ type: 'opened', trade: t, pos });
    } catch (err) {
      events.push({ type: 'skipped', trade: t, reason: err.message });
    }
  }

  // 2) positions the broker has already closed (stop/target) are forgotten; the others follow the backtest's exit time
  for (const [id, t] of [...state.open]) {
    const pos = acc.positions.find((p) => p.id === id);
    if (!pos) { state.open.delete(id); continue; }
    if (pos.symbol !== symbol || t.exitSec > nowSec) continue;
    const spread = acc.spreads?.[symbol] ?? acc.spread;
    const bid = pos.side === 'buy' ? t.exitPrice : t.exitPrice - spread; // so the fill lands exactly on the backtest's exit price
    const pnl = closePosition(acc, id, { bid, time: nowSec, reason: t.targetPrice == null ? 'sortie de la stratégie' : 'fin du trade' });
    state.open.delete(id);
    events.push({ type: 'closed', trade: t, pnl });
  }
  return events;
}
