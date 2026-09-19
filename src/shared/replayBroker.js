// replayBroker.js
// The simulated broker behind the "Simulateur" page (2026-09-19, Esdras: replay the market and
// trade it "comme les simulateurs de forex" to SEE how the strategies appear and play out).
// Pure functions, no DOM, no clock: they run in the browser (served at /shared/replayBroker.js)
// and are unit-tested on the server, so the fills the page shows are exactly what the tests pin.
//
// PRICE CONVENTION (same as the Labo's cost model): the chart shows the BID. A buy pays the ask
// (bid + spread) and exits at the bid; a sell enters at the bid and exits at the ask. The spread is
// therefore paid once per round trip, like applyTransactionCosts() charges it in the backtests.
// P&L is price difference x units in the instrument's QUOTE currency, times `acc.rate` = account
// currency per unit of quote currency (1 when the quote IS the account currency, or when no
// conversion pair is available - the page says which). The page refreshes `acc.rate` every candle,
// so a trade closed later converts at the rate of the day it closed, like a real broker.
//
// FILL RULES (deliberately conservative, like backtestEngine.js):
//  - a position is only checked for its stop/target from the candle AFTER the one it opened on;
//  - if a candle touches both the stop and the target, the STOP wins;
//  - a stop that the candle gaps through fills at the candle's open (worse), a target fills at its price;
//  - pending orders fill at their price, or at the open if the candle gaps past it.

// SEVERAL PAIRS ON ONE ACCOUNT: a position or order can carry a `symbol` (and a `tag`, e.g. the strategy that
// opened it). Spreads and conversion rates are then looked up per symbol in `acc.spreads` / `acc.rates`,
// falling back to the single `acc.spread` / `acc.rate` (the one-pair case, unchanged).
export function createAccount({ balance = 10000, spread = 0, rate = 1 } = {}) {
  return { startBalance: balance, balance, spread, rate, spreads: {}, rates: {}, nextId: 1, positions: [], pending: [], history: [], equityCurve: [] };
}

const spreadOf = (acc, symbol) => (symbol != null && acc.spreads?.[symbol] !== undefined ? acc.spreads[symbol] : acc.spread);
const rateOf = (acc, symbol) => (symbol != null && acc.rates?.[symbol] !== undefined ? acc.rates[symbol] : acc.rate);

const isBuy = (side) => side === 'buy';
const entryAskOrBid = (side, bid, spread) => (isBuy(side) ? bid + spread : bid);

/** Units that risk `riskPct` % of the balance between `entry` and `stop` (0 when it cannot be computed). */
export function sizeFromRisk({ balance, riskPct, entry, stop, rate = 1 }) {
  const dist = Math.abs(entry - stop);
  if (!(balance > 0) || !(riskPct > 0) || !(dist > 0) || !(rate > 0)) return 0;
  return (balance * riskPct / 100) / (dist * rate); // dist x units is in QUOTE currency; x rate makes it account currency
}

function assertStops(side, entry, sl, tp) {
  if (sl != null && (isBuy(side) ? sl >= entry : sl <= entry)) throw new Error(`Stop invalide : pour ${isBuy(side) ? 'un achat' : 'une vente'} il doit être ${isBuy(side) ? 'sous' : 'au-dessus de'} le prix d'entrée (${entry}).`);
  if (tp != null && (isBuy(side) ? tp <= entry : tp >= entry)) throw new Error(`Objectif invalide : pour ${isBuy(side) ? 'un achat' : 'une vente'} il doit être ${isBuy(side) ? 'au-dessus' : 'sous'} le prix d'entrée (${entry}).`);
}

function openPosition(acc, { side, entry, units, sl, tp, trail, time, symbol = null, tag = null }) {
  const pos = {
    id: acc.nextId++, side, units, units0: units, entry, sl: sl ?? null, sl0: sl ?? null, tp: tp ?? null,
    trail: trail ?? null, best: entry, openTime: time, symbol, tag,
  };
  acc.positions.push(pos);
  return pos;
}

