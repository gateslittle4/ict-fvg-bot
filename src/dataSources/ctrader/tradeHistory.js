// tradeHistory.js - méthodes de CTraderDataSource (src/dataSources/cTraderDataSource.js), découpées le 2026-09-24 sans changement de
// comportement. Journal : historique des trades (deals du courtier + journal Supabase), bougies du graphique, check-lists de conformité.
// Rattachées à la classe par Object.assign(CTraderDataSource.prototype, ...) : `this` est l'instance, comme avant.

import { CONFIG } from '../../config.js';

import { FIXED_EST_TO_UTC_OFFSET_MS } from '../../backtest/nySession.js';
import { pairDealsIntoTrades } from '../dealPairing.js';

import { fetchRecentTradeRows, enrichTradesWithRMultiple, enrichTradesWithSlippage } from '../supabaseTradeLog.js';
import { buildComplianceChecklist, requiredH1LookbackCandles, requiredPreEntryContextCandles } from '../tradeCompliance.js';
import { buildChartOverlays } from '../../backtest/chartOverlays.js';

import { evaluateLiveFilters } from '../../backtest/liveFvgFilterStatus.js';
import { nwogLiveStatus, judasSwingLiveStatus, weeklySweepLiveStatus, breakerBlockLiveStatus, silverBulletLiveStatus, divergenceLiveStatus } from '../../backtest/liveMechanismStatus.js';
import { CHART_MARGIN_CANDLES, PERIOD_BY_TIMEFRAME, TIMEFRAME_DURATION_MS, resolveSymbolTimeframe, sendCommandWithTimeout } from './shared.js';

