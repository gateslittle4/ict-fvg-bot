// execution.js - méthodes de CTraderDataSource (src/dataSources/cTraderDataSource.js), découpées le 2026-09-24 sans changement de
// comportement. Exécution : envoi / annulation des ordres, entrée automatique, pyramide, clôture après durée max, événements d'exécution du courtier.
// Rattachées à la classe par Object.assign(CTraderDataSource.prototype, ...) : `this` est l'instance, comme avant.

import { CONFIG } from '../../config.js';
import { calculateLotSize } from '../../engines/lotCalculator.js';
import { describeBrokerPayload, extractBrokerError } from '../brokerPayload.js';

import { findBotPositionsToClose } from '../accountReconciliation.js';
import { logOrderEvent, extraTradeFields } from '../demoTrackingLog.js';

import { isLegAllowed, refreshKillSwitch } from '../../killSwitch.js';

import { DAILY_RSI2_STRATEGY, MANAGED_SOURCES, entryBlockReason, orderProtection, capLots } from '../../execution/entryPolicy.js';

import { logClosedTrade } from '../supabaseTradeLog.js';

import { TIMEFRAME_DURATION_MS, resolveSymbolTimeframe, toRelativeProtectionDistance, sendCommandWithTimeout, parseBrokerMoney } from './shared.js';

