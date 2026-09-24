import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichRealPosition, reconcileAccount, estimateEquity, computeStaleBeliefsToClear, computeRealOnlyPositionsToAdopt, computeMissingStopFixes } from '../src/dataSources/accountReconciliation.js';

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

// 2026-09-14 (Esdras: "creuse" a real position dashboard-displayed as
// stopLoss:null/unprotected - it had a real numeric stop, this broker just
// serializes SOME numeric protobuf fields as JSON strings, inconsistently
// per-field (confirmed 3 other times already this session: bid/ask,
// grossProfit, positionId/symbolId). A bare `typeof x === 'number'` guard
// silently reads a real "19800" as absent. Without the toNumberOrNull() fix
// this test fails: stopLoss/takeProfit/entryPrice/floating P&L all come
// back null despite every value being genuinely present.
test('enrichRealPosition: broker-serialized STRING price/stopLoss/takeProfit are read as real numbers, not silently treated as absent', () => {
  const pos = realPosition({ price: '20000', stopLoss: '19800', takeProfit: '20600' });
  const enriched = enrichRealPosition(pos, '20010');
  assert.equal(enriched.entryPrice, 20000);
  assert.equal(enriched.stopLoss, 19800);
  assert.equal(enriched.takeProfit, 20600);
  assert.equal(enriched.currentPrice, 20010);
  assert.ok(Math.abs(enriched.grossFloatingPnl - 1000) < 1e-9);
});

test('enrichRealPosition: a genuinely MISSING stopLoss/takeProfit (undefined) still reports null, not NaN', () => {
  const pos = realPosition({ stopLoss: undefined, takeProfit: undefined });
  const enriched = enrichRealPosition(pos, 20010);
  assert.equal(enriched.stopLoss, null);
  assert.equal(enriched.takeProfit, null);
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

// String keys - the real contract (see reconcileAccount's own JSDoc and
// cTraderDataSource.js's _loadSymbols, which always builds this map that
// way). realPosition()'s tradeData.symbolId stays a NUMBER throughout this
// file's fixtures - reconcileAccount's own String(...) on the lookup is what
// makes the two sides agree regardless.
const symbolNameById = new Map([['100', 'US100'], ['200', 'XAUUSD']]);

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

// BUG FOUND 2026-09-18 (execution-path audit continued, 4th confirmed site
// of the same class - see cTraderDataSource.js's symbolNameById fix and
// dealPairing.js's orderLabelsById fix for the other three): symbolNameById
// is built from ProtoOASymbolsListReq, but a real position's tradeData.symbolId
// comes from ProtoOAReconcileReq - a different message. This broker is
// confirmed to sometimes serialize the same conceptual int64 field
// differently depending on which message it came from. A mismatch here
// would silently mislabel a real, matching position as "symbolId:100" -
// which can NEVER line up with believedOpenBySymbol (keyed by the real
// symbol name), so a genuine match would misreport as believed-only AND
// real-only on two different, unmatched rows instead of one correct "match".
test('reconcileAccount: still reconciles as "match" when the real position\'s symbolId is a STRING against a numeric-looking map key', () => {
  const positions = [realPosition({ tradeData: { symbolId: '100', volume: 10000, tradeSide: 'BUY', openTimestamp: 1000 } })];
  const result = reconcileAccount({
    realPositions: positions,
    symbolNameById,
    currentPriceBySymbol: { US100: 20010 },
    believedOpenBySymbol: { US100: true },
  });
  assert.equal(result.reconciliation.length, 1, 'must resolve to the ONE real symbol, not a second unmatched "symbolId:100" row');
  const us100 = result.reconciliation.find((r) => r.symbol === 'US100');
  assert.ok(us100, 'the real position must resolve to the real symbol name');
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

// 2026-09-14, real bug found live: warm-up's bulk replay can reconstruct a
// "believed open" position that was NEVER submitted to the broker - left
// alone, it blocks every new real candidate on that symbol via netting for
// hours. computeStaleBeliefsToClear() is the decision logic behind
// cTraderDataSource.js's boot-time auto-fix for this.
const symbolIdByName = new Map([
  ['US100', 100],
  ['BTCUSD', 101],
]);

test('computeStaleBeliefsToClear: clears a belief with NO real position and NO pending order', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [],
    pendingOrders: [],
    symbols: ['BTCUSD'],
    symbolIdByName,
    getBelievedPosition: (s) => (s === 'BTCUSD' ? { id: 'BTCUSD-1' } : null),
  });
  assert.deepEqual(toClear, [{ symbol: 'BTCUSD', id: 'BTCUSD-1' }]);
});

test('computeStaleBeliefsToClear: leaves a belief alone when a REAL position backs it', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [{ tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    symbols: ['BTCUSD'],
    symbolIdByName,
    getBelievedPosition: (s) => (s === 'BTCUSD' ? { id: 'BTCUSD-1' } : null),
  });
  assert.deepEqual(toClear, []);
});

