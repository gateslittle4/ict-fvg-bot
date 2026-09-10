import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairDealsIntoTrades, summarizeTrades, parseSourceFromLabel } from '../src/dataSources/dealPairing.js';

function opening({ positionId, symbolId = 1, tradeSide = 'BUY', executionPrice = 100, executionTimestamp = 1000, orderId }) {
  return { positionId, symbolId, tradeSide, executionPrice, executionTimestamp, orderId, dealStatus: 'FILLED' };
}
function closing({ positionId, symbolId = 1, tradeSide = 'SELL', executionPrice = 110, executionTimestamp = 2000, grossProfit = 500 }) {
  return {
    positionId,
    symbolId,
    tradeSide,
    executionPrice,
    executionTimestamp,
    dealStatus: 'FILLED',
    closePositionDetail: { grossProfit },
  };
}

test('pairs a simple opening+closing deal into one closed trade', () => {
  const deals = [opening({ positionId: 1 }), closing({ positionId: 1 })];
  const trades = pairDealsIntoTrades(deals);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, 'bullish');
  assert.equal(trades[0].entryPrice, 100);
  assert.equal(trades[0].exitPrice, 110);
  assert.equal(trades[0].pnl, 5); // 500 cents -> $5
});

test('a SELL opening produces a bearish trade', () => {
  const deals = [opening({ positionId: 1, tradeSide: 'SELL' }), closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals)[0].direction, 'bearish');
});

test('a position with only an opening deal (still open) is excluded', () => {
  const deals = [opening({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals).length, 0);
});

test('a position with only a closing deal (opening leg outside the fetch window) is excluded', () => {
  const deals = [closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals).length, 0);
});

test('multiple partial closing deals on the same position are summed into one journal entry', () => {
  const deals = [
    opening({ positionId: 1 }),
    closing({ positionId: 1, executionTimestamp: 1500, grossProfit: 200 }),
    closing({ positionId: 1, executionTimestamp: 2000, grossProfit: 300 }),
  ];
  const trades = pairDealsIntoTrades(deals);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].pnl, 5); // (200+300)/100
  assert.equal(trades[0].exitTime, 2000); // the LATEST partial close is used for exit price/time
});

test('rejected/missed deals are ignored', () => {
  const deals = [
    opening({ positionId: 1 }),
    { positionId: 1, dealStatus: 'REJECTED', closePositionDetail: { grossProfit: 999 } },
    closing({ positionId: 1 }),
  ];
  assert.equal(pairDealsIntoTrades(deals)[0].pnl, 5);
});

test('results are sorted newest-exit-first, across multiple positions', () => {
  const deals = [
    opening({ positionId: 1, executionTimestamp: 1000 }),
    closing({ positionId: 1, executionTimestamp: 2000 }),
    opening({ positionId: 2, executionTimestamp: 3000 }),
    closing({ positionId: 2, executionTimestamp: 4000 }),
  ];
  const trades = pairDealsIntoTrades(deals);
  assert.deepEqual(trades.map((t) => t.positionId), [2, 1]);
});

test('empty/undefined input returns no trades', () => {
  assert.deepEqual(pairDealsIntoTrades([]), []);
  assert.deepEqual(pairDealsIntoTrades(undefined), []);
});

test('parseSourceFromLabel: recognizes each auto-executed source', () => {
  assert.equal(parseSourceFromLabel('auto-fvg-US100'), 'fvg');
  assert.equal(parseSourceFromLabel('auto-divergence-US500'), 'divergence');
  assert.equal(parseSourceFromLabel('auto-nwog-US100'), 'nwog');
  assert.equal(parseSourceFromLabel('pyramid-add-US100'), 'pyramid');
});

test('parseSourceFromLabel: no label, empty label, or an unrecognized one all return null (never guessed)', () => {
  assert.equal(parseSourceFromLabel(undefined), null);
  assert.equal(parseSourceFromLabel(null), null);
  assert.equal(parseSourceFromLabel(''), null);
  assert.equal(parseSourceFromLabel('some manual comment'), null);
});

test('pairDealsIntoTrades: without an orderLabelsById map, source is null (never guessed)', () => {
  const deals = [opening({ positionId: 1, orderId: 42 }), closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals)[0].source, null);
});

test('pairDealsIntoTrades: looks up the OPENING deal\'s orderId in orderLabelsById to attach a source', () => {
  const deals = [opening({ positionId: 1, orderId: 42 }), closing({ positionId: 1 })];
  const labels = new Map([[42, 'auto-divergence-US500']]);
  assert.equal(pairDealsIntoTrades(deals, labels)[0].source, 'divergence');
});

test('pairDealsIntoTrades: an opening order missing from the label map (manual trade) gets source null', () => {
  const deals = [opening({ positionId: 1, orderId: 99 }), closing({ positionId: 1 })];
  const labels = new Map([[42, 'auto-fvg-US100']]); // a different order entirely
  assert.equal(pairDealsIntoTrades(deals, labels)[0].source, null);
});

test('summarizeTrades: mix of wins and losses', () => {
  const summary = summarizeTrades([{ pnl: 10 }, { pnl: -5 }, { pnl: 3 }, { pnl: 0 }]);
  assert.equal(summary.count, 4);
  assert.equal(summary.wins, 3); // pnl >= 0 counts as a win, including breakeven
  assert.equal(summary.winRatePct, 75);
  assert.equal(summary.netPnl, 8);
});

test('summarizeTrades: no trades gives a null win rate, not NaN or a divide-by-zero', () => {
  const summary = summarizeTrades([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.winRatePct, null);
  assert.equal(summary.netPnl, 0);
});

test('summarizeTrades: undefined input behaves like an empty list', () => {
  assert.deepEqual(summarizeTrades(undefined), { count: 0, wins: 0, winRatePct: null, netPnl: 0 });
});
