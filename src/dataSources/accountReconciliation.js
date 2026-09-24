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

// 2026-09-14 (Esdras: "creuse" why a real position showed stopLoss:null on
// the dashboard - it wasn't actually unprotected, the field just failed a
// too-strict check): this broker serializes SOME numeric protobuf fields as
// JSON strings, inconsistently per-field (confirmed 3 separate times
// already this session: ProtoOASpotEvent's bid/ask, closePositionDetail's
// grossProfit, positionId/symbolId) - a bare `typeof x === 'number'` guard
// silently treats a real value like "76898" as absent. Converts but
// preserves the ORIGINAL "we genuinely don't have this" -> null semantics
// (unlike a bare Number(x), which would turn a truly-missing
// undefined/null into NaN instead of null).
function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

  const entryPrice = toNumberOrNull(position.price);
  const numericCurrentPrice = toNumberOrNull(currentPrice);

  let grossFloatingPnl = null;
  let netFloatingPnl = null;
  if (numericCurrentPrice !== null && entryPrice !== null) {
    const directionSign = direction === 'bullish' ? 1 : -1;
    grossFloatingPnl = (numericCurrentPrice - entryPrice) * units * directionSign;
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
    entryPrice,
    stopLoss: toNumberOrNull(position.stopLoss),
    takeProfit: toNumberOrNull(position.takeProfit),
    openTimestamp: position.tradeData?.openTimestamp ?? null,
    // 2026-09-24: the order label the bot set (`auto-<source>-<symbol>`), echoed back by the broker - lets the chart name a
    // position no combo engine tracks (A/B/RSI(2)). null for a manual or unlabeled position.
    label: position.tradeData?.label ?? null,
    usedMargin,
    swap,
    commission,
    currentPrice: numericCurrentPrice,
    grossFloatingPnl,
    netFloatingPnl,
    netFloatingPnlSignAssumed: true, // see module header tier 3 caveat
  };
}

/**
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position array (OPEN ones only are considered)
 * @param {Map<string,string>} symbolNameById - String(symbolId) -> symbol name.
 *   Keys MUST be String(symbolId) - see the lookup below for why a raw
 *   (unconverted) key silently breaks this on a broker that serializes the
 *   same conceptual int64 field differently across messages.
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
    // BUG FOUND 2026-09-18 (execution-path audit continued, 4th confirmed
    // site of this exact class - see cTraderDataSource.js's symbolNameById
    // fix and dealPairing.js's orderLabelsById fix for the other three):
    // symbolNameById is built once at boot from ProtoOASymbolsListReq, but
    // pos.tradeData?.symbolId comes from a DIFFERENT message,
    // ProtoOAReconcileReq - String(...) here, matching the map's own
    // String(...) keys at construction, so a mismatch never silently
    // degrades a real position into a "symbolId:213"-labeled unknown that
    // can't line up with the bot's own believedOpenBySymbol (keyed by the
    // real symbol name).
    const symbol = symbolNameById.get(String(pos.tradeData?.symbolId)) || `symbolId:${pos.tradeData?.symbolId}`;
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
    // believedOpenBySymbol[symbol] is the believed position's SOURCE string
    // (fvg/divergence/nwog/judasSwing) or null - kept as `source` below so
    // the dashboard can explain a mismatch precisely; botBelievesOpen stays
    // a plain boolean for the match/real-only/believed-only logic, which
    // only ever needed truthiness (a source string still passes an older
    // caller that sent a boolean here, e.g. an existing test).
    const source = believedOpenBySymbol[symbol] || null;
    const botBelievesOpen = Boolean(source);
    let status;
    if (realOpenCount > 0 && botBelievesOpen) status = 'match';
    else if (realOpenCount > 0 && !botBelievesOpen) status = 'real-only'; // a position exists at the broker the bot doesn't know about (manual trade, or the bot's belief already cleared)
    else if (realOpenCount === 0 && botBelievesOpen) status = 'believed-only'; // the bot thinks a trade should be open (an alert it fired) but nothing is actually open - most likely the alert wasn't taken
    else status = 'none';
    return { symbol, realOpenCount, botBelievesOpen, source, status };
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

/**
 * Pure decision logic behind cTraderDataSource.js's
 * _clearStaleBeliefsAgainstBroker() (2026-09-14, at Esdras's request after a
 * night of manually clearing this by hand) - separated out so it's testable
 * without a live/mocked broker connection, same discipline as
 * reconcileAccount() above.
 *
 * warmUp()'s bulk replay uses the SAME live netting check as real
 * processing, so it can reconstruct a "believed open" position from purely
 * historical data that was NEVER submitted to the broker - left alone, that
 * belief blocks every new real candidate on that symbol via netting until
 * it naturally times out (maxHoldingCandles, often hours) or someone clears
 * it by hand. A belief is only ever a false positive to clear here if
 * NEITHER a real open position NOR a genuinely pending order backs it -
 * checking pending orders too (not just positions) is what makes this safe
 * to run unattended: a real LIMIT order that just hasn't filled yet would
 * show up in `pendingOrders`, not `realPositions`, and must NOT be cleared
 * out from under it (that would let netting open a SECOND real order on
 * the same symbol once the first one eventually fills).
 *
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position array
 * @param {object[]} pendingOrders - raw ProtoOAReconcileRes.order array (only ORDER_STATUS_ACCEPTED entries count as genuinely outstanding)
 * @param {string[]} symbols - every symbol this account trades
 * @param {Map<string,number>} symbolIdByName
 * @param {(symbol: string) => {id: string}|null} getBelievedPosition - e.g. store.strategyEngine.getOpenPosition
 * @returns {{symbol: string, id: string}[]} beliefs to clear, in `symbols` order
 */
