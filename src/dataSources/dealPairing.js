// dealPairing.js
// Pure helper: turns cTrader's flat ProtoOADealListReq response (one entry
// per EXECUTION, not per trade) into one record per CLOSED round-trip trade,
// for the trading journal (see server.js's GET /api/trade-history).
//
// Deliberately does NOT attempt to recover the planned stop-loss/take-profit
// of a closed position - ProtoOADealListReq doesn't carry it, and there is
// no other documented way to fetch a historical (already-closed) position's
// SL/TP after the fact. Rather than guess or reconstruct one, the journal
// only shows what's directly verifiable from the deal record itself: entry,
// exit, direction, and realized P&L.

/**
 * @param {object[]} deals - raw `deal` array from ProtoOADealListReq
 * @returns {object[]} one entry per CLOSED position, newest first: {
 *   positionId, symbolId, direction: 'bullish'|'bearish',
 *   entryPrice, entryTime, exitPrice, exitTime, pnl
 * }
 */
export function pairDealsIntoTrades(deals) {
  const byPosition = new Map();
  for (const deal of deals || []) {
    if (deal.dealStatus && deal.dealStatus !== 'FILLED') continue; // skip rejected/missed executions
    const group = byPosition.get(deal.positionId) || [];
    group.push(deal);
    byPosition.set(deal.positionId, group);
  }

  const trades = [];
  for (const [positionId, group] of byPosition) {
    const opening = group.find((d) => !d.closePositionDetail);
    // A position can be closed in several partial deals - take the LAST one
    // (highest executionTimestamp) as "the" close for a single journal entry.
    const closings = group.filter((d) => d.closePositionDetail);
    if (!opening || closings.length === 0) continue; // still open, or opening leg outside our fetch window
    const closing = closings.reduce((a, b) => (b.executionTimestamp > a.executionTimestamp ? b : a));

    trades.push({
      positionId,
      symbolId: opening.symbolId,
      direction: opening.tradeSide === 'SELL' ? 'bearish' : 'bullish',
      entryPrice: opening.executionPrice,
      entryTime: opening.executionTimestamp,
      exitPrice: closing.executionPrice,
      exitTime: closing.executionTimestamp,
      pnl: closings.reduce((sum, d) => sum + (d.closePositionDetail.grossProfit || 0), 0) / 100,
    });
  }

  return trades.sort((a, b) => b.exitTime - a.exitTime);
}

/**
 * @param {object[]} trades - output of pairDealsIntoTrades()
 * @returns {{count: number, wins: number, winRatePct: number|null, netPnl: number}}
 */
export function summarizeTrades(trades) {
  const list = trades || [];
  const wins = list.filter((t) => t.pnl >= 0).length;
  const netPnl = list.reduce((sum, t) => sum + t.pnl, 0);
  return {
    count: list.length,
    wins,
    winRatePct: list.length > 0 ? (wins / list.length) * 100 : null,
    netPnl,
  };
}