/** Market order at the current bid. Returns the new position. Throws on an invalid order. */
export function placeMarket(acc, { side, bid, time, units, sl = null, tp = null, trail = null, symbol = null, tag = null }) {
  if (!(units > 0)) throw new Error('Taille nulle : indique une taille ou un risque et un stop.');
  const entry = entryAskOrBid(side, bid, spreadOf(acc, symbol));
  assertStops(side, entry, sl, tp);
  return openPosition(acc, { side, entry, units, sl, tp, trail, time, symbol, tag });
}

/**
 * Opens a position at an EXACT price (not the current bid): how an automatic strategy trade is entered - at
 * the entry price its own backtest used. A buy still pays the spread on top, like any buy.
 */
export function placeAtPrice(acc, { side, price, time, units, sl = null, tp = null, symbol = null, tag = null }) {
  if (!(units > 0)) throw new Error('Taille nulle.');
  const entry = isBuy(side) ? price + spreadOf(acc, symbol) : price;
  assertStops(side, entry, sl, tp);
  return openPosition(acc, { side, entry, units, sl, tp, trail: null, time, symbol, tag });
}

/** Limit or stop order that fills later. `price` is the fill price. Returns the pending order. */
export function placePending(acc, { side, type, price, bid, units, sl = null, tp = null, trail = null, symbol = null, tag = null }) {
  if (!(units > 0)) throw new Error('Taille nulle : indique une taille ou un risque et un stop.');
  if (type !== 'limit' && type !== 'stop') throw new Error('Type d\'ordre inconnu.');
  if (!(price > 0)) throw new Error('Prix de l\'ordre invalide.');
  const marketNow = entryAskOrBid(side, bid, spreadOf(acc, symbol));
  const below = price < marketNow;
  // buy limit / sell stop wait BELOW the market, buy stop / sell limit wait ABOVE it
  const shouldBeBelow = (isBuy(side) && type === 'limit') || (!isBuy(side) && type === 'stop');
  if (shouldBeBelow !== below) {
    throw new Error(`Prix invalide pour ${isBuy(side) ? 'un achat' : 'une vente'} ${type === 'limit' ? 'limite' : 'stop'} : il doit être ${shouldBeBelow ? 'sous' : 'au-dessus du'} prix actuel (${marketNow}).`);
  }
  assertStops(side, price, sl, tp);
  const order = { id: acc.nextId++, side, type, price, units, sl, tp, trail, symbol, tag };
  acc.pending.push(order);
  return order;
}

export function cancelPending(acc, id) {
  const i = acc.pending.findIndex((o) => o.id === id);
  if (i === -1) return false;
  acc.pending.splice(i, 1);
  return true;
}

const exitPrice = (side, bid, spread) => (isBuy(side) ? bid : bid + spread);
const pnlOf = (pos, exit, units, rate = 1) => (isBuy(pos.side) ? exit - pos.entry : pos.entry - exit) * units * rate;

function record(acc, pos, units, exit, time, reason) {
  const rate = rateOf(acc, pos.symbol);
  const pnl = pnlOf(pos, exit, units, rate);
  const risk = pos.sl0 != null ? Math.abs(pos.entry - pos.sl0) * units * rate : null;
  acc.balance += pnl;
  acc.history.push({
    id: pos.id, side: pos.side, units, entry: pos.entry, exit, openTime: pos.openTime, closeTime: time, pnl, symbol: pos.symbol ?? null, tag: pos.tag ?? null,
    r: risk && risk > 0 ? pnl / risk : null, reason,
  });
  return pnl;
}

/** Closes `fraction` (0-1] of a position at the current bid. Returns the realised P&L. */
export function closePosition(acc, id, { bid, time, fraction = 1, reason = 'manuel' }) {
  const i = acc.positions.findIndex((p) => p.id === id);
  if (i === -1) throw new Error('Position introuvable.');
  const pos = acc.positions[i];
  const f = Math.min(1, Math.max(0, fraction));
  if (!(f > 0)) throw new Error('Fraction à fermer invalide.');
  const units = f >= 0.9999 ? pos.units : pos.units * f;
  const pnl = record(acc, pos, units, exitPrice(pos.side, bid, spreadOf(acc, pos.symbol)), time, reason);
  if (f >= 0.9999) acc.positions.splice(i, 1);
  else pos.units -= units;
  return pnl;
}