export function computeStaleBeliefsToClear({ realPositions, pendingOrders, symbols, symbolIdByName, getBelievedPosition }) {
  const outstandingSymbolIds = new Set();
  for (const pos of realPositions || []) {
    const sid = pos.tradeData?.symbolId;
    if (sid != null) outstandingSymbolIds.add(Number(sid));
  }
  for (const ord of pendingOrders || []) {
    if (ord.orderStatus && ord.orderStatus !== 'ORDER_STATUS_ACCEPTED') continue;
    const sid = ord.tradeData?.symbolId;
    if (sid != null) outstandingSymbolIds.add(Number(sid));
  }

  const toClear = [];
  for (const symbol of symbols || []) {
    const believed = getBelievedPosition(symbol);
    if (!believed) continue;
    const symbolId = symbolIdByName.get(symbol);
    if (symbolId != null && outstandingSymbolIds.has(Number(symbolId))) continue;
    toClear.push({ symbol, id: believed.id });
  }
  return toClear;
}

/**
 * Pure decision logic behind cTraderDataSource.js's _clearStaleBeliefsAgainstBroker()
 * ADOPTION step (2026-09-18, HANDOFF.md: "un redémarrage pendant qu'une
 * position est ouverte fait perdre au bot sa propre trace du trade") - the
 * mirror image of computeStaleBeliefsToClear() above. That one clears a
 * BELIEVED position with nothing real behind it; this one finds a REAL open
 * position with no belief behind it (reconcileAccount()'s 'real-only'
 * status - typically a position this process itself opened, then forgot
 * about across a restart, since LiveStrategyEngine.openPositions is
 * in-memory only) and returns what's needed to adopt it back into tracking,
 * so netting correctly blocks a SECOND position on the same symbol until
 * this one closes for real.
 *
 * At most one adoption per symbol - LiveStrategyEngine tracks a single
 * believed position per symbol (see its own openPositions comment), so a
 * symbol with more than one real open position (e.g. a manual trade stacked
 * on top of another) can only ever have ONE of them adopted; the rest stay
 * real-only, same as today - not a regression this introduces, just not
 * something a single-slot belief map can represent.
 *
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position array
 * @param {Map<string,string>} symbolNameById - String(symbolId) -> symbol name (see reconcileAccount's own param doc for why String(...) keys are mandatory)
 * @param {string[]} symbols - symbols this LiveStrategyEngine instance actually tracks - a real position on any other symbol has nowhere safe to be adopted into and is skipped
 * @param {(symbol: string) => object|null} getBelievedPosition - LiveStrategyEngine.getOpenPosition
 * @returns {{symbol: string, positionId: string, direction: 'bullish'|'bearish', entryPrice: number|null, stopPrice: number|null, targetPrice: number|null, openTimestamp: number|null}[]}
 */
