// reconciliation.js - méthodes de CTraderDataSource (src/dataSources/cTraderDataSource.js), découpées le 2026-09-24 sans changement de
// comportement. Suivi des positions : rapprochement bot / courtier, nettoyage des positions « crues », reprise des positions gérées.
// Rattachées à la classe par Object.assign(CTraderDataSource.prototype, ...) : `this` est l'instance, comme avant.

import { reconcileAccount, estimateEquity, computeStaleBeliefsToClear, computeRealOnlyPositionsToAdopt, computeManagedPositionsToRestore, computeMissingStopFixes, computeUntrackedPositionInfos } from '../accountReconciliation.js';

import { DAILY_RSI2_STRATEGY, MANAGED_SOURCES } from '../../execution/entryPolicy.js';

import { sendCommandWithTimeout } from './shared.js';

export const reconciliationMethods = {

  /**
   * Real account picture, at the user's request after confirming the
   * dashboard's own "openPosition" state is only ever LiveStrategyEngine's
   * belief (its own signals), never a reconciled mirror of the real broker
   * account (see liveStrategyEngine.js's "believed netting" caveat). Fetched
   * live on each call (like getTradeHistory() above), not cached - a
   * ProtoOAReconcileReq is lightweight, unlike the 90-day candle warm-up.
   * All the actual math (what's REAL vs ESTIMATED, and why) lives in
   * accountReconciliation.js - this method only gathers the live inputs.
   */
  async getAccountReconciliation() {
    const store = this.account;
    const accountId = this.accountId;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(accountId),
    });

    const currentPriceBySymbol = {};
    for (const [symbol, candle] of store.lastCandleBySymbol) {
      currentPriceBySymbol[symbol] = candle.close;
    }
    // The believed-open SOURCE (fvg/divergence/nwog/judasSwing), not just a
    // boolean - reconcileAccount() below only needs truthiness for
    // botBelievesOpen (a string is truthy), but carrying the source through
    // lets the dashboard explain a "believed-only" mismatch precisely
    // (e.g. an FVG LIMIT order that never got a fill, vs a MARKET-order
    // source where "believed-only" is a real submission problem worth
    // checking - see _handleAutoExecuteEntry()'s own order-type comment).
    const believedOpenBySymbol = {};
    for (const symbol of this.symbols) {
      believedOpenBySymbol[symbol] = store.strategyEngine.getOpenPosition(symbol)?.source ?? null;
    }

    const result = reconcileAccount({
      realPositions: res.position || [],
      symbolNameById: this.symbolNameById,
      currentPriceBySymbol,
      believedOpenBySymbol,
    });

    const pendingOrders = (res.order || []).map((order) => ({
      orderId: order.orderId ?? null,
      symbolId: order.tradeData?.symbolId ?? order.symbolId ?? null,
      symbol: this.symbolNameById.get(String(order.tradeData?.symbolId ?? order.symbolId)) || null,
      orderType: order.orderType ?? null,
      tradeSide: order.tradeData?.tradeSide ?? order.tradeSide ?? null,
      volume: order.tradeData?.volume ?? order.volume ?? null,
      label: order.tradeData?.label ?? order.label ?? null,
    }));

    return { ...result, pendingOrders, balance: store.balance, equityEstimate: estimateEquity(store.balance, result.floatingPnlEstimate) };
  },

  /**
   * Boot-time auto-fix (2026-09-14, at Esdras's explicit request after a
   * night of manually clearing this by hand via /admin/clear-believed-position):
   * warmUp()'s bulk replay uses the SAME live netting check as real
   * processing, so it can reconstruct a "believed open" position from
   * purely historical data - never submitted to the broker. Until now that
   * belief just sat there (up to maxHoldingCandles, hours) blocking every
   * new real candidate on that symbol via netting, and the only fix was a
   * manual admin call.
   *
   * Runs once per boot, right after every symbol has been through
   * warmUp() (see start()), and asks the broker directly - via the SAME
   * ProtoOAReconcileReq the dashboard's /api/account reconciliation
   * uses - what's REALLY outstanding for each symbol: not just open
   * positions (`res.position`), but PENDING orders too (`res.order` -
   * confirmed via this project's own vendored OpenApiMessages.proto:
   * "The list of trader's account pending orders", not a guess). A belief
   * only gets auto-cleared when NEITHER exists for that symbol - so a
   * genuinely working LIMIT order that just hasn't filled yet (which
   * would show up in `res.order`, not `res.position`) is correctly left
   * alone, unlike a naive "real position count == 0" check would.
   *
   * Deliberately does NOT touch anything real (never calls
   * ProtoOACancelOrderReq/ProtoOAClosePositionReq) - only clears the
   * engine's own in-memory bookkeeping, exactly like the manual admin
   * endpoint already did, just automatically instead of requiring a human
   * to notice and act.
   */
  async _clearStaleBeliefsAgainstBroker(accountId) {
    const store = this.account;
    let res;
    try {
      res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
        ctidTraderAccountId: Number(accountId),
      });
    } catch (err) {
      // Best-effort - a failed reconcile must never block boot. Any stale
      // belief left behind here can still be cleared manually as before,
      // or will resolve on its own once maxHoldingCandles elapses.
      console.warn('[cTrader] stale-belief reconcile failed (non-fatal, boot continues):', err.message);
      return;
    }
    // The actual decision (which symbols to clear) is a pure function in
    // accountReconciliation.js, unit-tested there without needing a live
    // connection - this method is just the thin live-data wiring.
    const toClear = computeStaleBeliefsToClear({
      realPositions: res.position || [],
      pendingOrders: res.order || [],
      symbols: this.symbols,
      symbolIdByName: this.symbolIdByName,
      getBelievedPosition: (symbol) => store.strategyEngine.getOpenPosition(symbol),
    });
    for (const { symbol, id } of toClear) {
      const cleared = store.strategyEngine.clearBelievedPosition(symbol, id);
      if (cleared) {
        console.log(`[cTrader] cleared stale believed-open position on boot: ${symbol} id=${id} (no matching real position or pending order at the broker)`);
      }
    }

    // 2026-09-18 (HANDOFF.md: "un redémarrage pendant qu'une position est
    // ouverte fait perdre au bot sa propre trace du trade") - the mirror
    // image of the toClear loop above. A real GER40 position (Silver
    // Bullet) was found open at the broker with reconcileAccount() already
    // reporting botBelievesOpen:false/source:null ('real-only') after an
    // unrelated deploy restarted this process mid-trade - netting had no
    // way to know GER40 was occupied and could have opened a second
    // position on top of it. computeRealOnlyPositionsToAdopt() (pure,
    // tested separately) decides WHICH real positions qualify;
    // adoptExternalPosition() (liveStrategyEngine.js) is what actually
    // re-registers one into openPositions. Also mirrors
    // openPositionInfoByPositionId so the eventual real close still writes
    // a durable journal row (source:'adopted', riskAmount:null -> rMultiple
    // reads as null rather than a fabricated number - see
    // _handleExecutionEvent's own use of this map).
    // 2026-09-24: a real position held by a MANAGED_SOURCES strategy (RSI(2)/A/B) is not "real-only" - never adopt it into the combo
    // engine (that relabelled its journal row 'adopted' and hid its close from the managed tracking).
    // 2026-09-24 - restore first (see computeManagedPositionsToRestore): after a restart, a real RSI(2)/A/B position is tracked again
    // by its own strategy (so its exit is really sent) instead of being adopted by the combo below.
    for (const r of computeManagedPositionsToRestore({
      realPositions: res.position || [],
      symbolNameById: this.symbolNameById,
      managedSources: MANAGED_SOURCES,
      isTracked: (symbol, positionId) => this.dailyPositionBySymbol.has(symbol) || [...this.dailyPositionBySymbol.values()].some((p) => String(p.positionId) === String(positionId)),
    })) {
      this.dailyPositionBySymbol.set(r.symbol, { positionId: r.positionId, volumeCents: r.volumeCents, source: r.source, at: Date.now() });
      // The combo engine may have adopted it before this fix existed in the running process (or before this sweep): release that belief.
      const believed = store.strategyEngine.getOpenPosition(r.symbol);
      if (believed?.source === 'adopted') store.strategyEngine.clearBelievedPosition(r.symbol, believed.id);
      console.warn(`[cTrader] position ${r.source} ${r.symbol} (positionId=${r.positionId}) reprise en suivi après redémarrage - sa sortie sera bien envoyée.`);
    }
    // ...and the mirror case: a tracked managed position that no longer exists at the broker (its close confirmation was missed - a
    // disconnect at the wrong moment) would block the symbol for EVERY strategy until the next restart (mutual exclusion). Dropped here,
    // only when tracked for more than 2 minutes (a fill confirmed after this reconcile request was sent must not be dropped).
    const openIds = new Set((res.position || []).filter((p) => !p.positionStatus || p.positionStatus === 'POSITION_STATUS_OPEN').map((p) => String(p.positionId)));
    for (const [symbol, held] of this.dailyPositionBySymbol) {
      if (openIds.has(String(held.positionId)) || !(Date.now() - (held.at ?? 0) > 120000)) continue;
      this.dailyPositionBySymbol.delete(symbol);
      console.warn(`[cTrader] suivi ${held.source ?? DAILY_RSI2_STRATEGY} ${symbol} (positionId=${held.positionId}) retiré : la position n'existe plus chez le courtier (confirmation de clôture manquée).`);
    }
    const managedIds = new Set([...this.dailyPositionBySymbol.values()].map((p) => String(p.positionId)));
    const toAdopt = computeRealOnlyPositionsToAdopt({
      realPositions: (res.position || []).filter((p) => !managedIds.has(String(p.positionId))),
      symbolNameById: this.symbolNameById,
      symbols: this.symbols,
      getBelievedPosition: (symbol) => store.strategyEngine.getOpenPosition(symbol),
    });
    for (const real of toAdopt) {
      const adopted = store.strategyEngine.adoptExternalPosition(real.symbol, real);
      if (!adopted) continue;
      this.openPositionInfoByPositionId.set(real.positionId, {
        symbolName: real.symbol,
        source: 'adopted',
        signalId: adopted.id,
        direction: real.direction,
        entryPrice: real.entryPrice,
        riskAmount: null,
        stopPrice: real.stopPrice,
        targetPrice: real.targetPrice,
        entryTime: real.openTimestamp || Date.now(),
      });
      console.warn(
        `[cTrader] adopted a real-only position into tracking: ${real.symbol} positionId=${real.positionId} ` +
          '(this process had no belief for it, e.g. after a restart) - netting now correctly blocked on this symbol until it closes.'
      );
      this._notifyText(
        `🟡 Position réelle détectée sur ${real.symbol} que le bot ne suivait plus (redémarrage ?) - reprise en suivi, netting bloqué sur ce symbole jusqu'à sa fermeture.`
      );
    }

    // 2026-09-23 - journal self-heal (see computeUntrackedPositionInfos): after a restart the in-memory position -> trade info map
    // is empty, so a still-open position's eventual close was never journaled. Rebuilt here from the broker's own data, on every
    // boot and sweep tick; signalId taken from the engine's current belief on that symbol so the real close still releases it.
    const toRestore = computeUntrackedPositionInfos({
      realPositions: res.position || [],
      pendingOrders: res.order || [],
      symbolNameById: this.symbolNameById,
      symbols: this.symbols,
      getTrackedInfo: (positionId) => this.openPositionInfoByPositionId.get(positionId) ?? null,
    });
    for (const info of toRestore) {
      const existing = this.openPositionInfoByPositionId.get(info.positionId);
      const believed = store.strategyEngine.getOpenPosition(info.symbolName);
      this.openPositionInfoByPositionId.set(info.positionId, {
        ...existing,
        symbolName: info.symbolName,
        source: info.source,
        signalId: existing?.signalId ?? believed?.id ?? null,
        direction: info.direction,
        entryPrice: info.entryPrice,
        riskAmount: info.riskAmount,
        // never replace a known level with a missing one (the missing-stop resubmit below reads stopPrice)
        stopPrice: info.stopPrice ?? existing?.stopPrice ?? null,
        targetPrice: info.targetPrice ?? existing?.targetPrice ?? null,
        entryTime: existing?.entryTime ?? info.entryTime,
      });
      console.log(`[cTrader] journal: restored tracking of real position ${info.symbolName} positionId=${info.positionId} source=${info.source} stop=${info.stopPrice} riskAmount=${info.riskAmount == null ? 'unknown' : info.riskAmount.toFixed(2)} - its close will be journaled.`);
    }

    // 2026-09-14 (found live: a real BTCUSD position came back with
    // stopLoss:null and NO working pending order behind it either - see
    // accountReconciliation.js's computeMissingStopFixes for the full story
    // and dealPairing.js/openPositionInfoByPositionId for why this process
    // is the only place that remembers what the stop was ever supposed to
    // be). Reuses the SAME reconcile response above - no extra broker
    // round-trip - so this runs on every boot AND every 5-minute sweep tick,
    // matching the stale-belief check's own cadence exactly.
    const toFix = computeMissingStopFixes({
      realPositions: res.position || [],
      pendingOrders: res.order || [],
      getTrackedStopPrice: (positionId) => {
        const info = this.openPositionInfoByPositionId.get(positionId);
        // Bug found 2026-09-17 (execution-path audit): this used to return
        // `info` as-is, which has NO `takeProfit` property (it's stored as
        // `targetPrice` - see _handleAutoExecuteEntry/_handleExecutionEvent
        // above) - so computeMissingStopFixes' `tracked.takeProfit` was
        // always undefined, and the "second safety net" the comment below
        // describes (resubmitting takeProfit alongside stopLoss) has never
        // once actually fired. Harmless in practice so far (omitting the
        // key is the DOCUMENTED way to leave takeProfit untouched), but a
        // deliberately-added safety net silently being dead code defeats
        // its own purpose.
        return info ? { stopPrice: info.stopPrice, takeProfit: info.targetPrice } : null;
      },
    });
    for (const fix of toFix) {
      try {
        // ProtoOAAmendPositionSLTPReq - confirmed against this project's own
        // vendored OpenApiMessages.proto, not a guess: stopLoss/takeProfit
        // are both independently `optional`, i.e. an amend that only sets
        // stopLoss leaves takeProfit untouched - still passing the tracked
        // takeProfit too (when known) as a second safety net in case that
        // assumption is wrong, never to overwrite a real, different value.
        await sendCommandWithTimeout(this.connection, 'ProtoOAAmendPositionSLTPReq', {
          ctidTraderAccountId: Number(accountId),
          positionId: Number(fix.positionId),
          stopLoss: fix.stopPrice,
          ...(fix.takeProfit != null ? { takeProfit: fix.takeProfit } : {}),
        });
        console.log(`[cTrader] resubmitted missing stop-loss on positionId=${fix.positionId}: stopLoss=${fix.stopPrice}`);
        this._notifyText(`⚠️ Stop de protection manquant détecté sur une position réelle (id ${fix.positionId}) - resoumis automatiquement à ${fix.stopPrice}.`);
      } catch (err) {
        console.error(`[cTrader] failed to resubmit missing stop-loss on positionId=${fix.positionId} (will retry next sweep tick):`, err.message);
      }
    }
  },

  /**
   * On-demand raw reconcile dump (2026-09-14, urgent live check: a BTCUSD
   * position showed stopLoss:null on the dashboard while a floating loss
   * kept growing - need to see whether the broker-side protective order
   * genuinely still exists and at what price, without guessing. Same
   * ProtoOAReconcileReq _clearStaleBeliefsAgainstBroker already uses at
   * boot, exposed on demand instead of only at startup. Temporary
   * diagnostic - not wired into any UI.
   */
  async debugReconcileRaw() {
    return sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(this.accountId),
    });
  },
};