test('computeStaleBeliefsToClear: leaves a belief alone when a genuinely PENDING order backs it (must not clobber a real working LIMIT order)', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [],
    pendingOrders: [{ tradeData: { symbolId: 101 }, orderStatus: 'ORDER_STATUS_ACCEPTED' }],
    symbols: ['BTCUSD'],
    symbolIdByName,
    getBelievedPosition: (s) => (s === 'BTCUSD' ? { id: 'BTCUSD-1' } : null),
  });
  assert.deepEqual(toClear, []);
});

test('computeStaleBeliefsToClear: a non-ACCEPTED order (e.g. already filled/rejected) does NOT count as outstanding', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [],
    pendingOrders: [{ tradeData: { symbolId: 101 }, orderStatus: 'ORDER_STATUS_REJECTED' }],
    symbols: ['BTCUSD'],
    symbolIdByName,
    getBelievedPosition: (s) => (s === 'BTCUSD' ? { id: 'BTCUSD-1' } : null),
  });
  assert.deepEqual(toClear, [{ symbol: 'BTCUSD', id: 'BTCUSD-1' }]);
});

test('computeStaleBeliefsToClear: a symbol with no belief at all is simply skipped, not an error', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [],
    pendingOrders: [],
    symbols: ['US100', 'BTCUSD'],
    symbolIdByName,
    getBelievedPosition: () => null,
  });
  assert.deepEqual(toClear, []);
});

test('computeStaleBeliefsToClear: real/pending on ONE symbol never affects an unrelated symbol\'s stale belief', () => {
  const toClear = computeStaleBeliefsToClear({
    realPositions: [{ tradeData: { symbolId: 100 } }], // US100 is real
    pendingOrders: [],
    symbols: ['US100', 'BTCUSD'],
    symbolIdByName,
    getBelievedPosition: (s) => ({ id: `${s}-1` }), // both believe something is open
  });
  assert.deepEqual(toClear, [{ symbol: 'BTCUSD', id: 'BTCUSD-1' }]); // only the unbacked one clears
});

// 2026-09-14, real bug found live: a filled LIMIT order's position came
// back stopLoss:null with no working pending order behind it either (the
// broker's own contingent stop order had vanished) - nothing noticed until
// checked by hand via /api/admin/reconcile-raw. computeMissingStopFixes()
// is the decision logic behind cTraderDataSource.js's fix: resubmit the
// stop this process originally asked for, but only when it's truly missing
// and we actually know what to resubmit.
test('computeMissingStopFixes: flags a real open position with no stopLoss and no backing pending order', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: null, tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    getTrackedStopPrice: (id) => (id === '1' ? { stopPrice: 78069.5, takeProfit: 78827.5 } : null),
  });
  assert.deepEqual(toFix, [{ positionId: 1, symbolId: 101, stopPrice: 78069.5, takeProfit: 78827.5 }]);
});

test('computeMissingStopFixes: leaves a position alone when its stopLoss is already a real number', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: 78069.5, tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    getTrackedStopPrice: () => ({ stopPrice: 78069.5, takeProfit: null }),
  });
  assert.deepEqual(toFix, []);
});

test('computeMissingStopFixes: leaves a position alone when a genuinely working pending order still protects it', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: null, tradeData: { symbolId: 101 } }],
    pendingOrders: [{ positionId: 1, orderStatus: 'ORDER_STATUS_ACCEPTED' }],
    getTrackedStopPrice: () => ({ stopPrice: 78069.5, takeProfit: null }),
  });
  assert.deepEqual(toFix, []);
});

test('computeMissingStopFixes: a CANCELLED/EXPIRED pending order does not count as protection', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: null, tradeData: { symbolId: 101 } }],
    pendingOrders: [{ positionId: 1, orderStatus: 'ORDER_STATUS_CANCELLED' }],
    getTrackedStopPrice: () => ({ stopPrice: 78069.5, takeProfit: null }),
  });
  assert.deepEqual(toFix, [{ positionId: 1, symbolId: 101, stopPrice: 78069.5, takeProfit: null }]);
});

test('computeMissingStopFixes: a position this process never saw the entry of is left alone, not guessed', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: null, tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    getTrackedStopPrice: () => null, // this instance never observed this position's entry
  });
  assert.deepEqual(toFix, []);
});

test('computeMissingStopFixes: a broker-serialized STRING stopLoss (e.g. "78069.5") reads as present, not missing', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_OPEN', stopLoss: '78069.5', tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    getTrackedStopPrice: () => ({ stopPrice: 78069.5, takeProfit: null }),
  });
  assert.deepEqual(toFix, []);
});