export function computeRealOnlyPositionsToAdopt({ realPositions, symbolNameById, symbols, getBelievedPosition }) {
  const trackedSymbols = new Set(symbols || []);
  const queuedSymbols = new Set();
  const toAdopt = [];
  for (const pos of realPositions || []) {
    if (pos.positionStatus && pos.positionStatus !== 'POSITION_STATUS_OPEN') continue;
    const symbol = symbolNameById.get(String(pos.tradeData?.symbolId));
    if (!symbol || !trackedSymbols.has(symbol)) continue;
    if (getBelievedPosition(symbol)) continue; // already believed open - reconcileAccount would call this 'match', nothing to adopt
    if (queuedSymbols.has(symbol)) continue; // a real position on this symbol is already queued for adoption - see header
    queuedSymbols.add(symbol);
    const enriched = enrichRealPosition(pos, null);
    toAdopt.push({
      symbol,
      positionId: String(enriched.positionId),
      direction: enriched.direction,
      entryPrice: enriched.entryPrice,
      stopPrice: enriched.stopLoss,
      targetPrice: enriched.takeProfit,
      openTimestamp: enriched.openTimestamp,
    });
  }
  return toAdopt;
}

/**
 * Pure decision logic behind cTraderDataSource.js's stop-protection sweep
 * (2026-09-14, found live: a real BTCUSD position filled via a LIMIT order
 * came back from the broker with stopLoss:null AND a genuinely separate
 * pending stop order (a broker quirk - takeProfit attaches natively to the
 * position, stopLoss doesn't for this order type) - that separate order
 * later vanished (most likely a missed execution event across one of two
 * process restarts in the following minutes) with NOTHING noticing: the
 * existing 5-minute stale-belief sweep only checks whether a real position
 * OR pending order exists for netting purposes, never whether a real open
 * position's OWN protection is still intact. Confirmed live via
 * /api/admin/reconcile-raw: position.stopLoss null AND pendingOrders empty
 * for that positionId - a real position sat completely unprotected with no
 * self-healing, unlike every other belief/state gap fixed earlier tonight.
 *
 * A position only needs fixing when its OWN stopLoss field is missing AND
 * no pending order is linked to it (checked by `order.positionId`, per this
 * project's own vendored OpenApiModelMessages.proto - not a guess) - a
 * position whose stop lives as that kind of separate working order must
 * never be touched. `getTrackedStopPrice` returns null when this process
 * never observed this position's own entry (e.g. it was already open before
 * this instance booted) - there is nothing safe to resubmit without a real
 * stop level to use, so those are left alone rather than invented.
 *
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position array
 * @param {object[]} pendingOrders - raw ProtoOAReconcileRes.order array
 * @param {(positionId: string) => {stopPrice: number, takeProfit: number|null}|null} getTrackedStopPrice
 * @returns {{positionId: number, symbolId: number|null, stopPrice: number, takeProfit: number|null}[]}
 */