export const executionMethods = {

  /**
   * The broker refused an order outright. Records it, says so loudly in the
   * durable Render logs, and pushes it to ntfy - a refusal is the one thing
   * about auto-execution a human genuinely needs to hear about, since it
   * means a validated signal produced no trade at all and will keep
   * producing none until whatever it names is fixed.
   *
   * @param {object} descriptor - a ProtoOAOrderErrorEvent descriptor, or any
   *   payload extractBrokerError() can read a refusal out of.
   * @returns {object|null} the recorded rejection, or null if there was none.
   */
  _handleOrderError(descriptor) {
    const error = extractBrokerError(descriptor);
    if (!error) {
      // Subscribed to this event and still could not read a reason out of
      // it: dump it raw rather than drop it. That is the whole point of
      // this path - never again answer "why did the order not go through?"
      // with a shrug.
      console.error(`[order-error] broker sent an order error this code could not parse - raw: ${describeBrokerPayload(descriptor)}`);
      return null;
    }
    const rejection = { ...error, receivedAtMs: Date.now() };
    this.lastOrderRejection = rejection;
    this._pendingOrderRejection = rejection;
    console.error(
      `[order-error] broker REFUSED the order: errorCode=${rejection.errorCode} description=${rejection.description} ` +
        `orderId=${rejection.orderId} positionId=${rejection.positionId} - raw: ${describeBrokerPayload(descriptor)}`
    );
    this._notifyText(
      `⛔ Ordre REFUSÉ par le courtier : ${rejection.errorCode ?? 'motif sans code'} - ${rejection.description ?? 'aucune description'}. Aucune position ouverte.`
    );
    return rejection;
  },

  /**
   * 2026-09-23 - the engine timed a position out (maxHoldingCandles, where every backtest closes it) but live nothing closed the
   * REAL position: it stayed open until its broker stop/target, netting blocked on the symbol the whole time. Closes the bot's own
   * position(s) for that strategy on that symbol at market (see findBotPositionsToClose - never a manual/unknown one). The belief
   * is released by _handleExecutionEvent when the broker confirms the close, like any other real close. Never throws.
   */
  async _closeRealPositionsAfterTimeout(symbolName, symbolId, event) {
    try {
      const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', { ctidTraderAccountId: Number(this.accountId) });
      const targets = findBotPositionsToClose({ realPositions: res.position || [], symbolId, symbol: symbolName, source: event.source });
      if (targets.length === 0) {
        console.log(`[time-exit] ${symbolName} source=${event.source}: engine timed out, no matching real position (already closed by stop/target?) - nothing to close.`);
        return;
      }
      for (const t of targets) {
        await sendCommandWithTimeout(this.connection, 'ProtoOAClosePositionReq', { ctidTraderAccountId: Number(this.accountId), positionId: Number(t.positionId), volume: t.volume });
        console.log(`[time-exit] ${symbolName} source=${event.source}: max holding reached - close sent for positionId=${t.positionId} (volume ${t.volume}).`);
        logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: event.source, event: 'close_sent', side: event.direction === 'bullish' ? 'sell' : 'buy', price: null, detail: `positionId=${t.positionId} reason=timeout` });
        this._notifyText(`⏱️ [${String(event.source).toUpperCase()}] ${symbolName} : durée maximale atteinte - position réelle fermée au marché (comme dans les backtests).`);
      }
    } catch (err) {
      console.error(`[time-exit] ${symbolName} source=${event.source}: close after timeout failed (the broker stop/target still protects it): ${err.message}`);
    }
  },

  /**
   * A pyramid add-on trigger just fired (LiveStrategyEngine already computed
   * entry/stop/target and recorded the leg as 'requested') - submit the real
   * STOP order, with stop-loss/take-profit ALREADY ATTACHED so the broker
   * enforces them independently of this process staying up. On success,
   * tell the engine so it can cancel this order later if the original
   * resolves first (markPyramidOrderPlaced). On failure, log and DO NOT
   * retry automatically - a silently-retried order on a real account is
   * worse than a missed pyramid leg.
   */
  async _handlePyramidOrderRequested(symbolName, symbolId, e) {
    const store = this.account;
    try {
      const spec = this._specFor(symbolName);
      if (!spec) {
        console.warn(`[pyramid] no symbol spec for ${symbolName} - skipping add-on order`);
        return;
      }
      // Bug fix (2026-09, multi-account rollout): this used to read the
      // BOOT-TIME global CONFIG.risk.riskPctPerTrade default, ignoring both
      // a live dashboard change (POST /api/settings/risk) AND, now that
      // per-account risk% is a real thing (see propFirms/index.js), any
      // OTHER account's risk entirely - store.strategyEngine.riskPctPerTrade
      // is the one number that's actually always current for THIS account.
      const sizing = calculateLotSize({
        balance: store.balance,
        riskPct: store.strategyEngine.riskPctPerTrade,
        entryPrice: e.entryPrice,
        stopPrice: e.stopPrice,
        symbolSpec: spec,
      });
      const orderLabel = `pyramid-add-${symbolName}`;
      const submittedAtMs = Date.now();
      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: 'STOP',
        tradeSide: e.direction === 'bullish' ? 'BUY' : 'SELL',
        lots: sizing.lots,
        symbolSpec: spec,
        price: e.entryPrice, // the order's OWN trigger price - NOT the protective stop-loss below
        stopLoss: e.stopPrice,
        takeProfit: e.targetPrice,
        label: orderLabel,
      });
      console.log(`[pyramid] _submitOrder resolved for ${symbolName}: brokerOrderId=${brokerOrderId}`);
      if (brokerOrderId != null) {
        store.strategyEngine.markPyramidOrderPlaced(symbolName, brokerOrderId);
        this.pyramidOrderSymbolByOrderId.set(String(brokerOrderId), symbolName);
        this._notifyText(`🔺 Pyramide auto : ordre stop programmé sur ${symbolName} (entrée ${e.entryPrice}, stop ${e.stopPrice}, cible ${e.targetPrice}, ${sizing.lots} lots)`);
      } else {
        // 2026-09-17: same gap already fixed on the entry path (see
        // _handleAutoExecuteEntry) existed here too, and arguably worse - a
        // real pyramid position filled with NO confirmation used to leave
        // this.pyramidPositions[symbol] stuck at 'requested' forever (no
        // brokerOrderId ever recorded to cancel), the broker position itself
        // completely untracked (no entry in pyramidOrderSymbolByOrderId or
        // openPositionInfoByPositionId), and total silence - not even a log
        // line, since this branch used to just do nothing. Ask the broker
        // directly instead of assuming, exactly like the entry path.
        let verified = null;
        try {
          verified = await this._findRealOrderOrPositionForLabel({ symbolId, label: orderLabel, submittedAtMs });
        } catch (verifyErr) {
          console.error(`[pyramid] order verification failed for ${symbolName}:`, verifyErr.message);
        }

        if (verified?.orderId != null) {
          store.strategyEngine.markPyramidOrderPlaced(symbolName, verified.orderId);
          this.pyramidOrderSymbolByOrderId.set(String(verified.orderId), symbolName);
          console.warn(`[pyramid] no push confirmation for ${symbolName}, but reconcile found the REAL working order orderId=${verified.orderId} - adopted.`);
          this._notifyText(`🔺 Pyramide auto : ordre stop bien programmé sur ${symbolName} (confirmé en interrogeant le courtier, message de confirmation perdu)`);
        } else if (verified?.positionId != null) {
          // The STOP already triggered and filled by the time we asked - no
          // orderId left to track, but a real broker-managed bracket
          // position now exists and needs the SAME close-attribution
          // bookkeeping the push-confirmed fill path sets up.
          const filled = store.strategyEngine.markPyramidOrderFilled(symbolName);
          this.pyramidPositionIdBySymbol.set(symbolName, verified.positionId);
          // BUG FOUND 2026-09-17 (same session, writing the regression test
          // for THIS function surfaced it): the push-confirmed pyramid-fill
          // path (_handleExecutionEvent) was just fixed to also populate
          // openPositionInfoByPositionId (the missing-stop-loss sweep and
          // the durable journal both read from it) - this reconcile-verified
          // path, the one that exists SPECIFICALLY for when push
          // confirmation is lost, had the identical gap and would have been
          // even MORE exposed to it (this branch only ever runs when a push
          // was already missed once). filled may be null if
          // markPyramidOrderFilled's own slot was already empty (e.g. a
          // previous verify already cleared it) - only set the tracking
          // entry when there's a real filled record to source it from.
          if (filled) {
            this.openPositionInfoByPositionId.set(String(verified.positionId), {
              symbolName,
              source: 'pyramid',
              signalId: null,
              direction: filled.direction,
              entryPrice: filled.entryPrice,
              riskAmount: filled.riskAmount,
              stopPrice: filled.stopPrice,
              targetPrice: filled.targetPrice,
              entryTime: Date.now(),
            });
          }
          console.warn(`[pyramid] no push confirmation for ${symbolName}, but reconcile found a REAL OPEN POSITION positionId=${verified.positionId} - adopted.`);
          this._notifyText(`🔺 Pyramide auto : 2e unité déjà REMPLIE sur ${symbolName} (confirmé en interrogeant le courtier) à ${filled?.entryPrice ?? e.entryPrice}`);
        } else {
          store.strategyEngine.clearPyramidPending(symbolName);
          console.warn(`[pyramid] no orderId within timeout for ${symbolName} AND reconcile found nothing real - order never reached the broker, clearing pending pyramid.`);
          this._notifyText(`⚠️ Pyramide auto : aucune confirmation du courtier sur ${symbolName} et aucun ordre/position réels trouvés (vérifié) - ordre abandonné.`);
        }
      }
    } catch (err) {
      console.warn(`[pyramid] failed to place add-on order for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'envoi de l'ordre sur ${symbolName} (${err.message}) - à vérifier manuellement`);
    }
  },

  async _handlePyramidOrderCancelRequested(symbolName, e) {
    if (!e.brokerOrderId) return; // never actually reached the broker (e.g. placement itself failed) - nothing to cancel
    try {
      await this._cancelOrder(e.brokerOrderId);
      this.pyramidOrderSymbolByOrderId.delete(String(e.brokerOrderId));
    } catch (err) {
      console.warn(`[pyramid] failed to cancel add-on order ${e.brokerOrderId} for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ Pyramide auto : échec de l'annulation de l'ordre en attente sur ${symbolName} - à annuler manuellement si toujours ouvert`);
    }
  },

  /**
   * Submits a real order - MARKET (fills now), LIMIT (fills at `price` or
   * better), or STOP (a pending order that fills once price trades AT
   * `price` - used by the pyramid add-on) - with stop-loss/take-profit
   * attached as a bracket. `price` is the order's OWN entry trigger, not to
   * be confused with `stopLoss` (the protective level).
   * !!! UNVERIFIED against a real account - see file header. In particular
   * `volume`'s exact unit (lots * lotSize * 100 is the documented
   * convention, but never confirmed here) MUST be checked against a real
   * ProtoOASymbolsListReq response (symbol.lotSize) before this is trusted
   * with real money. Same for `timeInForce: 'GOOD_TILL_DATE'` below - the
   * exact enum name needs confirming against a real API response too.
   */
  // 2026-09-13, the single most important bug found this session, via
  // /admin/test-order-cycle's first real run: ProtoOANewOrderReq's
  // synchronous response on THIS broker comes back as an EMPTY OBJECT ({})
  // - no order.orderId, no orderId anywhere in it. `_submitOrder` used to
  // derive brokerOrderId from exactly that response
  // (`res?.order?.orderId ?? res?.orderId ?? null`), so it has ALWAYS
  // resolved to `null` for every real order this process has ever placed
  // live - which BOTH _handleAutoExecuteEntry and
  // _handlePyramidOrderRequested gate real tracking behind
  // (`if (brokerOrderId != null)`). Concretely, this means
  // pendingEntryOrderByOrderId has never actually been populated by a real
  // order, _handleExecutionEvent's confirmation branch has never matched
  // anything, and NOT ONE real fill/rejection has ever been reconciled
  // back into the engine's belief - exactly the gap behind Esdras's
  // original "ce n'est pas un trade, c'est une croyance" correction. The
  // broker DID keep filling orders in reality the whole time (independently
  // confirmed live: ORDER_ACCEPTED then ORDER_FILLED arrived ~600ms after
  // submission, with a real orderId/positionId) - only the confirmation
  // path back into this process was silently dead.
  //
  // Fixed the same way as test-order-cycle: get the real orderId from the
  // ProtoOAExecutionEvent that follows submission (matched by symbolId,
  // Number(...) both sides - see _handleAutoExecuteEntry's own
  // "Number(symbolId) is always true" precedent for why a bare !== on a
  // protobuf-serialized field can silently never match), not from the
  // unreliable synchronous response. Safe against the one theoretical race
  // (the event arriving and being consumed by _handleExecutionEvent before
  // this function even returns, so pendingEntryOrderByOrderId.set() runs
  // too late to catch it) because the broker's own order lifecycle sends
  // ORDER_ACCEPTED (this order now exists, carries the real orderId)
  // strictly before ORDER_FILLED/REJECTED/etc for that same order - real
  // captured evidence shows ~300ms between them, ample time for the awaited
  // orderId to reach _handleAutoExecuteEntry/_handlePyramidOrderRequested
  // and register the pending entry before any terminal event follows.
  // timeoutMs was 10000 (2026-09-17, real incident: two auto-execute orders
  // silently got no broker confirmation for 6+ hours on a connection that
  // kept receiving spot/candle ticks fine - see HANDOFF.md's "connexion
  // zombie" writeup). This only ever waits for ORDER_ACCEPTED (the order
  // now exists broker-side), not ORDER_FILLED - a resting LIMIT/STOP order
  // gets its ACCEPTED just as fast as a MARKET order's, confirmed live via
  // /admin/test-order-cycle: ~220ms from submission to ORDER_ACCEPTED. 10s
  // was pure slack with no upside on a healthy connection (the promise
  // still resolves the instant the event arrives, whatever the ceiling is)
  // and meant a degraded connection took 10s per attempt to even start
  // being detectable - shortened so _handleAutoExecuteEntry's reconnect
  // trigger (see there) fires quickly instead of being an afterthought.
  /**
   * "Did this order actually reach the broker?" - answered by ASKING
   * (ProtoOAReconcileReq, a request/response round-trip) instead of waiting
   * for a push that may never come.
   *
   * This is the whole point (2026-09-17, Esdras: "comment peut on s'assurer
   * à 100% que l'ordre passe"): the connection that failed today was only
   * HALF broken - it stopped delivering ProtoOAExecutionEvent pushes while
   * still answering every request/response command perfectly (the 5-minute
   * balance refresh kept succeeding right through the 6-hour outage, and
   * ProtoOANewOrderReq itself still got its - empty - reply). So a reconcile
   * query is exactly the channel that still works when the push channel is
   * dead, which makes it the only trustworthy way to find out what really
   * happened to an order we got no confirmation for.
   *
   * Matching is by symbolId AND our own `label` (set at submission: e.g.
   * `auto-silverbullet-US100`) - the broker echoes it back in
   * position.tradeData.label / order.tradeData.label (confirmed live in the
   * raw fill dump of /admin/test-order-cycle). `openTimestamp` narrows it
   * further when present, so an OLDER position carrying the same label
   * (same mechanism, same symbol, earlier signal) is never adopted by
   * mistake; when the field is absent the label+symbol match stands alone
   * rather than silently discarding a real match.
   *
   * Returns { orderId, positionId, matched } - either id may be null:
   * a still-working LIMIT/STOP shows up as an order, a filled MARKET order
   * as a position (its order is no longer in the working list by then).
   */
  async _findRealOrderOrPositionForLabel({ symbolId, label, submittedAtMs }) {
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOAReconcileReq', {
      ctidTraderAccountId: Number(this.accountId),
    });
    // Dumped raw on purpose: this path only runs when something already went
    // wrong, and this file's own history (the null-orderId bug, the
    // `order.symbolId` that never existed) is a long list of broker payload
    // shapes that were GUESSED rather than observed. One log line here is
    // what makes the next diagnosis factual.
    console.log(`[order-verify] reconcile for symbolId=${symbolId} label=${label}: ${JSON.stringify(res)}`);

    const SLACK_MS = 5000; // submission -> broker-side timestamp, generously
    const isOurs = (tradeData) => {
      if (tradeData?.label !== label) return false;
      if (Number(tradeData?.symbolId) !== Number(symbolId)) return false;
      const openedAt = Number(tradeData?.openTimestamp);
      // Absent/unparseable timestamp: keep the match (label+symbol is
      // already specific) rather than throwing away a real position.
      if (!Number.isFinite(openedAt) || openedAt <= 0) return true;
      return openedAt >= submittedAtMs - SLACK_MS;
    };

    const order = (res.order || []).find((o) => isOurs(o?.tradeData) && o?.orderId != null);
    const position = (res.position || []).find((p) => isOurs(p?.tradeData) && p?.positionId != null);

    return {
      orderId: order?.orderId ?? null,
      positionId: position?.positionId ?? null,
      matched: Boolean(order || position),
    };
  },

  _waitForOrderIdBySymbol(symbolId, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const uuids = [];
      const safeRemove = () => {
        for (const uuid of uuids) {
          try {
            if (uuid != null) this.connection.removeEventListener(uuid);
          } catch (err) {
            console.error('[_submitOrder] removeEventListener failed (non-fatal):', err.message);
          }
        }
      };
      const timer = setTimeout(() => {
        safeRemove();
        // Resolves null, same as the old (broken) synchronous-response path
        // did on every call - callers already handle a null brokerOrderId
        // by skipping tracking/notification rather than throwing.
        resolve(null);
      }, timeoutMs);
      // 2026-09-18: a refusal ends this wait just as definitively as a
      // confirmation does, so stop burning the full timeout on it. Unlike
      // ProtoOAExecutionEvent, ProtoOAOrderErrorEvent carries NO symbolId
      // at all (only errorCode/description and, when one exists, an
      // orderId we by definition never got), so it cannot be matched to
      // this symbol. Treating any refusal that lands inside this window as
      // this submission's own is sound because the window is the ~3s
      // between one awaited sendCommand and its answer, and every caller
      // (_handleAutoExecuteEntry, _handlePyramidOrderRequested) awaits
      // _submitOrder before submitting anything else - so there is never a
      // second order in flight to confuse it with. The permanent listener
      // registered in _registerBrokerEventListeners() logs and records the
      // refusal either way; this one only decides when to stop waiting.
      uuids.push(
        this.connection.on('ProtoOAOrderErrorEvent', () => {
          clearTimeout(timer);
          safeRemove();
          resolve(null);
        })
      );
      uuids.push(this.connection.on('ProtoOAExecutionEvent', (event) => {
        try {
          const d = event.descriptor;
          // Confirmed live (2026-09-13, raw event dump): the real field is
          // `order.tradeData.symbolId`, NOT the flatter `order.symbolId`
          // this originally guessed (which doesn't exist at all on this
          // broker's ProtoOAExecutionEvent - `d.order.symbolId` is simply
          // `undefined`, always failing the match). Keeping the other
          // fallback paths too since they're free and this broker's exact
          // shape on OTHER event types (rejection, pyramid STOP orders)
          // isn't separately confirmed.
          const eventSymbolId =
            d.order?.tradeData?.symbolId ?? d.order?.symbolId ?? d.position?.tradeData?.symbolId ?? d.position?.symbolId ?? d.deal?.symbolId ?? null;
          if (Number(eventSymbolId) !== Number(symbolId) || d.order?.orderId == null) return;
          clearTimeout(timer);
          safeRemove();
          resolve(d.order.orderId);
        } catch (err) {
          clearTimeout(timer);
          safeRemove();
          resolve(null);
        }
      }));
    });
  },

  async _submitOrder({ symbolId, orderType, tradeSide, lots, symbolSpec, price, stopLoss, takeProfit, label, expirationTimestamp, referencePrice }) {
    const accountId = Number(this.accountId);
    // FIXED 2026-09-16. This was `lots * (symbolSpec.lotSize || 100000) * 100`,
    // and no spec in lotCalculator.js has ever defined a lotSize - so every
    // order used the hardcoded forex-shaped 100000, doubled by a further
    // x100 that cTrader's own lotSize already contains. Right for EURUSD by
    // pure coincidence (100000 * 100 == its real lotSize of 10000000),
    // 100000x too large on US100/US500/GER40 and 1000x on XAUUSD - past
    // those symbols' own maxVolume, so the broker would have rejected every
    // single one. Never caught because the only symbol that ever really
    // traded, BTCUSD, set rawVolume to skip this path entirely.
    // Confirmed against all five symbols' real ProtoOASymbol responses; see
    // buildSpecFromBrokerSymbol() for the model and the cross-check.
    let volume;
    if (symbolSpec.rawVolume) {
      // The spec's `lots` IS the broker volume already - nothing to convert.
      volume = Math.round(lots);
    } else {
      const lotSize = Number(symbolSpec.lotSize);
      if (!Number.isFinite(lotSize) || lotSize <= 0) {
        // Refuse rather than fall back to a guess. Sending a wrong volume is
        // how this bug stayed invisible; a loud failure to place ONE order
        // is strictly better than silently placing a mis-sized real one.
        throw new Error(
          `refusing to submit an order for symbolId=${symbolId}: no broker-confirmed lotSize ` +
            '(ProtoOASymbolByIdReq did not return one at boot - see _loadSymbolSpecs)'
        );
      }
      volume = Math.round(lots * lotSize);
    }
    const payload = { ctidTraderAccountId: accountId, symbolId, orderType, tradeSide, volume, label };
    if (orderType === 'STOP') payload.stopPrice = price;
    if (orderType === 'LIMIT') payload.limitPrice = price;
    // 2026-09-18: a MARKET order must express its protection as a relative
    // DISTANCE - absolute stopLoss/takeProfit are explicitly unsupported on
    // this order type (see toRelativeProtectionDistance's own comment for the
    // quoted message definition and the production evidence). LIMIT and STOP
    // are pending orders with a known entry price, so they keep the absolute
    // form the broker does accept from them, unchanged.
    if (orderType === 'MARKET' && (stopLoss != null || takeProfit != null)) {
      const anchor = referencePrice ?? price;
      // 2026-09-18, SECOND ROUND. The relative form above was accepted as a
      // field but refused as a value: the broker answered
      // "INVALID_REQUEST - Relative stop loss has invalid precision" to both
      // US100 MARKET orders of 14:45 and 15:15 UTC. A relative distance is
      // in 1/100000 of a price unit, but it still has to land on the
      // SYMBOL's own price grid: US100 quotes 2 decimals, so only multiples
      // of 1000 are expressible. Our stops carry more decimals than that
      // (stopLoss=29561.275 against a 2-decimal symbol), which is what the
      // broker was rejecting. digits comes from the broker's own
      // ProtoOASymbol (see buildSpecFromBrokerSymbol); with no spec the step
      // falls back to 1, i.e. the previous behaviour.
      const priceDigits = symbolSpec?.digits;
      const relativeStopLoss = stopLoss == null ? null : toRelativeProtectionDistance(anchor, stopLoss, priceDigits);
      const relativeTakeProfit =
        takeProfit == null ? null : toRelativeProtectionDistance(anchor, takeProfit, priceDigits);
      // Refuse rather than send a MARKET order stripped of its protection.
      // Same reasoning as the lotSize guard above: one loud failure to place
      // an order beats one real unguarded position running on a live account.
      if (stopLoss != null && relativeStopLoss == null) {
        throw new Error(
          `refusing to submit a MARKET order for symbolId=${symbolId}: cannot express stopLoss=${stopLoss} as a ` +
            `relative distance from referencePrice=${anchor} (a MARKET order cannot carry an absolute stop)`
        );
      }
      if (takeProfit != null && relativeTakeProfit == null) {
        throw new Error(
          `refusing to submit a MARKET order for symbolId=${symbolId}: cannot express takeProfit=${takeProfit} as a ` +
            `relative distance from referencePrice=${anchor} (a MARKET order cannot carry an absolute target)`
        );
      }
      if (relativeStopLoss != null) payload.relativeStopLoss = relativeStopLoss;
      if (relativeTakeProfit != null) payload.relativeTakeProfit = relativeTakeProfit;
    } else {
      if (stopLoss != null) payload.stopLoss = stopLoss;
      if (takeProfit != null) payload.takeProfit = takeProfit;
    }
    if (expirationTimestamp) {
      payload.expirationTimestamp = expirationTimestamp;
      payload.timeInForce = 'GOOD_TILL_DATE'; // VERIFY exact enum name against a real API response
    }
    // Registered BEFORE sendCommand so the listener is armed no matter how
    // quickly the broker replies - see _waitForOrderIdBySymbol's own
    // comment for why this exists at all.
    // Cleared at the same moment (2026-09-18): anything _handleOrderError
    // records from here on belongs to THIS submission, so the branch below
    // can never adopt a refusal left over from an earlier one.
    this._pendingOrderRejection = null;
    const orderIdFromEvent = this._waitForOrderIdBySymbol(symbolId);
    const res = await this.connection.sendCommand('ProtoOANewOrderReq', payload);
    // 2026-09-14: one real LIMIT order tonight (BTCUSD FVG signal) got zero
    // ProtoOAExecutionEvent within 10s and had to fall back to the
    // timeout/null path - a subsequent LIMIT order minutes later behaved
    // normally (ORDER_ACCEPTED in ~230ms, ORDER_FILLED ~11s later, real
    // position confirmed via /api/account showing reconciliation
    // status:'match') - so that first miss reads as a one-off delay/drop,
    // not a structural break in LIMIT order handling. Kept as a permanent
    // (not spammy - once per real order attempt) log line rather than the
    // original throwaway diagnostic, since this exact gap (an order placed
    // with no confirmation either way) is precisely what this session's
    // "corrige le pipeline" work was about closing.
    // describeBrokerPayload, not JSON.stringify (2026-09-18): every
    // "rawRes={}" this line has ever logged proved nothing about the
    // response, only that JSON.stringify cannot see through this library's
    // prototype getters - the exact trap already documented in
    // _registerBrokerEventListeners(). See brokerPayload.js.
    console.log(`[_submitOrder] ${payload.orderType} ${payload.tradeSide} sent for symbolId=${symbolId}, rawRes=${describeBrokerPayload(res)}`);
    // A refusal can also come back HERE, synchronously, as a ProtoOAErrorRes
    // standing in for the expected ProtoOANewOrderRes - in which case no
    // ProtoOAOrderErrorEvent is ever pushed and the subscription above would
    // never see it. Same handler either way, so the reason gets logged,
    // recorded and pushed exactly once whichever channel carried it.
    const syncError = extractBrokerError(res);
    if (syncError) this._handleOrderError(res);
    const syncOrderId = res?.order?.orderId ?? res?.orderId ?? null;
    if (syncOrderId != null) {
      // some future response shape DOES carry it directly - trust it, no need to wait for the event
      this._consecutiveOrderConfirmationTimeouts = 0;
      return syncOrderId;
    }
    const resolvedOrderId = await orderIdFromEvent;
    const rejection = this._pendingOrderRejection;
    this._pendingOrderRejection = null;
    if (resolvedOrderId != null) {
      this._consecutiveOrderConfirmationTimeouts = 0;
    } else if (rejection) {
      // 2026-09-18: the broker ANSWERED - it refused this order. That is a
      // definitive outcome, not a missing confirmation, and the two must
      // not be conflated: the restart escalation below exists for a
      // connection that has stopped talking to us, and this connection just
      // demonstrably did talk to us. Counting a refusal towards it would
      // make the bot reboot itself every time it sent two orders the broker
      // disagreed with - a loop that fixes nothing and takes the bot down
      // twice per pair of signals. Reset rather than merely skipped, for the
      // same reason: a refusal proves the push channel is alive.
      this._consecutiveOrderConfirmationTimeouts = 0;
      console.error(
        `[_submitOrder] ${payload.orderType} ${payload.tradeSide} for symbolId=${symbolId} was REFUSED by the broker: ` +
          `errorCode=${rejection.errorCode} description=${rejection.description} ` +
          `(volume=${volume} stopLoss=${stopLoss} takeProfit=${takeProfit} label=${label}) - no order exists at the broker.`
      );
    } else {
      // 2026-09-17, see this._consecutiveOrderConfirmationTimeouts' own
      // constructor comment: a connection can silently stop delivering
      // ProtoOAExecutionEvent while still ticking spot/candle data fine, so
      // "no confirmation" here is NOT distinguishable from "the process
      // itself is fine but this one order was slow" on a single occurrence
      // (already documented as happening once, harmlessly, on 2026-09-14).
      // Only treated as a real connection problem worth a restart once it
      // repeats on the VERY NEXT order attempt - a genuinely degraded
      // connection fails every subsequent attempt, a one-off blip doesn't.
      this._consecutiveOrderConfirmationTimeouts += 1;
      console.error(
        `[_submitOrder] no execution confirmation within timeout for symbolId=${symbolId} ` +
          `(${this._consecutiveOrderConfirmationTimeouts} consecutive unconfirmed order(s))`
      );
      if (this._consecutiveOrderConfirmationTimeouts >= 2) {
        console.error(
          '[_submitOrder] 2 consecutive orders with no broker confirmation - the connection is likely ' +
            'degraded (still receiving spot/candle ticks but not execution events, exactly the 2026-09-17 ' +
            'incident - see HANDOFF.md). Forcing a clean process exit so the platform restarts with a fresh ' +
            'connection rather than continuing to submit orders no one can confirm.'
        );
        // 2s, not a token delay: the CALLER
        // (_handleAutoExecuteEntry's no-confirmation branch) still has a
        // reconcile query in flight to find out whether this order actually
        // reached the broker, plus the ntfy notification that reports what
        // it found. Exiting under it would throw away exactly the answer
        // this incident made necessary. Anything it does manage to record is
        // in-memory and lost on restart anyway, but the notification (and
        // the log line) are what a human actually sees.
        // Restarting with a position open is safe by design: stop-loss and
        // take-profit are attached to the order itself at submission, so the
        // broker keeps enforcing them while this process is down.
        setTimeout(() => process.exit(1), 2000);
      }
    }
    return resolvedOrderId;
  },

  /**
   * "Mode indisponible" is active (store.autoExecute - Esdras opted in
   * himself for a bounded window, typically fin de mois when he can't click
   * Buy/Sell) - submit the ORIGINAL entry exactly as validated, same
   * entry/stop/target this engine would otherwise only have alerted a human
   * with. Nothing is recomputed or "improved" here versus the manual path.
   *
   * Order type follows how each source actually defines its entry price
   * (see liveStrategyEngine.js _detectFvgSignal/_detectDivergenceSignal/
   * _processNwogCandidate):
   *   - FVG: entryPrice is the gap's own edge, a level price has ALREADY
   *     touched by the time 'validated' fires this candle - a LIMIT order
   *     there is the faithful automation of "place a limit at this level
   *     and see if it fills again", not a chase at a worse price. Given a
   *     short expiration so a stale unfilled limit doesn't linger forever
   *     if price never returns (same outcome as a human who never got
   *     filled - not a new gap, see the "believed netting" caveat above).
   *   - Divergence/NWOG/Judas Swing/Weekly Sweep/Breaker Block: entryPrice
   *     IS candle.open of the very candle whose spot event we're
   *     processing right now - a MARKET order is the direct equivalent,
   *     not an approximation. Known, accepted gap: the live spot event
   *     carrying a completed trendbar only arrives once that M15 candle
   *     has CLOSED, so the MARKET order is submitted with price already
   *     having moved away from `entryPrice` by however much it drifted
   *     during those 15 minutes - especially relevant right after a
   *     weekend gap, when volatility is elevated.
   *
   * TRIED AND REVERTED (2026-09-16, same day): briefly switched every
   * source to LIMIT at entryPrice ("tous les trades vont etre passe par
   * limit order") for better backtest fidelity - reverted within the hour
   * after Esdras identified a real risk this introduced: a resting LIMIT
   * order's FILL moment is uncontrolled (it fires whenever price later
   * touches the level, up to NON_FVG_LIMIT_EXPIRY_CANDLES away), unlike a
   * MARKET order which fires at a moment the bot itself chooses. FTMO's
   * own EA policy forbids trading within 2 minutes of major news - no live
   * news-blackout filter exists in this bot yet (src/backtest/
   * newsEvents.js/runNewsBlackoutAnalysis.js are backtest-only research,
   * never wired into LiveStrategyEngine or here), so until one exists,
   * MARKET's near-zero exposure window (the instant it's sent) is safer
   * than LIMIT's long resting window, which is also disproportionately
   * likely to get touched BY a news-driven price spike specifically. FVG
   * stays LIMIT - the oldest, most-proven mechanism here, unaffected by
   * this reasoning since it was never changed either way. See HANDOFF.md
   * for the full back-and-forth.
   */
  async _handleAutoExecuteEntry(symbolName, symbolId, signal) {
    const store = this.account;
    // 2026-09-22 (RSI(2)/US500 daily, real execution): mutual exclusion with the daily strategy on the SAME symbol - never two independent real
    // positions on one instrument, in either direction. The daily strategy's own entry (source DAILY_RSI2_STRATEGY) is exempt from this check against
    // itself (dailyPositionBySymbol isn't set yet when ITS OWN entry runs), only intraday sources are blocked while a daily position is open.
    // 2026-09-24: generalized to every MANAGED_SOURCES strategy (A/B too) - any entry, combo or managed, is skipped while a managed strategy
    // holds a real position on the symbol (a managed strategy never enters while its own position is open: its engine is not flat then).
    const heldEntry = this.dailyPositionBySymbol?.get(symbolName);
    const heldBy = heldEntry ? (heldEntry.source ?? DAILY_RSI2_STRATEGY) : null;
    // 2026-09-24: filet de sécurité - une jambe (stratégie + paire) arrêtée par la règle pré-enregistrée (ou à la main) ne passe plus d'ordre.
    // Both rules live in entryPolicy.js (entryBlockReason), the SAME function the faithful replay applies.
    const blocked = entryBlockReason({ source: signal.source, heldBy, legAllowed: isLegAllowed(signal.source, symbolName) });
    if (blocked) {
      console.log(`[auto-execute] ${symbolName} source=${signal.source}: skipped, ${blocked}.`);
      logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: signal.source, event: 'skipped', side: signal.suggestedSide, price: signal.entryPrice, detail: blocked });
      return;
    }
    // 2026-09-13: this was the ONLY path that can submit a real order, yet
    // had zero console output - _notifyText is ntfy-only (fetch to
    // ntfy.sh, never logged) and only warns on push failure, so Render's
    // durable server logs could never confirm whether a real order attempt
    // ever happened, only ntfy's own (inaccessible) push history could.
    // Esdras asked explicitly ("fais en sorte que le trade s'exécute
    // réellement") for the pipeline itself to be verifiable, not just
    // fixed - this line plus the ones below at submit/confirm time close
    // that gap.
    console.log(`[auto-execute] entry signal received: ${symbolName} source=${signal.source} side=${signal.suggestedSide} id=${signal.id}`);
    const signalTimeMs = Date.now();
    logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: signal.source, event: 'signal', side: signal.suggestedSide, price: signal.entryPrice, detail: `stop=${signal.stopPrice} target=${signal.targetPrice}` });
    try {
      const spec = this._specFor(symbolName);
      if (!spec) {
        console.warn(`[auto-execute] no symbol spec for ${symbolName} - skipping entry`);
        return;
      }
      // Bug fix (2026-09, multi-account rollout) - see the identical note in
      // _handlePyramidOrderRequested() above: the live per-account risk%,
      // not the boot-time global default.
      const isFvg = signal.source === 'fvg';
      // MARKET orders only: widen the stop by the spread (and pull the target in) so the fill-anchored relative distances land on the strategy's
      // own levels, and size on that widened stop - see adjustMarketProtectionForSpread. LIMIT (FVG) keeps absolute prices, unchanged.
      // (entryPolicy.orderProtection, shared with the replay.) B (noise area) is sized on its volatility unit (1 daily sigma), not on its far
      // emergency stop - see momentumOrderSignal.
      const { protection, sizingStopPrice } = orderProtection(signal, { spread: this.lastSpreadBySymbol.get(symbolName), isLimit: isFvg });
      // 2026-09-24 (A/B): the study caps exposure at 4x the balance - never more lots than that, whatever the stop distance (capLots).
      const sizing = capLots(calculateLotSize({
        balance: store.balance,
        riskPct: store.strategyEngine.riskPctPerTrade,
        entryPrice: signal.entryPrice,
        stopPrice: sizingStopPrice,
        symbolSpec: spec,
      }), signal.maxLots, spec);
      // Was a flat 4 candles (~1h) - far shorter than CONFIG.fvg.maxAgeCandles
      // (50, ~12.5h), the window the BACKTEST itself gives an FVG zone to be
      // retested before calling it stale. 'validated' only fires once price
      // has ALREADY touched the zone once (see fvgEngine.js) - live, this
      // LIMIT order is a bet the zone gets touched AGAIN before it goes
      // stale, so it needs the SAME tolerance the backtest gave the zone
      // overall, not an arbitrary shorter one (found 2026-09 after Esdras
      // asked "il faut que l'ordre passe vraiment" - a real, unfilled XAUUSD
      // limit expired long before this fix, per orderOutcomeLog). This is
      // still not a perfect backtest match (a resting order genuinely
      // sitting for the FULL zone lifetime would need order placement moved
      // to 'watching'/formation time instead, a bigger change not made here
      // - see HANDOFF.md), but it removes the dominant known cause of
      // missed fills without touching entry price, stop, or target.
      const FVG_LIMIT_EXPIRY_CANDLES = CONFIG.fvg.maxAgeCandles;
      // 2026-09-13: was a hardcoded `* 15 * 60 * 1000` (assumed every symbol
      // is on M15) - now resolves the SAME per-symbol timeframe
      // _subscribeLiveCandles() actually subscribed this symbol on, so
      // BTCUSD's temporary M1 override expires its LIMIT order after 50
      // real minutes (matching maxAgeCandles), not 50 M15-shaped candles
      // (~12.5h) it was never actually warmed up or backtested against at
      // that timeframe. Every other symbol still resolves to M15 exactly as
      // before - CANDLE_DURATION_MS only changes the constant multiplied in.
      const candleDurationMs = TIMEFRAME_DURATION_MS[resolveSymbolTimeframe(symbolName)] || TIMEFRAME_DURATION_MS.M15;
      const lastCandle = store.lastCandleBySymbol.get(symbolName);
      const expirationTimestamp =
        isFvg && lastCandle ? lastCandle.time + FVG_LIMIT_EXPIRY_CANDLES * candleDurationMs : undefined;

      // Source in the label so it's identifiable directly in cTrader's own
      // order/position list, not just in the ntfy push below - the user
      // explicitly asked to be able to "voir et vérifier" each execution,
      // and the broker's own UI is the most durable place to check that
      // (survives even if a push notification is missed/dismissed).
      // Also what _findRealOrderOrPositionForLabel() matches on when no
      // confirmation arrives - see the else-branch below.
      const orderLabel = `auto-${signal.source}-${symbolName}`;
      const submittedAtMs = Date.now();
      const brokerOrderId = await this._submitOrder({
        symbolId,
        orderType: isFvg ? 'LIMIT' : 'MARKET',
        tradeSide: signal.suggestedSide.toUpperCase(),
        lots: sizing.lots,
        symbolSpec: spec,
        price: isFvg ? signal.entryPrice : undefined,
        stopLoss: protection.stopPrice,
        takeProfit: protection.targetPrice,
        // The anchor the stop/target distances are measured from on a MARKET
        // order (2026-09-18 - see toRelativeProtectionDistance). Ignored on
        // the FVG/LIMIT path, which keeps absolute prices. `price` is
        // undefined for every MARKET source here, so this is the only place
        // the intended entry level is still available at submission time.
        referencePrice: signal.entryPrice,
        label: orderLabel,
        expirationTimestamp,
      });
      // Logged unconditionally (null included) - a null brokerOrderId with
      // no thrown error would otherwise be silently indistinguishable from
      // a real success in every log Render actually keeps.
      console.log(`[auto-execute] _submitOrder resolved for ${symbolName}: brokerOrderId=${brokerOrderId}`);
      logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: signal.source, event: brokerOrderId != null ? 'order_sent' : 'order_no_id', side: signal.suggestedSide, price: signal.entryPrice, detail: `${isFvg ? 'LIMIT' : 'MARKET'} lots=${sizing.lots} orderId=${brokerOrderId}${protection.spreadApplied ? ` spreadComp=${protection.spreadApplied}` : ''}` });
      if (brokerOrderId != null) {
        // Tracked so _handleExecutionEvent can confirm the REAL outcome
        // (filled vs cancelled/expired/rejected) instead of leaving the
        // engine's own 'validated'-time belief unverified indefinitely.
        this.pendingEntryOrderByOrderId.set(String(brokerOrderId), {
          symbolName,
          source: signal.source,
          signalId: signal.id,
          // 2026-09-14: carried through to openPositionInfoByPositionId once
          // this fill is confirmed (see _handleExecutionEvent) - needed to
          // log a REAL trade outcome (direction/entryPrice for the record,
          // riskAmount as the denominator for a real R-multiple) once the
          // position actually closes, instead of the engine's simulated
          // stop-vs-target guess.
          direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
          entryPrice: signal.entryPrice,
          riskAmount: sizing.actualRiskAmount,
          signalPrice: signal.entryPrice,
          signalTime: signalTimeMs,
          orderTime: submittedAtMs,
          riskPct: store.strategyEngine.riskPctPerTrade,
          spreadAtSignal: this.lastSpreadBySymbol.get(symbolName) ?? null,
          // 2026-09-14 (found live: a real position came back stopLoss:null
          // with no working stop order behind it either - see
          // accountReconciliation.js's computeMissingStopFixes) - the ONLY
          // record of what this position's intended protection was, so the
          // periodic sweep below can resubmit it if the broker ever drops
          // it. Never used to size/open anything - purely a memory of what
          // WE already asked the broker for at entry time.
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
        });
        this._notifyText(
          `🤖 [${signal.source.toUpperCase()}] Entrée auto envoyée sur ${symbolName} (${signal.suggestedSide.toUpperCase()}, entrée ${signal.entryPrice}, stop ${signal.stopPrice}, cible ${signal.targetPrice}, ${sizing.lots} lots)`
        );
      } else {
        // No push confirmation. This used to ASSUME nothing had happened and
        // clear the belief (2026-09-14 reasoning, kept below for the case it
        // still covers) - which is a coin flip in both directions: if the
        // order actually DID reach the broker, that assumption leaves a real,
        // untracked position running with nobody watching it here.
        //
        // 2026-09-17 (Esdras: "comment peut on s'assurer à 100% que l'ordre
        // passe"): stop assuming, go ASK. ProtoOAReconcileReq is a
        // request/response round-trip, and request/response is precisely
        // what kept working through today's 6-hour push-channel outage - so
        // this answers the question on exactly the connection state that
        // breaks the push path. ~200ms, only on this already-abnormal path.
        let verified = null;
        try {
          verified = await this._findRealOrderOrPositionForLabel({ symbolId, label: orderLabel, submittedAtMs });
        } catch (verifyErr) {
          // Verification itself failed (connection fully down, not just its
          // push channel) - fall through to the old clear-the-belief path
          // rather than leaving the signal in limbo.
          console.error(`[auto-execute] order verification failed for ${symbolName}:`, verifyErr.message);
        }

        if (verified?.orderId != null) {
          // The order is REAL and still working (a LIMIT/STOP that hasn't
          // triggered yet) - only its confirmation push was lost. Track it
          // exactly as the confirmed path does, so its eventual fill/expiry
          // still resolves normally if the push channel recovers.
          this.pendingEntryOrderByOrderId.set(String(verified.orderId), {
            symbolName,
            source: signal.source,
            signalId: signal.id,
            direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
            entryPrice: signal.entryPrice,
            riskAmount: sizing.actualRiskAmount,
            stopPrice: signal.stopPrice,
            targetPrice: signal.targetPrice,
          });
          console.warn(
            `[auto-execute] no push confirmation for ${symbolName}, but reconcile found the REAL working order ` +
              `orderId=${verified.orderId} - adopted, belief kept.`
          );
          this._notifyText(
            `🟡 [${signal.source.toUpperCase()}] Ordre bien placé sur ${symbolName} (confirmé en interrogeant le courtier, le message de confirmation s'est perdu) - ordre en attente, suivi normalement.`
          );
        } else if (verified?.positionId != null) {
          // The order FILLED (a MARKET order, already a real position by the
          // time we asked) - its order is gone from the working list, so
          // there is no orderId to track, but the position itself is what
          // matters: register it directly in the map the fill event would
          // have populated, so the eventual real close still writes a
          // durable journal row with a real R-multiple.
          this.openPositionInfoByPositionId.set(String(verified.positionId), {
            symbolName,
            source: signal.source,
            signalId: signal.id,
            direction: signal.suggestedSide === 'buy' ? 'bullish' : 'bearish',
            entryPrice: signal.entryPrice,
            riskAmount: sizing.actualRiskAmount,
            stopPrice: signal.stopPrice,
            targetPrice: signal.targetPrice,
            entryTime: Date.now(),
          });
          store.recordOrderOutcome({ symbol: symbolName, source: signal.source, signalId: signal.id, outcome: 'filled', executionType: 'RECONCILE_VERIFIED' });
          console.warn(
            `[auto-execute] no push confirmation for ${symbolName}, but reconcile found a REAL OPEN POSITION ` +
              `positionId=${verified.positionId} - adopted, belief kept (this is the orphan case the old ` +
              'assume-nothing-happened branch used to create).'
          );
          this._notifyText(
            `🟢 [${signal.source.toUpperCase()}] Position RÉELLEMENT ouverte sur ${symbolName} (confirmé en interrogeant le courtier, le message de confirmation s'est perdu) - suivie normalement.`
          );
        } else {
          // Genuinely nothing at the broker - now VERIFIED, not assumed.
          // 2026-09-14 reasoning still applies here: leaving the belief
          // stuck would reject every later signal on this symbol as
          // 'netting' until someone manually called
          // /admin/clear-believed-position, and there is nothing real to
          // protect, so clear it.
          store.strategyEngine.clearBelievedPosition(symbolName, signal.id);
          // 2026-09-18: name the refusal when the broker gave us one.
          // "no orderId within timeout ... never reached the broker" is
          // accurate but says nothing actionable, and it is what three real
          // refused orders looked like while the reason went unread. When
          // _submitOrder has just recorded a rejection for THIS submission
          // (lastOrderRejection, set moments ago on the same await chain),
          // the reason belongs in the line a human actually reads.
          // Bounded to this submission on purpose: lastOrderRejection is
          // the LAST refusal ever seen, so without this an unrelated
          // refusal from hours ago would get blamed for today's timeout -
          // a worse failure than saying nothing.
          const lastRefusal = this.lastOrderRejection;
          const refusal = lastRefusal && lastRefusal.receivedAtMs >= submittedAtMs ? lastRefusal : null;
          const reason = refusal ? ` Motif du courtier : ${refusal.errorCode ?? 'sans code'} - ${refusal.description ?? 'aucune description'}.` : '';
          console.warn(
            `[auto-execute] no orderId within timeout for ${symbolName} AND reconcile found nothing real - order never reached the broker, clearing believed-open.` +
              (refusal ? ` Broker refusal: errorCode=${refusal.errorCode} description=${refusal.description}` : '')
          );
          this._notifyText(
            `⚠️ [${signal.source.toUpperCase()}] Aucune confirmation du courtier sur ${symbolName} et aucun ordre/position réels trouvés (vérifié) - signal abandonné, croyance nettoyée.${reason}`
          );
        }
      }
    } catch (err) {
      console.warn(`[auto-execute] failed to submit entry for ${symbolName}:`, err.message);
      this._notifyText(`⚠️ [${signal.source.toUpperCase()}] Échec de l'envoi de l'entrée sur ${symbolName} (${err.message}) - à vérifier manuellement`);
    }
  },

  async _cancelOrder(orderId) {
    const accountId = Number(this.accountId);
    await this.connection.sendCommand('ProtoOACancelOrderReq', {
      ctidTraderAccountId: accountId,
      orderId: Number(orderId),
    });
  },

  _handleExecutionEvent(event) {
    const store = this.account;
    // Same observability gap as _handleAutoExecuteEntry above - every real
    // execution event (fill, reject, cancel, expiry) used to be invisible
    // in Render's server logs, visible only via ntfy (and only for the
    // subset _notifyText actually announces). One line per event, cheap
    // and unconditional, so "did the broker ever answer at all" is
    // answerable from `render logs` alone.
    console.log(`[execution-event] type=${event.executionType} orderId=${event.order?.orderId ?? 'n/a'} positionId=${event.position?.positionId ?? event.deal?.positionId ?? 'n/a'}`);
    // 2026-09-14 (Esdras, live: a real BTCUSD take-profit close on positionId
    // 41549468/orderId 50200971 produced exactly one ORDER_FILLED event that
    // did NOT enter the closePositionDetail branch below - the durable
    // real-P&L journal silently missed it. dealPairing.js proves
    // closePositionDetail definitely exists for this same close (it's what
    // ProtoOADealListReq/the boot "last 24h of closed deals" load and
    // /trade-history read), so the gap is in what THIS push event
    // (ProtoOAExecutionEvent) actually carries for a broker-triggered
    // TP/SL bracket fill specifically - never confirmed live before tonight
    // (every previously-logged real close in this journal was a MANUAL/
    // guardrail-driven close, a different code path). Dumping the raw
    // event.deal/event.position here (once, only on ORDER_FILLED, cheap)
    // until the next real close reveals the actual shape - don't guess at
    // a fix for an undocumented broker payload.
    if (event.executionType === 'ORDER_FILLED') {
      console.log('[execution-event:raw-fill] deal=' + JSON.stringify(event.deal) + ' position=' + JSON.stringify(event.position));
    }
    // A position closed on the broker side -> feed it into the guardrail engine
    // as ground truth (real trade, not a demo simulation).
    if (event.executionType === 'ORDER_FILLED' && event.deal?.closePositionDetail) {
      const pnl = Number(event.deal.closePositionDetail.grossProfit) / 100;
      // 2026-09-16: prefer the broker's OWN resulting balance over
      // `store.balance + pnl`. closePositionDetail carries a `balance` field
      // (an int64-as-string, same as everything else here) that is the
      // account's real balance right after this close - accumulating our own
      // running total instead drifts away from it on anything we don't see:
      // swaps, commissions, manual trades placed from the cTrader app, and
      // every close that happened while this process was down. Falls back to
      // the old running-total behaviour only when the field is absent.
      const balanceAfter = parseBrokerMoney(
        event.deal.closePositionDetail.balance,
        event.deal.closePositionDetail.moneyDigits
      );
      store.setBalance(balanceAfter !== null ? balanceAfter : store.balance + pnl);
      // String(...) (2026-09-18) - same reasoning as _loadClosedDeals' own
      // recordTrade call above: event.deal.symbolId comes from
      // ProtoOAExecutionEvent, a different message than symbolNameById's
      // ProtoOASymbolsListReq origin.
      store.guardrail.recordTrade({ pnl, time: Date.now(), balanceAfter: store.balance, symbol: this.symbolNameById.get(String(event.deal.symbolId)) });

      // 2026-09-14 (Esdras: "corrige pour voir le vrai P&L du courtier"):
      // logs the REAL outcome/pnl to the durable Supabase journal, using
      // the context captured at fill time above - only for a position THIS
      // process actually opened via auto-execute (pyramid legs aren't
      // tracked here, a known gap, not fixed tonight). outcome/rMultiple
      // are derived from the real `pnl` above, not a simulated stop/target
      // guess - matches what dealPairing.js's trade-history view already
      // computes from the same closePositionDetail.
      {
        const closedPositionId = String(event.deal.positionId ?? event.position?.positionId);
        const info = this.openPositionInfoByPositionId.get(closedPositionId);
        if (info) {
          this.openPositionInfoByPositionId.delete(closedPositionId);
          // 2026-09-22: whatever closed it (the broker's own stop, or our proactive ProtoOAClosePositionReq below on a signal exit) - the daily
          // strategy no longer holds a real position on this symbol either way, so the mutual-exclusion check above must see it as flat again.
          if (MANAGED_SOURCES.has(info.source) && String(this.dailyPositionBySymbol.get(info.symbolName)?.positionId) === closedPositionId) {
            this.dailyPositionBySymbol.delete(info.symbolName);
            // B reversal (2026-09-24): its new entry waited for this close - send it now if still fresh.
            const queued = this.pendingEntryAfterClose.get(info.symbolName);
            if (queued) {
              this.pendingEntryAfterClose.delete(info.symbolName);
              if (Date.now() <= queued.until) this._executeMomentumEvent(queued.ev).catch((err) => console.error(`[A/B] ${info.symbolName}: queued re-entry failed: ${err.message}`));
            }
          }
          Promise.resolve(logClosedTrade(this.tradeLogClient, {
            symbol: info.symbolName,
            source: info.source,
            direction: info.direction,
            outcome: pnl >= 0 ? 'win' : 'loss',
            rMultiple: info.riskAmount > 0 ? pnl / info.riskAmount : null,
            entryPrice: info.entryPrice,
            entryTime: info.entryTime,
            exitTime: Date.now(),
            // Real broker $ (pnl, computed above from grossProfit) and the
            // real resulting balance (store.setBalance already applied it
            // just above) - Esdras's calendar request needs actual dollars/
            // %, not just R-multiples.
            pnlUsd: pnl,
            balanceAfter: store.balance,
            extra: extraTradeFields(info, Number(event.deal.executionPrice)),
          })).then(() => refreshKillSwitch(this.tradeLogClient)).catch((err) => console.warn(`[kill-switch] rafraîchissement après clôture : ${err.message}`));
          // 2026-09-14 (found live, monitoring BTCUSD right after the
          // null-orderId fix): the engine's own belief (openPositions) was
          // NEVER cleared by a REAL confirmed close - only by its OWN
          // internal candle-simulated stop/target check
          // (_resolveOpenPosition, liveStrategyEngine.js) catching up on a
          // LATER candle, or by the other clearBelievedPosition() call
          // sites (boot cleanup, an order that never filled at all). On
          // BTCUSD's fast M1 cadence the broker's real bracket order can
          // close a position before the engine's own per-candle simulation
          // re-checks it, leaving a real "believed-only" gap. Confirmed
          // live: after a real close, reconciliation kept reporting
          // botBelievesOpen:true/realOpenCount:0 for several minutes -
          // harmless to the account itself (netting correctly kept
          // rejecting every later signal rather than risking a second real
          // position on top), but it silently threw away every real signal
          // in that window, the exact "aucune erreure" gap Esdras asked to
          // watch for. Clearing it here, the moment reality is actually
          // confirmed, is the direct fix - matched by id so a newer signal
          // already superseding this one on the same symbol is never
          // clobbered (see clearBelievedPosition's own guard).
          store.strategyEngine.clearBelievedPosition(info.symbolName, info.signalId);
        }
      }
      // Prop-firm challenge target alert (2026-09, multi-account rollout -
      // see src/propFirms/index.js). Fires ONCE on the first real close that
      // confirms the target; GuardrailEngine now blocks every new entry until
      // the operator reviews the account and applies the next phase.
      if (store.guardrail.consumeTargetReachedEvent()) {
        this._notifyText(`🎯 Cible atteinte sur ${store.label} (+${store.guardrail.targetPct}%) - solde ${store.balance.toFixed(2)}. La prop firm devrait bientôt fournir le compte de la phase suivante.`);
      }

      // If the position that just closed was a pyramid add-on leg (tracked
      // purely by positionId here - see constructor comment), clean up the
      // side-map. Its win/loss is ALREADY counted above like any other
      // trade; this is bookkeeping only, not a second pnl application.
      const positionId = event.deal.positionId ?? event.position?.positionId;
      // BUG FOUND 2026-09-17 (execution-path audit): this was a bare `===`,
      // the ONLY positionId/orderId comparison anywhere in this file NOT
      // wrapped in Number(...) - every other one is (see
      // _findRealOrderOrPositionForLabel/_waitForOrderIdBySymbol/_loadBalance/
      // dealPairing.js), specifically because this broker is confirmed to
      // sometimes serialize the SAME conceptual int64 field as a JSON string
      // and sometimes as a number depending on the message type. `trackedId`
      // here can come from event.position?.positionId at pyramid-fill time
      // OR from a ProtoOAReconcileReq position.positionId (the
      // reconcile-verified fill path) - two different message shapes from
      // two different call sites, never guaranteed to agree on string vs
      // number with THIS event's own `positionId`. A silent mismatch would
      // leave pyramidPositionIdBySymbol never cleaned up (a small, permanent
      // leak) AND skip the pyramid-close notification - no safety impact
      // (the position itself is already correctly closed/journaled above,
      // independent of this map), but real, matching this file's own
      // established discipline everywhere else.
      for (const [symbolName, trackedId] of this.pyramidPositionIdBySymbol) {
        if (Number(trackedId) === Number(positionId)) {
          this.pyramidPositionIdBySymbol.delete(symbolName);
          this._notifyText(`🔺 Pyramide auto : unité ajoutée sur ${symbolName} clôturée (résultat ${pnl >= 0 ? 'gagnant' : 'perdant'}, ${pnl.toFixed(2)}$)`);
          break;
        }
      }
    }

    // The pyramid add-on's PENDING order just got filled (opened, not
    // closed) - tell the engine so it stops tracking it as "pending" (from
    // here it's a broker-managed bracket position, see markPyramidOrderFilled),
    // and remember its positionId so the eventual close above can be
    // attributed correctly. Matched by the broker-assigned orderId we
    // recorded at placement time, NOT by parsing the order's label - more
    // robust if a given API response doesn't echo the label back.
    if (event.executionType === 'ORDER_FILLED' && !event.deal?.closePositionDetail && event.order?.orderId != null) {
      const symbolName = this.pyramidOrderSymbolByOrderId.get(String(event.order.orderId));
      if (symbolName) {
        this.pyramidOrderSymbolByOrderId.delete(String(event.order.orderId));
        const filled = store.strategyEngine.markPyramidOrderFilled(symbolName);
        const positionId = event.position?.positionId ?? event.deal?.positionId;
        if (filled && positionId != null) {
          this.pyramidPositionIdBySymbol.set(symbolName, positionId);
          // BUG FOUND 2026-09-17 (execution-path audit): a pyramid leg used
          // to be tracked ONLY in pyramidPositionIdBySymbol (close-time
          // notification only) - never in openPositionInfoByPositionId,
          // which is what BOTH the periodic missing-stop-loss resubmission
          // sweep (_clearStaleBeliefsAgainstBroker -> computeMissingStopFixes
          // -> getTrackedStopPrice) AND the durable Supabase journal
          // (logClosedTrade, below in the closePositionDetail branch) read
          // from. Concretely: if the broker ever dropped a pyramid leg's
          // stop-loss (the exact 2026-09-14 BTCUSD incident, which happened
          // to an original entry, not a pyramid leg - but the code path is
          // identical), the automatic resubmission would silently skip it
          // ("never observed this position's own entry" - false, we did,
          // just not here), and its eventual win/loss would never reach the
          // durable journal either - both already flagged as "a known gap,
          // not fixed tonight" in this file's own history, closed now with
          // the one piece of data (filled.stopPrice/targetPrice/entryPrice)
          // this method already has and the two consumers already read.
          // signalId: null is safe - clearBelievedPosition (called below on
          // close) only clears a REAL match by id, and a pyramid leg was
          // never in `openPositions` under any id to begin with.
          this.openPositionInfoByPositionId.set(String(positionId), {
            symbolName,
            source: 'pyramid',
            signalId: null,
            direction: filled.direction,
            entryPrice: filled.entryPrice,
            riskAmount: filled.riskAmount,
            stopPrice: filled.stopPrice,
            targetPrice: filled.targetPrice,
            entryTime: Date.now(),
          });
          this._notifyText(`🔺 Pyramide auto : 2e unité REMPLIE sur ${symbolName} à ${filled.entryPrice} (stop ${filled.stopPrice}, cible ${filled.targetPrice})`);
        }
      }
    }

    // Real outcome of an auto-execute ENTRY order this process submitted
    // (see _handleAutoExecuteEntry/pendingEntryOrderByOrderId above) -
    // 2026-09, at Esdras's explicit request after "un ordre était passé"
    // turned out to only mean the engine's own optimistic belief, not a
    // confirmed broker fill. ORDER_FILLED here means a real position just
    // opened (never has closePositionDetail, matching the pyramid check
    // above); CANCELLED/EXPIRED/REJECTED mean the order never became a real
    // position at all - which the engine's own 'validated'-time belief
    // (openPositions, set optimistically before any of this is known) has
    // no way to find out about on its own. executionType names per
    // spotware/openapi-proto-messages' ProtoOAExecutionType - EXPIRED is
    // the one a GOOD_TILL_DATE limit that never got touched again should
    // produce, not yet confirmed against a real response (same "written
    // against documentation" caveat as the rest of this file).
    // BUG FOUND 2026-09-18 (execution-path audit continued): String(...) on
    // the lookup key, not the raw event.order.orderId - see the matching
    // fix/tests on pyramidOrderSymbolByOrderId above and the
    // openPositionInfoByPositionId/pyramidPositionIdBySymbol precedent this
    // mirrors. pendingEntryOrderByOrderId can be populated from THREE
    // different broker message types (a ProtoOAExecutionEvent ACCEPTED via
    // _waitForOrderIdBySymbol, or a ProtoOAReconcileRes order/position via
    // the reconcile-verified fallback - see _handleAutoExecuteEntry), and
    // this broker is confirmed (repeatedly, this session) to serialize the
    // same conceptual int64 field as a string or a number depending on which
    // message it came from. A bare `.has(event.order.orderId)` would
    // silently never match a fallback-adopted order whose type happened to
    // differ from this later FILLED/CANCELLED event's own orderId - exactly
    // the connection state the fallback exists to survive.
    const pendingOrderKey = String(event.order?.orderId);
    if (event.order?.orderId != null && this.pendingEntryOrderByOrderId.has(pendingOrderKey)) {
      const pending = this.pendingEntryOrderByOrderId.get(pendingOrderKey);
      const unfilledTypes = new Set(['ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_REJECTED']);
      if (event.executionType === 'ORDER_FILLED' && !event.deal?.closePositionDetail) {
        this.pendingEntryOrderByOrderId.delete(pendingOrderKey);
        // 2026-09-14: remember this REAL position (String() - see this
        // class's own openPositionInfoByPositionId comment for why) so the
        // eventual real close below can log a durable trade row from
        // confirmed broker data, not a simulated guess.
        const filledPositionId = event.position?.positionId ?? event.deal?.positionId;
        if (filledPositionId != null) {
          const fillPx = Number(event.deal?.executionPrice ?? event.order?.executionPrice);
          this.openPositionInfoByPositionId.set(String(filledPositionId), { ...pending, entryTime: Date.now(), fillPrice: Number.isFinite(fillPx) && fillPx > 0 ? fillPx : null, spreadAtEntry: this.lastSpreadBySymbol.get(pending.symbolName) ?? null });
          // 2026-09-22 (RSI(2)/US500 daily, real execution): remember which real position is "the daily strategy's" so its later signal-based
          // exit (SMA5 recovery / time-out - never a stop/target the broker itself resolves) knows exactly what to close, and so
          // _handleAutoExecuteEntry's mutual-exclusion check above can see it. volumeCents straight from the broker fill, in the SAME 0.01-of-a-
          // unit the close request needs (ProtoOAClosePositionReq.volume) - no re-derivation from our own lot math.
          if (MANAGED_SOURCES.has(pending.source)) {
            const volumeCents = Number(event.deal?.filledVolume ?? event.deal?.volume);
            if (Number.isFinite(volumeCents) && volumeCents > 0) {
              this.dailyPositionBySymbol.set(pending.symbolName, pending.source === DAILY_RSI2_STRATEGY ? { positionId: filledPositionId, volumeCents, at: Date.now() } : { positionId: filledPositionId, volumeCents, source: pending.source, at: Date.now() });
            } else {
              console.warn(`[mode-alerte->reel] RSI(2)/${pending.symbolName}: fill confirmed but no usable volume on the deal - a later signal exit may not find anything to close.`);
            }
          }
        }
        logOrderEvent(this.tradeLogClient, { symbol: pending.symbolName, source: pending.source, event: 'filled', side: pending.direction === 'bullish' ? 'buy' : 'sell', price: Number(event.deal?.executionPrice ?? event.order?.executionPrice), detail: `orderId=${event.order.orderId} signalPrice=${pending.signalPrice}` });
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'filled', executionType: event.executionType });
        console.log(`[auto-execute] CONFIRMED FILLED: ${pending.symbolName} source=${pending.source} orderId=${event.order.orderId} - real position opened at the broker.`);
        this._notifyText(`✅ [${pending.source.toUpperCase()}] Ordre confirmé REMPLI sur ${pending.symbolName} - position réellement ouverte chez le courtier.`);
      } else if (unfilledTypes.has(event.executionType)) {
        this.pendingEntryOrderByOrderId.delete(pendingOrderKey);
        store.recordOrderOutcome({ symbol: pending.symbolName, source: pending.source, signalId: pending.signalId, outcome: 'unfilled', executionType: event.executionType });
        logOrderEvent(this.tradeLogClient, { symbol: pending.symbolName, source: pending.source, event: event.executionType === 'ORDER_REJECTED' ? 'rejected' : event.executionType === 'ORDER_EXPIRED' ? 'expired' : 'cancelled', side: pending.direction === 'bullish' ? 'buy' : 'sell', price: pending.signalPrice, detail: `orderId=${event.order.orderId} ${event.executionType}` });
        console.log(`[auto-execute] CONFIRMED UNFILLED: ${pending.symbolName} source=${pending.source} orderId=${event.order.orderId} executionType=${event.executionType} - no real position, clearing believed-open.`);
        // The engine believed this was open the moment it validated the
        // signal (see _processFvgEvent etc.) - now confirmed wrong. Clear
        // it so the dashboard stops showing a ghost "believed open"
        // position for up to 5 days (maxHoldingCandles) instead of the
        // true "nothing happened" state, matched by id so a NEWER signal
        // on the same symbol (opened after this one) is never clobbered by
        // a late-arriving confirmation for the old one.
        store.strategyEngine.clearBelievedPosition(pending.symbolName, pending.signalId);
        this._notifyText(`⚠️ [${pending.source.toUpperCase()}] Ordre JAMAIS rempli sur ${pending.symbolName} (${event.executionType}) - aucune position réelle, signal abandonné.`);
      }
    }
  },
};
