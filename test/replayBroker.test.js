import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, sizeFromRisk, placeMarket, placePending, cancelPending, closePosition, closeAll, modifyPosition, breakEven, floatingPnl, equity, onCandle, stats } from '../src/shared/replayBroker.js';

const c = (time, open, high, low, close = open) => ({ time, open, high, low, close });

test('sizeFromRisk: risks exactly the asked share of the balance between entry and stop', () => {
  assert.equal(sizeFromRisk({ balance: 10000, riskPct: 1, entry: 100, stop: 99 }), 100); // $100 risked over $1 = 100 units
  assert.equal(sizeFromRisk({ balance: 10000, riskPct: 1, entry: 100, stop: 100 }), 0);
  assert.equal(sizeFromRisk({ balance: 0, riskPct: 1, entry: 100, stop: 99 }), 0);
});

test('market buy pays the spread (fills at the ask), market sell fills at the bid', () => {
  const acc = createAccount({ balance: 1000, spread: 0.5 });
  assert.equal(placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1 }).entry, 100.5);
  assert.equal(placeMarket(acc, { side: 'sell', bid: 100, time: 0, units: 1 }).entry, 100);
});

test('closing right away costs the spread once: a buy closed at the same bid loses exactly the spread', () => {
  const acc = createAccount({ balance: 1000, spread: 0.5 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10 });
  closePosition(acc, p.id, { bid: 100, time: 1 });
  assert.equal(acc.balance, 1000 - 5);
  const s = placeMarket(acc, { side: 'sell', bid: 100, time: 2, units: 10 });
  closePosition(acc, s.id, { bid: 100, time: 3 }); // a sell exits at the ask
  assert.equal(acc.balance, 1000 - 10);
});

test('invalid stops and targets are refused with a clear message', () => {
  const acc = createAccount({ balance: 1000 });
  assert.throws(() => placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 101 }), /Stop invalide/);
  assert.throws(() => placeMarket(acc, { side: 'sell', bid: 100, time: 0, units: 1, tp: 101 }), /Objectif invalide/);
  assert.throws(() => placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 0 }), /Taille nulle/);
});

test('a position opened at the cursor is judged from the NEXT candle fed to the account', () => {
  const acc = createAccount({ balance: 1000 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 99 });
  onCandle(acc, c(1, 100, 100.5, 98)); // the next candle touches the stop -> stopped
  assert.equal(acc.positions.length, 0);
  assert.equal(acc.history[0].reason, 'stop');
  assert.equal(p.id, acc.history[0].id);
});

test('a pending order that fills on a candle is only judged for stop/target from the following candle', () => {
  const acc = createAccount({ balance: 1000 });
  placePending(acc, { side: 'buy', type: 'limit', price: 99, bid: 100, units: 1, sl: 98, tp: 101 });
  const ev = onCandle(acc, c(1, 100, 101.5, 97)); // fills at 99 AND the same candle spans both stop and target
  assert.deepEqual(ev.map((e) => e.type), ['filled']);
  assert.equal(acc.positions.length, 1);
  onCandle(acc, c(2, 100, 100.5, 99.5)); // next candle touches nothing
  assert.equal(acc.positions.length, 1);
});

test('when one candle touches both stop and target the STOP wins', () => {
  const acc = createAccount({ balance: 1000 });
  placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 99, tp: 102 });
  onCandle(acc, c(1, 100, 103, 98));
  assert.equal(acc.history[0].reason, 'stop');
  assert.equal(acc.history[0].exit, 99);
});

test('a target fills at its price; a stop gapped through fills at the open (worse)', () => {
  const acc = createAccount({ balance: 1000 });
  placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, tp: 102 });
  onCandle(acc, c(1, 101, 103, 100.5));
  assert.equal(acc.history[0].exit, 102);
  assert.equal(acc.history[0].reason, 'objectif');
  placeMarket(acc, { side: 'buy', bid: 100, time: 2, units: 1, sl: 99 });
  onCandle(acc, c(3, 97, 98, 96)); // gaps below the stop
  assert.equal(acc.history[1].exit, 97);
});