export function computeMissingStopFixes({ realPositions, pendingOrders, getTrackedStopPrice }) {
  const openPositions = (realPositions || []).filter(
    (p) => !p.positionStatus || p.positionStatus === 'POSITION_STATUS_OPEN'
  );
  const protectedPositionIds = new Set(
    (pendingOrders || [])
      .filter((o) => (!o.orderStatus || o.orderStatus === 'ORDER_STATUS_ACCEPTED') && o.positionId != null)
      .map((o) => String(o.positionId))
  );

  const toFix = [];
  for (const pos of openPositions) {
    if (toNumberOrNull(pos.stopLoss) !== null) continue; // already protected on the position itself
    const positionId = String(pos.positionId);
    if (protectedPositionIds.has(positionId)) continue; // a separate working stop order still exists
    const tracked = getTrackedStopPrice(positionId);
    if (!tracked || !Number.isFinite(tracked.stopPrice)) continue; // never observed this position's own entry - nothing safe to resubmit
    toFix.push({
      positionId: pos.positionId,
      symbolId: pos.tradeData?.symbolId ?? null,
      stopPrice: tracked.stopPrice,
      takeProfit: Number.isFinite(tracked.takeProfit) ? tracked.takeProfit : null,
    });
  }
  return toFix;
}

// Symbols whose P&L is in USD per unit of price move (units = volume / 100, see enrichRealPosition) - the only ones where a real
// position's money-at-risk can be rebuilt from the broker's own numbers without a currency conversion.
const isUsdQuoted = (symbol) => symbol === 'US100' || symbol === 'US500' || /USD$/.test(symbol);

/**
 * Strategy source encoded in the bot's own order label (`auto-<source>-<symbol>`, see cTraderDataSource._handleAutoExecuteEntry),
 * or null for anything else (a manual trade, another tool).
 */
export function sourceFromOrderLabel(label, symbol) {
  const m = typeof label === 'string' ? /^auto-(.+)-([^-]+)$/.exec(label) : null;
  return m && m[2] === symbol ? m[1] : null;
}

/**
 * 2026-09-24 (Esdras : « le trade est protégé si je déploie ? ») - the managed strategies (RSI(2) journalier, A ORB 5 min, B noise area)
 * track their real position in cTraderDataSource.dailyPositionBySymbol, in memory only. After a restart the map was empty: their exit
 * (RSI(2)'s SMA5/time-out, A's 15:59 close, B's 30-min checks) found nothing to close and was ignored, and the periodic sweep even
 * adopted the position into the combo engine as 'adopted'. Result: a position the strategy should have closed stayed open (overnight
 * for A/B) until its broker stop/target. Returns every open real position whose bot label names a managed source and that is not
 * tracked yet, with what the map needs ({ symbol, positionId, volumeCents, source }). Manual/unknown positions are never returned.
 */
export function computeManagedPositionsToRestore({ realPositions, symbolNameById, managedSources, isTracked }) {
  const out = [];
  for (const pos of realPositions || []) {
    if (pos.positionStatus && pos.positionStatus !== 'POSITION_STATUS_OPEN') continue;
    const symbol = symbolNameById.get(String(pos.tradeData?.symbolId));
    if (!symbol) continue;
    const source = sourceFromOrderLabel(pos.tradeData?.label, symbol);
    if (!source || !managedSources.has(source)) continue;
    if (isTracked(symbol, pos.positionId)) continue;
    const volumeCents = Number(pos.tradeData?.volume);
    if (!(volumeCents > 0)) continue;
    out.push({ symbol, positionId: pos.positionId, volumeCents, source });
  }
  return out;
}

/**
 * 2026-09-23 (Esdras: « rends le système très fiable ») - pure logic behind the journal self-heal. openPositionInfoByPositionId
 * (what lets a real close write its row, with its R, to bot_trade_events) lives in memory only: every restart while a position is
 * open used to lose it, so that trade's close was never journaled (found live: a Divergence US500 position open across the
 * 2026-09-23 00:44 UTC restart). Rebuilds it from the broker's own data for every open real position on a tracked symbol that
 * has no entry yet (bot-labelled positions only), or only an adoption stub without its money-at-risk: source from the bot's label, stop/target from the
 * position itself or its linked protection order, riskAmount = |entry - stop| x units (USD-quoted symbols only, else null so
 * the R reads as unknown rather than invented).
 *
 * @param {object[]} realPositions - raw ProtoOAReconcileRes.position
 * @param {object[]} pendingOrders - raw ProtoOAReconcileRes.order (a stop can live on a separate order linked by positionId)
 * @param {Map<string,string>} symbolNameById - String(symbolId) -> symbol name
 * @param {string[]} symbols - symbols this engine tracks
 * @param {(positionId: string) => object|null} getTrackedInfo - current openPositionInfoByPositionId entry, if any
 * @returns {{positionId: string, symbolName: string, source: string, direction: string, entryPrice: number|null, stopPrice: number|null, targetPrice: number|null, riskAmount: number|null, entryTime: number}[]}
 */