test('computeMissingStopFixes: a non-open position (e.g. already closed) is never touched', () => {
  const toFix = computeMissingStopFixes({
    realPositions: [{ positionId: 1, positionStatus: 'POSITION_STATUS_CLOSED', stopLoss: null, tradeData: { symbolId: 101 } }],
    pendingOrders: [],
    getTrackedStopPrice: () => ({ stopPrice: 78069.5, takeProfit: null }),
  });
  assert.deepEqual(toFix, []);
});

// 2026-09-18, real bug found live (HANDOFF.md: "un redémarrage pendant
// qu'une position est ouverte fait perdre au bot sa propre trace du
// trade"): a real Silver Bullet GER40 position survived an unrelated
// deploy's restart, but LiveStrategyEngine.openPositions came back empty
// (in-memory only) - reconcileAccount() correctly LABELED this 'real-only',
// but nothing acted on that label. computeRealOnlyPositionsToAdopt() is the
// mirror image of computeStaleBeliefsToClear() above: it finds the real
// positions that need adopting BACK into tracking so netting stops
// believing the symbol is free.
test('computeRealOnlyPositionsToAdopt: a real open position with no belief is queued for adoption', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition()], // US100, bullish, entry 20000, stop 19800, target 20600
    symbolNameById,
    symbols: ['US100'],
    getBelievedPosition: () => null,
  });
  assert.deepEqual(toAdopt, [
    { symbol: 'US100', positionId: '1', direction: 'bullish', entryPrice: 20000, stopPrice: 19800, targetPrice: 20600, openTimestamp: 1000 },
  ]);
});

test('computeRealOnlyPositionsToAdopt: a symbol already believed open ("match") is never touched', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition()],
    symbolNameById,
    symbols: ['US100'],
    getBelievedPosition: (s) => (s === 'US100' ? { id: 'US100-1' } : null),
  });
  assert.deepEqual(toAdopt, []);
});

test('computeRealOnlyPositionsToAdopt: a real position on a symbol this engine does not track is skipped (nowhere safe to adopt into)', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition()], // US100
    symbolNameById,
    symbols: ['XAUUSD'], // this engine instance only tracks XAUUSD
    getBelievedPosition: () => null,
  });
  assert.deepEqual(toAdopt, []);
});

test('computeRealOnlyPositionsToAdopt: at most one adoption per symbol, even with two real positions stacked on it', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition({ positionId: 1 }), realPosition({ positionId: 2 })],
    symbolNameById,
    symbols: ['US100'],
    getBelievedPosition: () => null,
  });
  assert.equal(toAdopt.length, 1, 'LiveStrategyEngine can only ever track one belief per symbol');
});

test('computeRealOnlyPositionsToAdopt: a non-open position (e.g. already closed) is never adopted', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition({ positionStatus: 'POSITION_STATUS_CLOSED' })],
    symbolNameById,
    symbols: ['US100'],
    getBelievedPosition: () => null,
  });
  assert.deepEqual(toAdopt, []);
});

test('computeRealOnlyPositionsToAdopt: a broker-serialized STRING price/stopLoss/takeProfit reads as real numbers, same as enrichRealPosition', () => {
  const toAdopt = computeRealOnlyPositionsToAdopt({
    realPositions: [realPosition({ price: '20000', stopLoss: '19800', takeProfit: '20600' })],
    symbolNameById,
    symbols: ['US100'],
    getBelievedPosition: () => null,
  });
  assert.equal(toAdopt[0].entryPrice, 20000);
  assert.equal(toAdopt[0].stopPrice, 19800);
  assert.equal(toAdopt[0].targetPrice, 20600);
});

// --- 2026-09-23: journal self-heal and time-exit close ---
import { computeUntrackedPositionInfos, findBotPositionsToClose, sourceFromOrderLabel } from '../src/dataSources/accountReconciliation.js';

const US500_ID = '215';
const names = new Map([[US500_ID, 'US500']]);
// Shape observed live 2026-09-22 20:00 UTC (Divergence US500): stopLoss null on the position itself, protection on a linked order.
const livePosition = {
  positionId: '41759162',
  positionStatus: 'POSITION_STATUS_OPEN',
  price: 7774.7,
  stopLoss: null,
  takeProfit: null,
  tradeData: { symbolId: US500_ID, volume: '169', tradeSide: 'BUY', openTimestamp: '1790107202446', label: 'auto-divergence-US500' },
};
const protection = { orderId: '50615147', positionId: '41759162', stopLoss: 7755.21, takeProfit: 7832.15 };