test('short positions: stop and target are judged on the ask (bid + spread)', () => {
  const acc = createAccount({ balance: 1000, spread: 1 });
  placeMarket(acc, { side: 'sell', bid: 100, time: 0, units: 1, sl: 102 });
  onCandle(acc, c(1, 100, 101.5, 99)); // high 101.5 + spread 1 = ask 102.5 >= stop 102
  assert.equal(acc.history[0].reason, 'stop');
  const acc2 = createAccount({ balance: 1000, spread: 1 });
  placeMarket(acc2, { side: 'sell', bid: 100, time: 0, units: 1, tp: 98 });
  onCandle(acc2, c(1, 100, 100.5, 96.9)); // low 96.9 + 1 = 97.9 <= 98
  assert.equal(acc2.history[0].reason, 'objectif');
  assert.ok(Math.abs(acc2.history[0].pnl - 2) < 1e-9);
});

test('pending orders: the right side of the market is enforced, fills happen at the price or the gap open', () => {
  const acc = createAccount({ balance: 1000 });
  assert.throws(() => placePending(acc, { side: 'buy', type: 'limit', price: 101, bid: 100, units: 1 }), /Prix invalide/);
  assert.throws(() => placePending(acc, { side: 'sell', type: 'limit', price: 99, bid: 100, units: 1 }), /Prix invalide/);
  placePending(acc, { side: 'buy', type: 'stop', price: 101, bid: 100, units: 1 });
  onCandle(acc, c(1, 103, 104, 102.5)); // gaps above the buy stop: fills at the open
  assert.equal(acc.positions[0].entry, 103);
  const o = placePending(acc, { side: 'sell', type: 'stop', price: 95, bid: 100, units: 1 });
  assert.equal(cancelPending(acc, o.id), true);
  assert.equal(cancelPending(acc, o.id), false);
});

test('partial close realises that part only and keeps the rest running; R is measured on the closed size', () => {
  const acc = createAccount({ balance: 1000 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10, sl: 99 });
  const pnl = closePosition(acc, p.id, { bid: 102, time: 1, fraction: 0.5 });
  assert.equal(pnl, 10); // 5 units x +2
  assert.equal(acc.positions[0].units, 5);
  assert.equal(acc.history[0].r, 2); // +2 on a 1-point stop
  closePosition(acc, p.id, { bid: 99, time: 2 });
  assert.equal(acc.positions.length, 0);
  assert.equal(acc.balance, 1000 + 10 - 5);
});

test('break-even moves the stop to the entry; a later pullback then exits flat', () => {
  const acc = createAccount({ balance: 1000 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 99 });
  breakEven(acc, p.id);
  onCandle(acc, c(1, 101, 101.5, 100.2));
  onCandle(acc, c(2, 100.4, 100.5, 99.8));
  assert.equal(acc.history[0].pnl, 0);
  assert.equal(acc.history[0].reason, 'stop');
});

test('trailing stop follows the best price and never loosens', () => {
  const acc = createAccount({ balance: 1000 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 98, trail: 1 });
  onCandle(acc, c(1, 100, 103, 100)); // best 103 -> stop 102
  assert.equal(acc.positions[0].sl, 102);
  onCandle(acc, c(2, 102.5, 103, 102.2)); // no new high: stop stays
  assert.equal(acc.positions[0].sl, 102);
  onCandle(acc, c(3, 102, 102.1, 101.5)); // pulls back through 102
  assert.equal(acc.positions.length, 0);
  assert.equal(acc.history[0].exit, 102);
  assert.equal(p.id, acc.history[0].id);
});

test('equity = balance + floating P&L at the current bid, and the curve records every candle', () => {
  const acc = createAccount({ balance: 1000, spread: 0.5 });
  placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10 });
  assert.equal(floatingPnl(acc, 102), (102 - 100.5) * 10);
  assert.equal(equity(acc, 102), 1015);
  onCandle(acc, c(1, 100, 102, 100, 102));
  assert.equal(acc.equityCurve.length, 1);
  assert.equal(acc.equityCurve[0].equity, 1015);
});

test('closeAll closes every position and clears pending orders; modifyPosition edits stop and target', () => {
  const acc = createAccount({ balance: 1000 });
  const a = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1 });
  placeMarket(acc, { side: 'sell', bid: 100, time: 0, units: 1 });
  placePending(acc, { side: 'buy', type: 'limit', price: 90, bid: 100, units: 1 });
  modifyPosition(acc, a.id, { sl: 95, tp: 110 });
  assert.equal(acc.positions[0].sl, 95);
  closeAll(acc, { bid: 100, time: 1 });
  assert.equal(acc.positions.length, 0);
  assert.equal(acc.pending.length, 0);
  assert.equal(acc.history.length, 2);
});

