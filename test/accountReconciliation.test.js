import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichRealPosition, reconcileAccount, estimateEquity } from '../src/dataSources/accountReconciliation.js';

function realPosition(overrides = {}) {
  return {
    positionId: 1,
    tradeData: { symbolId: 100, volume: 10000, tradeSide: 'BUY', openTimestamp: 1000 }, // 10000 cents -> 100 units
    positionStatus: 'POSITION_STATUS_OPEN',
    swap: 0,
    price: 20000, // entry
    stopLoss: 19800,
    takeProfit: 20600,
    commission: 0,
    usedMargin: 5000, // moneyDigits default 2 -> $50
    moneyDigits: 2,
    ...overrides,
  };
}

test('enrichRealPosition: a bullish position with price above entry has positive gross floating P&L', () => {
  const enriched = enrichRealPosition(realPosition(), 20010); // +10 price move, 100 units
  assert.equal(enriched.direction, 'bullish');
  assert.equal(enriched.units, 100);
  assert.equal(enriched.usedMargin, 50);
  assert.ok(Math.abs(enriched.grossFloatingPnl - 1000) < 1e-9); // 10 * 100
  assert.ok(Math.abs(enriched.netFloatingPnl - 1000) < 1e-9); // no swap/commission
});

test('enrichRealPosition: a bearish (SELL) position profits when price falls', () => {
  const pos = realPosition({ tradeData: { symbolId: 100, volume: 10000, tradeSide: 'SELL', openTimestamp: 1000 } });
  const enriched = enrichRealPosition(pos, 19990); // price fell 10
  assert.equal(enriched.direction, 'bearish');
  assert.ok(Math.abs(enriched.grossFloatingPnl - 1000) < 1e-9); // short profits on a drop
});

test('enrichRealPosition: swap and commission (scaled by moneyDigits) are added into net floating P&L', () => {
  const pos = realPosition({ swap: -150, commission: -200, moneyDigits: 2 }); // -$1.50 swap, -$2.00 commission
  const enriched = enrichRealPosition(pos, 20010);
  assert.ok(Math.abs(enriched.swap - -1.5) < 1e-9);
  assert.ok(Math.abs(enriched.commission - -2) < 1e-9);
  assert.ok(Math.abs(enriched.netFloatingPnl - (1000 - 1.5 - 2)) < 1e-9);
});

test('enrichRealPosition: moneyDigits=8 scales swap/commission/usedMargin differently than the moneyDigits=2 default', () => {
  const pos = realPosition({ swap: 150000000, moneyDigits: 8 }); // 150000000 / 1e8 = $1.5
  const enriched = enrichRealPosition(pos, 20010);
  assert.ok(Math.abs(enriched.swap - 1.5) < 1e-9);
});

test('enrichRealPosition: no current price known yet -> floating P&L is null, not a wrong number', () => {
  const enriched = enrichRealPosition(realPosition(), undefined);
  assert.equal(enriched.grossFloatingPnl, null);
  assert.equal(enriched.netFloatingPnl, null);
  assert.equal(enriched.currentPrice, null);
});

const symbolNameById = new Map([[100, 'US100'], [200, 'XAUUSD']]);

test('reconcileAccount: sums margin and floating P&L across multiple real open positions', () => {
  const positions = [
    realPosition({ positionId: 1, usedMargin: 5000 }), // $50
    realPosition({ positionId: 2, tradeData: { symbolId: 200, volume: 5000, tradeSide: 'BUY', openTimestamp: 1000 }, price: 2000, usedMargin: 3000 }), // $30
  ];
  const result = reconcileAccount({
    realPositions: positions,
    symbolNameById,
    currentPriceBySymbol: { US100: 20010, XAUUSD: 2005 },
    believedOpenBySymbol: {},
  });
  assert.equal(result.positions.length, 2);
  assert.ok(Math.abs(result.marginUsedReal - 80) < 1e-9); // 50 + 30
  assert.equal(result.floatingPnlIsPartial, false);
  // US100: (20010-20000)*100=1000 ; XAUUSD: (2005-2000)*50=250
  assert.ok(Math.abs(result.floatingPnlEstimate - 1250) < 1e-9);
});

test('reconcileAccount: excludes non-open positions (e.g. POSITION_STATUS_CLOSED) from margin/P&L', () => {
  const positions = [realPosition({ positionStatus: 'POSITION_STATUS_CLOSED' })];
  const result = reconcileAccount({ realPositions: positions, symbolNameById, currentPriceBySymbol: { US100: 20010 } });
  assert.equal(result.positions.length, 0);
  assert.equal(result.marginUsedReal, 0);
});

test('reconcileAccount: marks floatingPnlIsPartial when a symbol has no known current price', () => {
  const positions = [realPosition()];
  const result = reconcileAccount({ realPositions: positions, symbolNameById, currentPriceBySymbol: {} });
  assert.equal(result.floatingPnlIsPartial, true);
  assert.equal(result.floatingPnlEstimate, 0);
});

test('reconcileAccount: reconciliation flags "match" when a real position exists AND the bot believes one is open', () => {
  const positions = [realPosition()];
  const result = reconcileAccount({
    realPositions: positions,
    symbolNameById,
    currentPriceBySymbol: { US100: 20010 },
    believedOpenBySymbol: { US100: true },
  });
  const us100 = result.reconciliation.find((r) => r.symbol === 'US100');
  assert.equal(us100.status, 'match');
});

test('reconcileAccount: reconciliation flags "real-only" when a broker position exists but the bot has no belief of it (e.g. a manual trade)', () => {
  const positions = [realPosition()];
  const result = reconcileAccount({
    realPositions: positions,
    symbolNameById,
    currentPriceBySymbol: { US100: 20010 },
    believedOpenBySymbol: {},
  });
  const us100 = result.reconciliation.find((r) => r.symbol === 'US100');
  assert.equal(us100.status, 'real-only');
});

test('reconcileAccount: reconciliation flags "believed-only" when the bot thinks a trade is open but nothing is actually open (alert probably not taken)', () => {
  const result = reconcileAccount({
    realPositions: [],
    symbolNameById,
    currentPriceBySymbol: {},
    believedOpenBySymbol: { US100: true },
  });
  const us100 = result.reconciliation.find((r) => r.symbol === 'US100');
  assert.equal(us100.status, 'believed-only');
  assert.equal(us100.realOpenCount, 0);
});

test('reconcileAccount: a symbol untouched by either side never appears in the reconciliation list', () => {
  const result = reconcileAccount({ realPositions: [], symbolNameById, believedOpenBySymbol: {} });
  assert.deepEqual(result.reconciliation, []);
});

test('estimateEquity: balance plus floating P&L, positive and negative', () => {
  assert.equal(estimateEquity(10000, 250), 10250);
  assert.equal(estimateEquity(10000, -150), 9850);
  assert.equal(estimateEquity(10000, 0), 10000);
  assert.equal(estimateEquity(10000, null), 10000);
});