export function closeAll(acc, { bid, bids = null, time }) {
  let total = 0;
  for (const p of [...acc.positions]) total += closePosition(acc, p.id, { bid: bids ? bids[p.symbol] : bid, time, reason: 'tout fermer' });
  acc.pending = [];
  return total;
}

/**
 * Edits a position's stop / target / trailing distance. A stop or target on the wrong side of the
 * ENTRY price is refused (it would close the trade at once for the wrong reason). null removes it.
 */
export function modifyPosition(acc, id, { sl, tp, trail }) {
  const pos = acc.positions.find((p) => p.id === id);
  if (!pos) throw new Error('Position introuvable.');
  if (sl !== undefined) {
    if (sl !== null && !(Number.isFinite(sl) && sl > 0)) throw new Error('Stop invalide.');
    // a stop past the entry is legitimate once the trade is in profit (locking gains), so only the CURRENT price side matters
    pos.sl = sl;
  }
  if (tp !== undefined) {
    if (tp !== null && !(Number.isFinite(tp) && tp > 0)) throw new Error('Objectif invalide.');
    pos.tp = tp;
  }
  if (trail !== undefined) pos.trail = trail;
  return pos;
}

/** Moves a pending order (price, stop, target); the price must stay on the same side of the market it was placed on. */
export function movePending(acc, id, { price, sl, tp, bid }) {
  const o = acc.pending.find((x) => x.id === id);
  if (!o) throw new Error('Ordre introuvable.');
  if (price !== undefined) {
    const marketNow = entryAskOrBid(o.side, bid, spreadOf(acc, o.symbol));
    const shouldBeBelow = (isBuy(o.side) && o.type === 'limit') || (!isBuy(o.side) && o.type === 'stop');
    if (!(price > 0) || (price < marketNow) !== shouldBeBelow) throw new Error(`Prix invalide : l'ordre doit rester ${shouldBeBelow ? 'sous' : 'au-dessus du'} prix actuel (${marketNow}).`);
    o.price = price;
  }
  if (sl !== undefined) o.sl = sl;
  if (tp !== undefined) o.tp = tp;
  assertStops(o.side, o.price, o.sl, o.tp);
  return o;
}

/** Moves the stop to the entry price (break-even). */
export function breakEven(acc, id) {
  const pos = acc.positions.find((p) => p.id === id);
  if (!pos) throw new Error('Position introuvable.');
  pos.sl = pos.entry;
  return pos;
}

export function floatingPnl(acc, bid) {
  return acc.positions.reduce((sum, p) => sum + pnlOf(p, exitPrice(p.side, bid, spreadOf(acc, p.symbol)), p.units, rateOf(acc, p.symbol)), 0);
}

export const equity = (acc, bid) => acc.balance + floatingPnl(acc, bid);

/** Floating P&L of one position at the given bid of ITS symbol. */
export function positionPnl(acc, p, bid) {
  return pnlOf(p, exitPrice(p.side, bid, spreadOf(acc, p.symbol)), p.units, rateOf(acc, p.symbol));
}

/** Floating P&L of every position, each priced at the bid of its own symbol (`bids` = {symbol: bid}). */
export function floatingPnlBids(acc, bids) {
  return acc.positions.reduce((sum, p) => (bids[p.symbol] === undefined ? sum : sum + positionPnl(acc, p, bids[p.symbol])), 0);
}

/** Adds a point to the equity curve (multi-pair replays call this once per clock step, not once per pair). */
export function recordEquity(acc, bids, time) {
  acc.equityCurve.push({ time, equity: acc.balance + floatingPnlBids(acc, bids), balance: acc.balance });
}

/**
 * Feeds one price candle (the simulation's base timeframe) through the account: pending orders
 * first, then stops/targets/trailing of the positions that were already open.
 * @param {{time:number, open:number, high:number, low:number, close:number}} c
 * @param {{onlyIds?: Set<number>}} [opts] onlyIds: judge just these positions (no order fills, no equity point) - used for a
 *   position opened AT this candle's open price, whose own candle can already hit its stop.
 * @returns {Array<{type:'filled'|'closed', id:number, ...}>}
 */