test('stats: win rate, net P&L, total R on trades that had a stop, and the deepest equity drawdown', () => {
  const acc = createAccount({ balance: 1000 });
  placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10, sl: 99, tp: 102 });
  onCandle(acc, c(1, 100, 102.5, 99.9, 102)); // +2 -> +20, r = +2
  placeMarket(acc, { side: 'buy', bid: 100, time: 2, units: 10, sl: 99 });
  onCandle(acc, c(3, 100, 100.2, 98.5, 99)); // stop: -10, r = -1
  placeMarket(acc, { side: 'buy', bid: 100, time: 4, units: 1 });
  closePosition(acc, acc.positions[0].id, { bid: 101, time: 5 }); // no stop: P&L counts, R does not
  const s = stats(acc);
  assert.equal(s.trades, 3);
  assert.equal(s.wins, 2);
  assert.equal(s.netPnl, 20 - 10 + 1);
  assert.equal(s.totalR, 1);
  assert.equal(s.tradesWithR, 2);
  assert.ok(s.maxDrawdown >= 10);
});

import { movePending } from '../src/shared/replayBroker.js';

test('modifyPosition: refuses a nonsense price, accepts null to remove a level, and allows a stop past the entry once in profit', () => {
  const acc = createAccount({ balance: 1000 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 99, tp: 105 });
  assert.throws(() => modifyPosition(acc, p.id, { sl: -1 }), /Stop invalide/);
  modifyPosition(acc, p.id, { sl: 101 }); // locking profit above the entry
  assert.equal(p.sl, 101);
  modifyPosition(acc, p.id, { tp: null });
  assert.equal(p.tp, null);
  assert.throws(() => modifyPosition(acc, 999, { sl: 1 }), /introuvable/);
});

test('movePending: the order stays on its side of the market and its stop/target stay coherent', () => {
  const acc = createAccount({ balance: 1000 });
  const o = placePending(acc, { side: 'buy', type: 'limit', price: 95, bid: 100, units: 1, sl: 90 });
  movePending(acc, o.id, { price: 97, bid: 100 });
  assert.equal(o.price, 97);
  assert.throws(() => movePending(acc, o.id, { price: 101, bid: 100 }), /Prix invalide/);
  assert.throws(() => movePending(acc, o.id, { sl: 98 }), /Stop invalide/); // stop above a buy limit's entry
  assert.throws(() => movePending(acc, 999, { price: 1, bid: 100 }), /introuvable/);
});

// --- currency conversion (P&L in the account currency) --------------------------------------------
test('conversion rate scales realised P&L, floating P&L and the balance', () => {
  const acc = createAccount({ balance: 1000, rate: 2 }); // 1 quote unit = 2 account units
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10 });
  assert.equal(floatingPnl(acc, 101), 20); // (101-100) x 10 x 2
  closePosition(acc, p.id, { bid: 101, time: 1 });
  assert.equal(acc.balance, 1020);
});

test('a moving rate converts at the rate of the day the trade closes', () => {
  const acc = createAccount({ balance: 1000, rate: 1 });
  const p = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10 });
  acc.rate = 0.5; // the account currency strengthened before the close
  closePosition(acc, p.id, { bid: 102, time: 1 });
  assert.equal(acc.balance, 1000 + 2 * 10 * 0.5);
});

test('risk sizing accounts for the rate: the same 1 % risk buys fewer units when each quote unit is worth more', () => {
  const at = (rate) => sizeFromRisk({ balance: 10000, riskPct: 1, entry: 100, stop: 99, rate });
  assert.equal(at(1), 100);
  assert.equal(at(2), 50);
  assert.equal(at(0.01), 10000); // e.g. a JPY-quoted pair: 1 JPY is worth ~0.0067 USD
  assert.equal(sizeFromRisk({ balance: 10000, riskPct: 1, entry: 100, stop: 99, rate: 0 }), 0);
});