export function computeUntrackedPositionInfos({ realPositions, pendingOrders, symbolNameById, symbols, getTrackedInfo }) {
  const tracked = new Set(symbols || []);
  const out = [];
  for (const pos of realPositions || []) {
    if (pos.positionStatus && pos.positionStatus !== 'POSITION_STATUS_OPEN') continue;
    const symbolName = symbolNameById.get(String(pos.tradeData?.symbolId));
    if (!symbolName || !tracked.has(symbolName) || pos.positionId == null) continue;
    const positionId = String(pos.positionId);
    const existing = getTrackedInfo(positionId);
    // Already tracked from this process's own fill (it knows its risk and stop better than anything rebuilt): leave it alone.
    if (existing && (existing.riskAmount != null || existing.source !== 'adopted')) continue;
    const labelSource = sourceFromOrderLabel(pos.tradeData?.label, symbolName);
    if (!labelSource && !existing) continue; // not one of the bot's own positions (manual/unknown) - never journaled as ours
    const e = enrichRealPosition(pos, null);
    const linked = (pendingOrders || []).filter((o) => String(o?.positionId ?? o?.tradeData?.positionId) === positionId);
    const stopPrice = e.stopLoss ?? toNumberOrNull(linked.find((o) => o.stopLoss != null)?.stopLoss) ?? toNumberOrNull(linked.find((o) => o.stopPrice != null)?.stopPrice);
    const targetPrice = e.takeProfit ?? toNumberOrNull(linked.find((o) => o.takeProfit != null)?.takeProfit);
    const riskAmount = isUsdQuoted(symbolName) && e.entryPrice != null && stopPrice != null && e.units > 0 ? Math.abs(e.entryPrice - stopPrice) * e.units : null;
    const openedAt = Number(e.openTimestamp);
    out.push({
      positionId,
      symbolName,
      source: labelSource ?? existing?.source ?? 'adopted',
      direction: e.direction,
      entryPrice: e.entryPrice,
      stopPrice,
      targetPrice,
      riskAmount: riskAmount > 0 ? riskAmount : null,
      entryTime: Number.isFinite(openedAt) && openedAt > 0 ? openedAt : Date.now(),
    });
  }
  return out;
}

/**
 * 2026-09-23 - pure logic behind the time-exit close. LiveStrategyEngine times a position out after its maxHoldingCandles (the
 * backtests close it there), but live nothing ever closed the REAL position: it stayed open until its broker stop/target and kept
 * netting blocked on its symbol. Returns the bot's own open positions for that strategy on that symbol (matched by the exact
 * `auto-<source>-<symbol>` label and symbolId, so a manual or unknown-origin position is never touched).
 *
 * @returns {{positionId: string, volume: number}[]}
 */
export function findBotPositionsToClose({ realPositions, symbolId, symbol, source }) {
  if (!source || source === 'adopted') return [];
  const label = `auto-${source}-${symbol}`;
  return (realPositions || [])
    .filter((p) => (!p.positionStatus || p.positionStatus === 'POSITION_STATUS_OPEN') && p.tradeData?.label === label && Number(p.tradeData?.symbolId) === Number(symbolId) && p.positionId != null)
    .map((p) => ({ positionId: String(p.positionId), volume: Number(p.tradeData?.volume) }))
    .filter((p) => Number.isFinite(p.volume) && p.volume > 0);
}