test('sourceFromOrderLabel: reads the strategy from the bot label, null for anything else', () => {
  assert.equal(sourceFromOrderLabel('auto-divergence-US500', 'US500'), 'divergence');
  assert.equal(sourceFromOrderLabel('auto-rsi2-daily-US500', 'US500'), 'rsi2-daily');
  assert.equal(sourceFromOrderLabel('auto-divergence-US100', 'US500'), null);
  assert.equal(sourceFromOrderLabel('my manual trade', 'US500'), null);
  assert.equal(sourceFromOrderLabel(undefined, 'US500'), null);
});

test('computeUntrackedPositionInfos: after a restart, rebuilds an open position from broker data so its close is journaled with its R', () => {
  const [info] = computeUntrackedPositionInfos({ realPositions: [livePosition], pendingOrders: [protection], symbolNameById: names, symbols: ['US500'], getTrackedInfo: () => null });
  assert.equal(info.positionId, '41759162');
  assert.equal(info.source, 'divergence');
  assert.equal(info.direction, 'bullish');
  assert.equal(info.stopPrice, 7755.21);
  assert.equal(info.targetPrice, 7832.15);
  assert.ok(Math.abs(info.riskAmount - (7774.7 - 7755.21) * 1.69) < 1e-9); // units = volume / 100
  assert.equal(info.entryTime, 1790107202446);
});

test('computeUntrackedPositionInfos: skips positions already fully tracked, upgrades an adoption stub without its money-at-risk', () => {
  const args = { realPositions: [livePosition], pendingOrders: [protection], symbolNameById: names, symbols: ['US500'] };
  assert.deepEqual(computeUntrackedPositionInfos({ ...args, getTrackedInfo: () => ({ riskAmount: 33 }) }), []);
  const [upgraded] = computeUntrackedPositionInfos({ ...args, getTrackedInfo: () => ({ source: 'adopted', riskAmount: null }) });
  assert.equal(upgraded.source, 'divergence');
  assert.ok(upgraded.riskAmount > 0);
});

test('computeUntrackedPositionInfos: unknown stop or untracked symbol -> R unknown / skipped, never invented', () => {
  const [noStop] = computeUntrackedPositionInfos({ realPositions: [livePosition], pendingOrders: [], symbolNameById: names, symbols: ['US500'], getTrackedInfo: () => null });
  assert.equal(noStop.stopPrice, null);
  assert.equal(noStop.riskAmount, null);
  assert.deepEqual(computeUntrackedPositionInfos({ realPositions: [livePosition], pendingOrders: [], symbolNameById: names, symbols: ['US100'], getTrackedInfo: () => null }), []);
  const closed = { ...livePosition, positionStatus: 'POSITION_STATUS_CLOSED' };
  assert.deepEqual(computeUntrackedPositionInfos({ realPositions: [closed], pendingOrders: [], symbolNameById: names, symbols: ['US500'], getTrackedInfo: () => null }), []);
});

test("findBotPositionsToClose: only the bot's own position for that strategy and symbol, never a manual or adopted one", () => {
  const manual = { ...livePosition, positionId: '1', tradeData: { ...livePosition.tradeData, label: 'manual' } };
  const other = { ...livePosition, positionId: '2', tradeData: { ...livePosition.tradeData, label: 'auto-silverBullet-US500' } };
  assert.deepEqual(findBotPositionsToClose({ realPositions: [livePosition, manual, other], symbolId: 215, symbol: 'US500', source: 'divergence' }), [{ positionId: '41759162', volume: 169 }]);
  assert.deepEqual(findBotPositionsToClose({ realPositions: [livePosition], symbolId: 215, symbol: 'US500', source: 'adopted' }), []);
  assert.deepEqual(findBotPositionsToClose({ realPositions: [livePosition], symbolId: 999, symbol: 'US500', source: 'divergence' }), []);
});

test('computeUntrackedPositionInfos: a position this process tracks from its own fill, or one without the bot label, is never rebuilt', () => {
  const args = { realPositions: [livePosition], pendingOrders: [protection], symbolNameById: names, symbols: ['US500'] };
  assert.deepEqual(computeUntrackedPositionInfos({ ...args, getTrackedInfo: () => ({ source: 'divergence', stopPrice: 7755.21 }) }), []);
  const manual = { ...livePosition, tradeData: { ...livePosition.tradeData, label: 'manual' } };
  assert.deepEqual(computeUntrackedPositionInfos({ ...args, realPositions: [manual], getTrackedInfo: () => null }), []);
});

test('enrichRealPosition: exposes the order label the bot set (so the chart can name an A/B/RSI(2) position), null when absent', () => {
  const labeled = enrichRealPosition(realPosition({ tradeData: { symbolId: 100, volume: 10000, tradeSide: 'BUY', openTimestamp: 1000, label: 'auto-orb5-US100' } }), 20010);
  assert.equal(labeled.label, 'auto-orb5-US100');
  assert.equal(enrichRealPosition(realPosition(), 20010).label, null);
});