test('the R multiple does not depend on the rate (a stop hit is -1R in any currency)', () => {
  const acc = createAccount({ balance: 10000, rate: 0.0067 });
  const units = sizeFromRisk({ balance: 10000, riskPct: 1, entry: 150, stop: 149, rate: 0.0067 });
  placeMarket(acc, { side: 'buy', bid: 150, time: 0, units, sl: 149 });
  onCandle(acc, { time: 1, open: 150, high: 150.1, low: 148.5, close: 148.6 });
  assert.equal(acc.history[0].r, -1);
  assert.ok(Math.abs(acc.history[0].pnl + 100) < 1e-6); // exactly the 1 % risked, in account currency
});

// --- several pairs on one account -----------------------------------------------------------------
import { placeAtPrice, positionPnl, floatingPnlBids, recordEquity } from '../src/shared/replayBroker.js';

function twoPairs() {
  const acc = createAccount({ balance: 10000 });
  acc.spreads = { AAA: 0.5, BBB: 0 };
  acc.rates = { AAA: 1, BBB: 2 };
  return acc;
}

test('a candle of one pair only moves the positions and orders of THAT pair', () => {
  const acc = twoPairs();
  placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 1, sl: 99, symbol: 'AAA' });
  placeMarket(acc, { side: 'buy', bid: 50, time: 0, units: 1, sl: 49, symbol: 'BBB' });
  onCandle(acc, { time: 1, open: 100, high: 100.5, low: 90, close: 91 }, 'AAA'); // AAA crashes
  assert.equal(acc.positions.length, 1);
  assert.equal(acc.positions[0].symbol, 'BBB'); // BBB untouched
  assert.equal(acc.history[0].symbol, 'AAA');
  assert.equal(acc.equityCurve.length, 0); // multi-pair mode: the page records equity once per clock step
});

test('each pair pays its own spread and converts at its own rate', () => {
  const acc = twoPairs();
  const a = placeMarket(acc, { side: 'buy', bid: 100, time: 0, units: 10, symbol: 'AAA' });
  const b = placeMarket(acc, { side: 'buy', bid: 50, time: 0, units: 10, symbol: 'BBB' });
  assert.equal(a.entry, 100.5); // AAA spread 0.5
  assert.equal(b.entry, 50); // BBB no spread
  assert.equal(positionPnl(acc, b, 51), 10 * 1 * 2); // rate 2
  assert.equal(floatingPnlBids(acc, { AAA: 101, BBB: 51 }), 5 + 20);
  closePosition(acc, b.id, { bid: 51, time: 1 });
  assert.equal(acc.balance, 10020);
  recordEquity(acc, { AAA: 101 }, 1);
  assert.equal(acc.equityCurve[0].equity, 10020 + 5);
});

test('closeAll closes each position at the bid of its own pair', () => {
  const acc = twoPairs();
  placeMarket(acc, { side: 'sell', bid: 100, time: 0, units: 1, symbol: 'AAA' });
  placeMarket(acc, { side: 'buy', bid: 50, time: 0, units: 1, symbol: 'BBB' });
  closeAll(acc, { bids: { AAA: 99, BBB: 52 }, time: 1 });
  const byId = Object.fromEntries(acc.history.map((h) => [h.symbol, h]));
  assert.equal(byId.AAA.exit, 99.5); // a sell exits at the ask: 99 + 0.5
  assert.equal(byId.BBB.exit, 52);
});

test('placeAtPrice enters at the given price (a buy still pays the spread), and keeps the tag on the history', () => {
  const acc = twoPairs();
  const p = placeAtPrice(acc, { side: 'buy', price: 100, time: 0, units: 1, sl: 99, tp: 103, symbol: 'AAA', tag: 'bot-fvg' });
  assert.equal(p.entry, 100.5);
  onCandle(acc, { time: 1, open: 100, high: 104, low: 100, close: 103 }, 'AAA');
  assert.equal(acc.history[0].tag, 'bot-fvg');
  assert.equal(acc.history[0].reason, 'objectif');
});

test('a pending order keeps its pair: it only fills on that pair\'s candles', () => {
  const acc = twoPairs();
  placePending(acc, { side: 'buy', type: 'limit', price: 95, bid: 100, units: 1, symbol: 'BBB' });
  onCandle(acc, { time: 1, open: 100, high: 100, low: 90, close: 91 }, 'AAA');
  assert.equal(acc.pending.length, 1);
  onCandle(acc, { time: 1, open: 100, high: 100, low: 90, close: 91 }, 'BBB');
  assert.equal(acc.pending.length, 0);
  assert.equal(acc.positions[0].symbol, 'BBB');
});