export const tradeHistoryMethods = {

  /**
   * Trading journal (2026-09, at the user's request): closed trades over the
   * last `days`, each with a small window of candles for a chart. No storage
   * of our own - always queried fresh from cTrader, so it survives restarts
   * for free (this session's explicit choice over adding a database).
   *
   * Two real limits, not worked around because working around them would
   * mean guessing/fabricating data rather than reporting it:
   * - ProtoOADealListReq caps `toTimestamp - fromTimestamp` at 1 week - `days`
   *   is clamped to 7 rather than silently sending an invalid request.
   * - cTrader's deal history has no field for a closed position's planned
   *   stop-loss/take-profit (ProtoOADeal has none; ProtoOAPosition does, but
   *   closed positions no longer appear in a positions listing) - so trade
   *   records intentionally carry only what IS verifiable from the deal
   *   itself (entry, exit, direction, realized P&L), never an invented stop.
   */
  async getTradeHistory({ days = 7, maxTrades = 20 } = {}) {
    const accountId = this.accountId;
    const to = Date.now();
    const from = to - Math.min(days, 7) * 24 * 3600 * 1000;
    const res = await sendCommandWithTimeout(this.connection, 'ProtoOADealListReq', {
      ctidTraderAccountId: Number(accountId),
      fromTimestamp: from,
      toTimestamp: to,
    });

    // Which strategy generated each trade (2026-09, at Esdras's request) -
    // ProtoOADeal itself has no label, only ProtoOAOrder.tradeData.label
    // does (set at order placement, see _handleAutoExecuteEntry below), so a
    // second request over the SAME window is needed. Best-effort: a failure
    // here must not break the trade history itself, it just leaves every
    // trade's source unknown (null) rather than guessed.
    let orderLabelsById = new Map();
    try {
      const orderRes = await sendCommandWithTimeout(this.connection, 'ProtoOAOrderListReq', {
        ctidTraderAccountId: Number(accountId),
        fromTimestamp: from,
        toTimestamp: to,
      });
      // String(...) key (2026-09-18, execution-path audit continued) - see
      // dealPairing.js's pairDealsIntoTrades() for the full reasoning: this
      // map's keys must agree with the DEAL's own orderId (a different
      // broker message, ProtoOADealListReq) regardless of how either message
      // actually serializes the field.
      orderLabelsById = new Map(
        (orderRes.order || []).map((o) => [String(o.orderId), o.tradeData && o.tradeData.label])
      );
    } catch (err) {
      console.warn('[cTrader] trade history: failed to fetch order labels (source will show as unknown):', err.message);
    }

    // BTCUSD (2026-09-17, Esdras: "retire tous les trade btc du journal, pas
    // besoin") - the temporary M1 connectivity smoke-test was retired from
    // live trading the same day it ran (see config.js/HANDOFF.md), but its
    // real historical trades kept showing up here since getTradeHistory()
    // just replays whatever the broker's own deal history returns, with no
    // notion of "still an active symbol". Filtered out BEFORE the
    // enrichment loop below (not just hidden client-side) so it also skips
    // the chart-candle/checklist broker fetches for trades nobody wants to
    // see - cheaper, not just tidier. symbolIdByName.get('BTCUSD') can be
    // undefined (symbol never loaded, e.g. a fresh account never subscribed
    // to it) - the `!== btcusdId` comparison then keeps every trade, which
    // is correct (nothing to filter out).
    const btcusdId = this.symbolIdByName.get('BTCUSD');
    const trades = pairDealsIntoTrades(res.deal || [], orderLabelsById)
      .filter((t) => t.symbolId !== btcusdId)
      .slice(0, maxTrades);

    const enriched = [];
    for (const trade of trades) {
      const symbolName = this.symbolNameById.get(String(trade.symbolId)) || `#${trade.symbolId}`; // String(...) - trade.symbolId originates from ProtoOADealListReq via dealPairing.js, a different message than symbolNameById's own ProtoOASymbolsListReq (2026-09-18)
      // 2026-09-14, Esdras (screenshot): the trade-history mini-chart looked
      // wrong for BTCUSD - was already flagged as a known, unfixed gap when
      // per-symbol timeframes shipped ("getTradeHistory()'s chart-candle
      // export still assume the global CONFIG.timeframe"). Concretely: a
      // BTCUSD trade lasting a few M1 minutes was being charted with M15
      // candles and a 3-HOUR margin sized for M15 - the real trade shrank to
      // a sliver between two dashed lines lost in hours of irrelevant
      // padding, exactly what the screenshot showed. Same per-symbol
      // resolution already used for live subscriptions/order-expiry - every
      // other symbol (still M15) is completely unaffected.
      const symbolTimeframe = resolveSymbolTimeframe(symbolName);
      const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
      // 30x, not 12x (2026-09-15, Esdras: "plusieurs bougies avant et après
      // de façon à avoir une vue d'ensemble sur tout le trade") - the
      // journal moved to its own dedicated page (no longer squeezed next to
      // a dozen other cards), so the chart can afford real context on both
      // sides instead of just enough to not look broken.
      // 90x (2026-09-24, Esdras: "dézoomer encore plus pour voir beaucoup plus de bougies") - about a full day on each side in M15.
      // count is sent explicitly: without it the broker silently caps a from/to request to its own small default (see
      // _attachComplianceChecklists's H1 fetch), which a window this wide would hit.
      const candleMs = TIMEFRAME_DURATION_MS[symbolTimeframe] || TIMEFRAME_DURATION_MS.M15;
      const chartMarginMs = CHART_MARGIN_CANDLES * candleMs;
      let candles = [];
      try {
        const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp: trade.entryTime - chartMarginMs,
          toTimestamp: trade.exitTime + chartMarginMs,
          symbolId: trade.symbolId,
          period,
          count: Math.ceil((trade.exitTime - trade.entryTime + 2 * chartMarginMs) / candleMs) + 2,
        });
        candles = (history.trendbar || [])
          .map((bar) => this._trendbarToCandle(bar))
          .sort((a, b) => a.time - b.time);
      } catch (err) {
        // err.message || JSON.stringify(err) (2026-09-13): a real occurrence
        // logged plain `undefined` here, meaning the rejection wasn't a real
        // Error (likely a raw ProtoOAErrorRes-shaped object from the broker,
        // which carries errorCode/description, not .message) - stringify
        // the whole thing as a fallback so a future occurrence is
        // diagnosable instead of showing nothing.
        console.warn(
          `[cTrader] trade history: failed to fetch chart candles for ${symbolName} position ${trade.positionId}:`,
          err.message || JSON.stringify(err)
        );
      }
      enriched.push({ ...trade, symbol: symbolName, candles });
    }

    // R-multiple (2026-09-15, Esdras: "toute information nécessaire pour un
    // vrai journal, le nombre de RRR etc") - cTrader's own deal history has
    // no concept of "risk amount" once a position is closed (this endpoint
    // deliberately shows no stop/target either, same reason - see the
    // dashboard card's own explanation), so rMultiple can only come from
    // the durable journal, which computed it at close time from the real
    // riskAmount (see openPositionInfoByPositionId/_handleExecutionEvent).
    // Best-effort join, matched by symbol + closest exit time - see
    // enrichTradesWithRMultiple's own header for the full reasoning.
    //
    // slippage (2026-09-15, Esdras: "qualité d'exécution") - same join,
    // this time comparing the durable journal's entryPrice (what the
    // SIGNAL targeted) against this endpoint's own entryPrice (the REAL
    // broker fill, opening.executionPrice from dealPairing.js) - see
    // enrichTradesWithSlippage's own header. Reuses the SAME durableRows
    // fetch, not a second round-trip.
    //
    // Both opt-in (same discipline as logClosedTrade itself): silently
    // skipped when Supabase persistence isn't configured, every trade just
    // keeps rMultiple/slippage: undefined rather than the endpoint failing.
    let withJournalData = enriched;
    if (this.tradeLogClient) {
      try {
        const durableRows = await fetchRecentTradeRows(this.tradeLogClient, { days: Math.min(days, 7) });
        withJournalData = enrichTradesWithSlippage(enrichTradesWithRMultiple(enriched, durableRows), durableRows);
      } catch (err) {
        console.warn('[cTrader] trade history: R-multiple/slippage enrichment skipped (durable journal query failed):', err.message);
      }
    }
    return this._attachComplianceChecklists(withJournalData, accountId);
  },

  /**
   * The trade's own CONFIG.<source> block - FVG stays per-symbol
   * (CONFIG.fvg.perSymbol[symbol]), every other live mechanism has one
   * shared config object (CONFIG.nwog/judasSwing/weeklySweep/breakerBlock/
   * silverBullet/divergence). null for an unrecognized/missing source
   * rather than throwing - buildComplianceChecklist() already degrades
   * gracefully to "non vérifiable" items when cfg is null.
   */
  _configForSource(source, symbol) {
    switch (source) {
      case 'fvg': return CONFIG.fvg.perSymbol[symbol] || null;
      case 'nwog': return CONFIG.nwog;
      case 'judaswing': return CONFIG.judasSwing;
      case 'weeklysweep': return CONFIG.weeklySweep;
      case 'breakerblock': return CONFIG.breakerBlock;
      case 'silverbullet': return CONFIG.silverBullet;
      case 'divergence': return CONFIG.divergence;
      default: return null;
    }
  },

  /**
   * "Preuve visuelle de conformité" (2026-09-15, Esdras, after seeing a
   * mockup: "donne tout, pour l'avoir dès le départ"; extended 2026-09-17,
   * Esdras: "combien de checklist on pourrait faire apparaitre? ... Tous")
   * - for each trade, reconstructs whether it actually followed the live
   * strategy's own real procedure, reusing the SAME production functions
   * per mechanism (FvgEngine/computeStop/buildHtfBiasSeries for FVG;
   * detectNwogEvents/detectJudasSwingEvents/detectWeeklySweepEvents/
   * computeBreakerBlockCandidates/computeSilverBulletCandidates for the
   * other 5) rather than a second implementation - see
   * tradeCompliance.js's own header for the full reasoning and its one
   * remaining honestly-scoped gap (Divergence's z-score item needs the
   * PARTNER symbol's history, never fetched here).
   *
   * Two SEPARATE extra broker fetches, neither reused for anything else:
   * - The HTF-bias item ('fvg' only) needs H1 candles far enough back to
   *   seed the configured EMA (requiredH1LookbackCandles), unchanged from
   *   before.
   * - The 5 event-based mechanisms need MORE M15 history before entryTime
   *   than the chart's own 30-candle margin gives (requiredPreEntryContextCandles)
   *   - fetched into a SEPARATE `reconstructionCandles` array, never merged
   *   into `trade.candles` (which stays exactly what the mini-chart
   *   displays - widening that too would make a Weekly Sweep trade's chart
   *   show ~10 days of mostly-irrelevant candles instead of a focused view).
   * A failure in either fetch degrades that item to "non vérifiable", never
   * blocks the rest of the trade's history from loading.
   */
  async _attachComplianceChecklists(trades, accountId) {
    const expectedRiskPct = this.account.strategyEngine?.riskPctPerTrade ?? null;
    const out = [];
    for (const trade of trades) {
      const cfg = this._configForSource(trade.source, trade.symbol);
      let h1Candles = null;
      if (trade.source === 'fvg' && cfg) {
        const lookback = requiredH1LookbackCandles(cfg.variant);
        if (lookback > 0) {
          try {
            // count is REQUIRED alongside fromTimestamp/toTimestamp (2026-09-15,
            // found live via getPendingZoneChecklists()'s own verification below -
            // this exact call, missing count, was silently capped to the
            // broker's own small default and came back too short to seed an
            // EMA200, degrading every bias reading to 'unknown' without ever
            // throwing - see _subscribeLiveCandles()'s own comment: "count alone
            // is not enough" for a from/to-only request to be REJECTED, but the
            // reverse - from/to without count - was never verified until now).
            const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
              ctidTraderAccountId: Number(accountId),
              fromTimestamp: trade.entryTime - lookback * TIMEFRAME_DURATION_MS.H1,
              toTimestamp: trade.entryTime,
              symbolId: trade.symbolId,
              period: 'H1',
              count: lookback,
            });
            h1Candles = (history.trendbar || []).map((bar) => this._trendbarToCandle(bar)).sort((a, b) => a.time - b.time);
          } catch (err) {
            console.warn(
              `[cTrader] trade history: HTF bias fetch failed for ${trade.symbol} (checklist item will read "non vérifiable"):`,
              err.message || JSON.stringify(err)
            );
          }
        }
      }

      let reconstructionCandles = trade.candles || [];
      const extraLookback = requiredPreEntryContextCandles(trade.source);
      if (extraLookback > 0) {
        try {
          const symbolTimeframe = resolveSymbolTimeframe(trade.symbol);
          const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
          const candleDurationMs = TIMEFRAME_DURATION_MS[symbolTimeframe] || TIMEFRAME_DURATION_MS.M15;
          const history = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
            ctidTraderAccountId: Number(accountId),
            fromTimestamp: trade.entryTime - extraLookback * candleDurationMs,
            toTimestamp: trade.entryTime,
            symbolId: trade.symbolId,
            period,
            count: extraLookback,
          });
          reconstructionCandles = (history.trendbar || []).map((bar) => this._trendbarToCandle(bar)).sort((a, b) => a.time - b.time);
        } catch (err) {
          console.warn(
            `[cTrader] trade history: reconstruction-context fetch failed for ${trade.symbol}/${trade.source} (checklist items will read "non vérifiable"):`,
            err.message || JSON.stringify(err)
          );
          reconstructionCandles = trade.candles || []; // fall back to the (too-narrow) chart candles rather than an empty array - some items may still resolve
        }
      }

      const { zone, items } = buildComplianceChecklist({ trade, candles: reconstructionCandles, cfg, h1Candles, expectedRiskPct });
      out.push({ ...trade, checklist: items, fvgZone: zone });
    }
    return out;
  },

  /**
   * "Pourquoi on n'a pas encore de trade" (2026-09-15, Esdras: "je verrais
   * ce qui est okay, ce qui ne l'est pas encore") - for every zone the real
   * engine currently considers 'watching' on this symbol, evaluates each of
   * the 4 real filter criteria (bias/structure/session/sweep) RIGHT NOW,
   * one by one - the live engine only ever computes their combined AND, so
   * this is the only way to see WHICH ONE is still missing. Reuses
   * buildChartOverlays() (chartOverlays.js) to find the genuinely still-
   * watching zones (its own 'stale' reclassification already handles a zone
   * that's silently outlived its real lifetime - see that file's own
   * comment), and evaluateLiveFilters() (liveFvgFilterStatus.js) for the
   * per-criterion check, both already-real production logic, nothing
   * reimplemented here.
   *
   * EXTENDED (2026-09-17, Esdras, sur le chart: "je veux le suivre de façon
   * live") - `zones` below stays FVG-only exactly as before (a real gap in
   * the checklist coverage: EURUSD/GER40 have no FVG config at all, so this
   * used to return `{zones: [], reason: 'not an FVG-strategy symbol'}` and
   * show NOTHING for them). Now also builds `mechanisms`: one live-status
   * entry per OTHER mechanism actually configured for this symbol (NWOG/
   * Judas Swing/Weekly Sweep/Breaker Block/Silver Bullet/Divergence - see
   * liveMechanismStatus.js for why these need a different shape than FVG's
   * own multi-criterion checklist: most of them fire on a single candle,
   * nothing to watch build up beforehand). The early FVG-only return is
   * GONE - a symbol with no FVG config (EURUSD/GER40) now still gets a
   * real response via `mechanisms`.
   *
   * Time convention, easy to get backwards (see liveFvgFilterStatus.js's
   * own header): `candles` here is store.strategyEngine's OWN retained
   * history, already in ENGINE time (real UTC - 5h, see _toEngineCandle()) -
   * so `atTime` (this symbol's freshest candle) is engine time too, and the
   * freshly-fetched H1 candles below are shifted the SAME way before use,
   * so the bias lookup stays self-consistent with atTime. tradeCompliance.js's
   * OWN bias check (for a closed trade) doesn't need this shift - it compares
   * two real-UTC values against each other - but that trick doesn't apply
   * here since atTime is forced into engine time by where it comes from.
   * liveMechanismStatus.js's own functions don't touch H1 bias at all, so
   * this same shift concern doesn't apply to them - they only ever compare
   * a symbol's own M15 history against itself (or, for Divergence, against
   * the partner's own M15 history, same engine-time convention on both
   * sides since both come from the same store.strategyEngine.getHistory()).
   */
  async getPendingZoneChecklists(symbol) {
    const store = this.account;
    const cfg = CONFIG.fvg.perSymbol[symbol];

    const historyBySymbol = {};
    for (const s of CONFIG.symbols) historyBySymbol[s] = store.strategyEngine.getHistory(s);
    const candles = historyBySymbol[symbol];
    if (!candles || candles.length === 0) return { symbol, zones: [], mechanisms: [], reason: 'no candle history yet' };

    const atTime = candles[candles.length - 1].time;

    let zones = [];
    if (cfg) {
      const { zones: allZones } = buildChartOverlays(historyBySymbol, { symbol });
      const watching = allZones.filter((z) => z.status === 'watching');

      let h1Candles = null;
      const lookback = requiredH1LookbackCandles(cfg.variant);
      if (watching.length > 0 && lookback > 0) {
        try {
          const symbolId = this.symbolIdByName.get(symbol);
          const nowRealUtc = Date.now();
          // count REQUIRED alongside fromTimestamp/toTimestamp - see
          // _attachComplianceChecklists()'s own comment on this same mistake,
          // found live via this exact endpoint: omitted, the broker silently
          // caps the response far short of `lookback`, too little history to
          // seed the EMA, and every bias reading below degrades to 'unknown'
          // without ever throwing (so the catch below never caught it either).
          const res = await sendCommandWithTimeout(this.connection, 'ProtoOAGetTrendbarsReq', {
            ctidTraderAccountId: Number(this.accountId),
            fromTimestamp: nowRealUtc - lookback * TIMEFRAME_DURATION_MS.H1,
            toTimestamp: nowRealUtc,
            symbolId,
            period: 'H1',
            count: lookback,
          });
          h1Candles = (res.trendbar || [])
            .map((bar) => this._trendbarToCandle(bar))
            .sort((a, b) => a.time - b.time)
            .map((bar) => ({ ...bar, time: bar.time - FIXED_EST_TO_UTC_OFFSET_MS })); // real UTC -> engine time, matching atTime
        } catch (err) {
          console.warn(
            `[cTrader] pending zone checklist: HTF bias H1 fetch failed for ${symbol} (bias item will read "non vérifiable"):`,
            err.message || JSON.stringify(err)
          );
        }
      }

      zones = watching.map((z) => ({
        id: z.id,
        direction: z.direction,
        top: z.top,
        bottom: z.bottom,
        formedAt: z.formedAt,
        checklist: evaluateLiveFilters({ candles, h1Candles, cfg, direction: z.direction, atTime }),
      }));
    }

    const mechanisms = [];
    if (CONFIG.nwog.symbols.includes(symbol)) mechanisms.push(nwogLiveStatus(candles, { longOnlySymbols: CONFIG.nwog.longOnlySymbols, symbol }));
    if (CONFIG.judasSwing.symbols.includes(symbol)) mechanisms.push(judasSwingLiveStatus(candles));
    if (CONFIG.weeklySweep.symbols.includes(symbol)) mechanisms.push(weeklySweepLiveStatus(candles));
    if (CONFIG.breakerBlock.symbols.includes(symbol)) mechanisms.push(breakerBlockLiveStatus(candles));
    if (CONFIG.silverBullet.symbols.includes(symbol)) mechanisms.push(silverBulletLiveStatus(candles));
    if (CONFIG.divergence.pair.includes(symbol)) {
      const [symA, symB] = CONFIG.divergence.pair;
      const partnerSymbol = symbol === symA ? symB : symA;
      const partnerCandles = historyBySymbol[partnerSymbol];
      if (partnerCandles && partnerCandles.length > 0) {
        mechanisms.push(divergenceLiveStatus(symbol, candles, partnerCandles, CONFIG.divergence));
      }
    }

    return { symbol, zones, mechanisms };
  },
};