export function onCandle(acc, c, symbol, { onlyIds = null } = {}) {
  const events = [];
  const multi = symbol !== undefined; // a pair was named: only ITS positions/orders see this candle
  const sym = multi ? symbol : null;
  const s = spreadOf(acc, sym);
  const mine = (x) => !multi || (x.symbol ?? null) === sym;

  // 1) pending orders (positions they open are only checked from the next candle)
  const fresh = new Set();
  for (const o of [...acc.pending].filter(mine)) {
    if (onlyIds) break; // re-judging positions on the candle they were opened on: no order fills
    let fill = null;
    if (isBuy(o.side)) {
      const askLow = c.low + s, askHigh = c.high + s, askOpen = c.open + s;
      if (o.type === 'limit' && askLow <= o.price) fill = Math.min(o.price, askOpen);
      if (o.type === 'stop' && askHigh >= o.price) fill = Math.max(o.price, askOpen);
    } else {
      if (o.type === 'limit' && c.high >= o.price) fill = Math.max(o.price, c.open);
      if (o.type === 'stop' && c.low <= o.price) fill = Math.min(o.price, c.open);
    }
    if (fill == null) continue;
    acc.pending.splice(acc.pending.indexOf(o), 1);
    const pos = openPosition(acc, { side: o.side, entry: fill, units: o.units, sl: o.sl, tp: o.tp, trail: o.trail, time: c.time, symbol: o.symbol ?? null, tag: o.tag ?? null });
    fresh.add(pos.id);
    events.push({ type: 'filled', id: pos.id, side: o.side, price: fill, time: c.time, symbol: o.symbol ?? null });
  }

  // 2) stops, targets, trailing on positions opened on an EARLIER candle
  for (const pos of [...acc.positions].filter(mine)) {
    if (fresh.has(pos.id) || (onlyIds && !onlyIds.has(pos.id))) continue;
    const buy = isBuy(pos.side);
    // the stop is judged against the SL that stood at the START of the candle
    const hitSl = pos.sl != null && (buy ? c.low <= pos.sl : c.high + s >= pos.sl);
    const hitTp = pos.tp != null && (buy ? c.high >= pos.tp : c.low + s <= pos.tp);
    if (hitSl || hitTp) {
      let px;
      let reason;
      if (hitSl) { px = buy ? Math.min(pos.sl, c.open) : Math.max(pos.sl, c.open + s); reason = 'stop'; }
      else { px = pos.tp; reason = 'objectif'; }
      const pnl = record(acc, pos, pos.units, px, c.time, reason);
      acc.positions.splice(acc.positions.indexOf(pos), 1);
      events.push({ type: 'closed', id: pos.id, reason, price: px, pnl, time: c.time, symbol: pos.symbol ?? null, tag: pos.tag ?? null });
      continue;
    }
    if (pos.trail != null && pos.trail > 0) {
      pos.best = buy ? Math.max(pos.best, c.high) : Math.min(pos.best, c.low + s);
      const wanted = buy ? pos.best - pos.trail : pos.best + pos.trail;
      if (pos.sl == null || (buy ? wanted > pos.sl : wanted < pos.sl)) pos.sl = wanted;
    }
  }

  if (!multi && !onlyIds) acc.equityCurve.push({ time: c.time, equity: equity(acc, c.close), balance: acc.balance });
  return events;
}

/** Summary of the closed trades (R only where the trade had a stop when it opened). */
export function stats(acc) {
  const h = acc.history;
  const wins = h.filter((t) => t.pnl > 0).length;
  const withR = h.filter((t) => t.r !== null);
  let peak = acc.startBalance;
  let maxDd = 0;
  for (const p of acc.equityCurve) {
    peak = Math.max(peak, p.equity);
    maxDd = Math.max(maxDd, peak - p.equity);
  }
  return {
    trades: h.length,
    wins,
    winRate: h.length ? wins / h.length : null,
    netPnl: h.reduce((s, t) => s + t.pnl, 0),
    totalR: withR.reduce((s, t) => s + t.r, 0),
    tradesWithR: withR.length,
    avgR: withR.length ? withR.reduce((s, t) => s + t.r, 0) / withR.length : null,
    maxDrawdown: maxDd,
  };
}
