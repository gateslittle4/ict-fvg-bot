// accountReconciliation.js
// Pure helpers that turn cTrader's REAL broker-side account/position data
// (ProtoOATraderReq, ProtoOAReconcileReq - see cTraderDataSource.js) into an
// honest picture of "what does the account actually look like right now",
// and compare it against what LiveStrategyEngine BELIEVES is open (its own
// signal-driven model - see the "believed netting" caveat at the top of
// liveStrategyEngine.js).
//
// Discipline followed here (same as dealPairing.js): never invent a number
// the API doesn't give us. Three tiers of confidence, kept visibly separate
// rather than blended into one misleading "equity" figure:
//   1. REAL, broker-computed, no guessing at all: balance, each position's
//      usedMargin/swap/commission (scaled by the position's own moneyDigits
//      - see OpenApiModelMessages.proto), entry price, stop/target.
//   2. DERIVED from real data with one explicit, narrow, documented
//      assumption (deposit currency == quote currency - true for USD-
//      denominated FundingPips/FTMO accounts trading US100/US500/XAUUSD,
//      all USD-quoted): floating P&L from price movement, using
//      tradeData.volume (already in "cents of underlying units" - the same
//      convention _placeStopOrder() already uses when it builds that field:
//      volume = lots * lotSize * 100, so units = volume / 100). No lot-size
//      spec/table needed at all for this - unlike position SIZING
//      (lotCalculator.js), which DOES depend on the unverified
//      DEFAULT_SYMBOL_SPECS table, floating P&L here only needs the volume
//      the broker already reports on the real position.
//   3. ESTIMATE, explicitly labeled: "equity" (balance + floating P&L) and
//      the per-position net P&L (price P&L + swap + commission - the SIGN
//      convention of commission/swap as broker-reported amounts is assumed,
//      not confirmed against a real response yet - flagged below).
//
// "currentPrice" for the floating-P&L calc is whatever this process has
// most recently seen for that symbol (store.lastCandleBySymbol - updated on
// every live spot tick, not just closed M15 candles), NOT a fresh bid/ask
// snapshot taken at the moment of the request - close enough for a
// dashboard estimate, not precise enough to trade off of.

/**
 * @param {object} position - one ProtoOAReconcileRes.position entry
 * @param {number|null} currentPrice - most recently seen price for this position's symbol
 * @returns {{units: number, direction: 'bullish'|'bearish', usedMargin: number, swap: number, commission: number, grossFloatingPnl: number|null, netFloatingPnl: number|null}}
 */
export function enrichRealPosition(position, currentPrice) {
  const moneyDigits = position.moneyDigits ?? 2; // unset in a real response == cTrader's own default scale (cents) per OpenApiModelMessages.proto's moneyDigits doc
  const divisor = 10 ** moneyDigits;
  const usedMargin = (position.usedMargin || 0) / divisor;
  const swap = (position.swap || 0) / divisor;
  const commission = (position.commission || 0) / divisor;
  const direction = position.tradeData?.tradeSide === 'SELL' ? 'bearish' : 'bullish';
  const units = (position.tradeData?.volume || 0) / 100; // see module header - NOT a lots figure, real underlying units

  let grossFloatingPnl = null;
  let netFloatingPnl = null;
  if (typeof currentPrice === 'number' && typeof position.price === 'number') {
    const directionSign = direction === 'bullish' ? 1 : -1;
    grossFloatingPnl = (currentPrice - position.price) * units * directionSign;
    // Sign convention for swap/commission as broker-reported amounts is
    // ASSUMED (already signed, credit positive/cost negative), not yet
    // confirmed against a real live response - flag alongside the number
    // rather than silently trusting it (see netFloatingPnlSignAssumed below).
    netFloatingPnl = grossFloatingPnl + swap + commission;
  }

  return {
    positionId: position.positionId,
    symbolId: position.tradeData?.symbolId ?? null,
    direction,
    units,
    entryPrice: typeof position.price === 'number' ? position.price : null,
    stopLoss: typeof position.stopLoss === 'number' ? position.stopLoss : null,
    takeProfit: typeof position.takeProfit === 'number' ? position.takeProfit : null,
    openTimestamp: position.tradeData?.openTimestamp ?? null,
    usedMargin,
    swap,
    commission,
    currentPrice: typeof currentPrice === 'number' ? currentPrice : null,
    grossFloatingPnl,
    netFloatingPnl,
    netFloatingPnlSignAssumed: true, // see module header tier 3 caveat
  };
}

/**
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position array (OPEN ones only are considered)
 * @param {Map<number,string>} symbolNameById
 * @param {Record<string,number>} currentPriceBySymbol
 * @param {Record<string,boolean>} believedOpenBySymbol - symbol -> LiveStrategyEngine.getOpenPosition(symbol) !== null
 * @returns {{positions: object[], marginUsedReal: number, floatingPnlEstimate: number, floatingPnlIsPartial: boolean, reconciliation: object[]}}
 */
export function reconcileAccount({ realPositions, symbolNameById, currentPriceBySymbol = {}, believedOpenBySymbol = {} }) {
  const openPositions = (realPositions || []).filter(
    (p) => !p.positionStatus || p.positionStatus === 'POSITION_STATUS_OPEN'
  );

  const bySymbolCount = new Map();
  const enriched = [];
  let marginUsedReal = 0;
  let floatingPnlEstimate = 0;
  let floatingPnlIsPartial = false; // true if ANY open position's P&L couldn't be estimated (no current price known yet)

  for (const pos of openPositions) {
    const symbol = symbolNameById.get(pos.tradeData?.symbolId) || `symbolId:${pos.tradeData?.symbolId}`;
    const currentPrice = currentPriceBySymbol[symbol];
    const enrichedPos = enrichRealPosition(pos, currentPrice);
    enriched.push({ ...enrichedPos, symbol });

    marginUsedReal += enrichedPos.usedMargin;
    if (enrichedPos.netFloatingPnl === null) {
      floatingPnlIsPartial = true;
    } else {
      floatingPnlEstimate += enrichedPos.netFloatingPnl;
    }

    bySymbolCount.set(symbol, (bySymbolCount.get(symbol) || 0) + 1);
  }

  const allSymbols = new Set([...bySymbolCount.keys(), ...Object.keys(believedOpenBySymbol)]);
  const reconciliation = [...allSymbols].sort().map((symbol) => {
    const realOpenCount = bySymbolCount.get(symbol) || 0;
    const botBelievesOpen = Boolean(believedOpenBySymbol[symbol]);
    let status;
    if (realOpenCount > 0 && botBelievesOpen) status = 'match';
    else if (realOpenCount > 0 && !botBelievesOpen) status = 'real-only'; // a position exists at the broker the bot doesn't know about (manual trade, or the bot's belief already cleared)
    else if (realOpenCount === 0 && botBelievesOpen) status = 'believed-only'; // the bot thinks a trade should be open (an alert it fired) but nothing is actually open - most likely the alert wasn't taken
    else status = 'none';
    return { symbol, realOpenCount, botBelievesOpen, status };
  });

  return { positions: enriched, marginUsedReal, floatingPnlEstimate, floatingPnlIsPartial, reconciliation };
}

/**
 * @param {number} balance - real account balance (already scaled, see cTraderDataSource.js's _loadBalance)
 * @param {number} floatingPnlEstimate
 * @returns {number}
 */
export function estimateEquity(balance, floatingPnlEstimate) {
  return balance + (floatingPnlEstimate || 0);
}
