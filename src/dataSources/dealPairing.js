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
//
// Source attribution (2026-09, at Esdras's request - "aucun screenshot ne
// dit quelle strategie a genere le trade"): every auto-executed entry order
// carries a label of the form `auto-<source>-<symbol>` (set in
// cTraderDataSource.js's _handleAutoExecuteEntry), and every pyramid add-on
// carries `pyramid-add-<symbol>`. ProtoOADeal itself has no label - only
// ProtoOAOrder.tradeData.label does - so the caller (getTradeHistory) fetches
// orders for the same window (ProtoOAOrderListReq) and passes an
// orderId->label map here. A trade whose opening order has no label at all
// (placed by hand, semi-automatic mode) or an unrecognized one is marked
// source: null - NEVER guessed as one of the known strategies.

// BUG FOUND 2026-09-18 (while building journal.html's strategy bar chart -
// a synthetic CBDR row rendered as "manuel/inconnu"): cbdr was missing here
// even though it went live on US100 today (see HANDOFF.md). Same gap found
// in EVERY downstream source-label site in this project (dashboard,
// journal, notification text, trade-compliance checklist, live-mechanism
// status) - cbdr existed only in liveStrategyEngine.js, its actual signal
// source, and nowhere a human-facing label is built from it. Fixed
// everywhere in the same pass as this file, following the exact same
// per-mechanism replication this project already did for NWOG/Judas Swing/
// Weekly Sweep/Breaker Block/Silver Bullet when each of those went live.
const LABEL_SOURCE_RE = /^auto-(fvg|divergence|nwog|judaswing|weeklysweep|breakerblock|silverbullet|cbdr)-/;

/** @returns {string|null} 'fvg'|'divergence'|'nwog'|'judaswing'|'weeklysweep'|'breakerblock'|'silverbullet'|'cbdr'|'pyramid', or null if the label doesn't identify a known source */
export function parseSourceFromLabel(label) {
  if (!label) return null;
  const m = LABEL_SOURCE_RE.exec(label);
  if (m) return m[1];
  if (label.startsWith('pyramid-add-')) return 'pyramid';
  return null;
}

/**
 * @param {object[]} deals - raw `deal` array from ProtoOADealListReq
 * @param {Map<string, string>} [orderLabelsById] - String(orderId) -> ProtoOAOrder.tradeData.label,
 *   from ProtoOAOrderListReq over the same window. Keys MUST be String(orderId) -
 *   see cTraderDataSource.js's getTradeHistory(), and the 2026-09-18 fix
 *   comment on the lookup below for why a raw (unconverted) key silently
 *   breaks source attribution on this broker.
 * @returns {object[]} one entry per CLOSED position, newest first: {
 *   positionId, symbolId, direction: 'bullish'|'bearish',
 *   entryPrice, entryTime, exitPrice, exitTime, pnl, source: string|null
 * }
 */
export function pairDealsIntoTrades(deals, orderLabelsById) {
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

    // Number(...) everywhere executionTimestamp/grossProfit are used (2026-09-13,
    // real bug found live via the trade journal showing "Invalid Date" and
    // every trade as a "win" with net P&L stuck at +0.00): this broker
    // serializes int64 fields (timestamps, ids, volumes) as JSON STRINGS,
    // confirmed via a raw ProtoOAExecutionEvent dump the same session (see
    // cTraderDataSource.js's _submitOrder/_waitForOrderIdBySymbol comments).
    // `>` on two equal-length numeric strings happens to sort correctly
    // (lexicographic order matches numeric order), so this specific
    // comparison was never actually wrong - normalized anyway for safety
    // since nothing here should depend on that coincidence. The real
    // breakage was `sum + (d.closePositionDetail.grossProfit || 0)`: with a
    // string grossProfit, `+` performs STRING CONCATENATION, not addition
    // ("0" + "-19" -> "0-19"), so the result was NaN once divided by 100 -
    // which JSON.stringify silently turns into `null` on the wire, and
    // `null >= 0` is TRUE in JS, so every trade's pnl looked like a "win"
    // client-side despite being unparseable. entryTime/exitTime stored as
    // raw strings also broke `new Date(...)` on the dashboard directly
    // ("Invalid Date") - Date() does NOT treat a numeric string as an epoch
    // number the way arithmetic operators do.
    const closing = closings.reduce((a, b) => (Number(b.executionTimestamp) > Number(a.executionTimestamp) ? b : a));
    // BUG FOUND 2026-09-18 (execution-path audit continued): String(...) on
    // the lookup key, not the raw opening.orderId. orderLabelsById is built
    // from ProtoOAOrderListReq's response (see cTraderDataSource.js's
    // getTradeHistory) but looked up here with a DEAL's orderId, which comes
    // from ProtoOADealListReq - a different message. This broker is
    // confirmed (repeatedly, this session) to serialize the same conceptual
    // int64 field as a string or a number depending on which message it came
    // from - orderLabelsById's own keys are normalized with the SAME
    // String(...) at construction time (see cTraderDataSource.js), so both
    // sides now agree regardless of either message's actual serialization.
    const label = orderLabelsById ? orderLabelsById.get(String(opening.orderId)) : undefined;

    trades.push({
      positionId,
      symbolId: opening.symbolId,
      direction: opening.tradeSide === 'SELL' ? 'bearish' : 'bullish',
      entryPrice: opening.executionPrice,
      entryTime: Number(opening.executionTimestamp),
      exitPrice: closing.executionPrice,
      exitTime: Number(closing.executionTimestamp),
      pnl: closings.reduce((sum, d) => sum + Number(d.closePositionDetail.grossProfit || 0), 0) / 100,
      source: parseSourceFromLabel(label),
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
