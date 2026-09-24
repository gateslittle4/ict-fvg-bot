// marketData.js - méthodes de CTraderDataSource (src/dataSources/cTraderDataSource.js), découpées le 2026-09-24 sans changement de
// comportement. Données de marché : historique de bougies, abonnement aux bougies live, nouvelle bougie, conversion trendbar -> bougie.
// Rattachées à la classe par Object.assign(CTraderDataSource.prototype, ...) : `this` est l'instance, comme avant.

import { CONFIG } from '../../config.js';

import { FIXED_EST_TO_UTC_OFFSET_MS } from '../../backtest/nySession.js';

import { PERIOD_BY_TIMEFRAME, MAX_TRENDBARS_PER_REQUEST, planHistoryWindows, TIMEFRAME_DURATION_MS, resolveSymbolTimeframe, MAX_SPREAD_SAMPLES, sendCommandWithTimeout, foldLiveBidIntoCandle } from './shared.js';

export const marketDataMethods = {

  /**
   * On-demand historical export (2026-09, ad-hoc research request: "peux-tu
   * tester le bot sur les 8 derniers mois qui viennent de passer" - the
   * existing 2019-2025 CSV backtests, and the live engine's own 90-day
   * retained history, both stop short of covering that). Distinct from the
   * 90-day _subscribeLiveCandles() warm-up above: that window is capped at
   * 90 days ON PURPOSE (keeps boot time down), but the underlying cTrader
   * API accepts up to 35 weeks (~245 days) in a SINGLE ProtoOAGetTrendbarsReq
   * for the M15 bucket (see that method's own comment) - 8 months (~243
   * days) fits in one call, no pagination needed.
   *
   * Read-only, no side effects on store/strategyEngine/live trading - this
   * exists purely to export raw candles for offline research with the SAME
   * backtestEngine.js used for the 2019-2025 CSVs, not to feed anything live.
   */
  async getHistoricalCandles({ symbol, days, timeframe = null, skipDays = 0 }) {
    const symbolId = this.symbolIdByName.get(symbol);
    if (!symbolId) throw new Error(`Unknown symbol "${symbol}" on this cTrader account`);
    const tf = timeframe || CONFIG.timeframe;
    const period = PERIOD_BY_TIMEFRAME[tf] || 'M15';
    const barsPerDay = { M1: 1440, M5: 288, M15: 96, M30: 48, H1: 24 }[period] || 96;
    // One request per window of at most MAX_TRENDBARS_PER_REQUEST bars (M15 for ~245 days fits in one window, as it
    // always did; M1/M5 are paged backwards and merged - 2026-09-20, finer candles to settle which of a stop and a
    // target came first inside a 15-minute bar).
    const windows = planHistoryWindows(days, barsPerDay, MAX_TRENDBARS_PER_REQUEST);
    const byTime = new Map();
    const now = Date.now();
    for (const w of windows) {
      const history = await sendCommandWithTimeout(
        this.connection,
        'ProtoOAGetTrendbarsReq',
        { ctidTraderAccountId: Number(this.accountId), fromTimestamp: now - (skipDays + w.fromDaysAgo) * 86400000, toTimestamp: now - (skipDays + w.toDaysAgo) * 86400000, symbolId, period, count: Math.ceil(w.spanDays * barsPerDay) + 10 },
        60000
      );
      for (const bar of history.trendbar || []) { const c = this._trendbarToCandle(bar); byTime.set(c.time, c); }
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  },

  async _subscribeLiveCandles(accountId) {
    const store = this.account;

    for (const symbolName of this.symbols) {
      const symbolId = this.symbolIdByName.get(symbolName);
      if (!symbolId) {
        console.warn(`[cTrader] symbol "${symbolName}" not found on this account - skipping`);
        continue;
      }

      // Per-symbol timeframe (2026-09-13, temporary BTCUSD override - see
      // resolveSymbolTimeframe()'s own comment). `period` used to be
      // resolved ONCE outside this loop from the single global
      // CONFIG.timeframe - every symbol besides BTCUSD still gets exactly
      // that same value, this just makes the lookup per-iteration instead
      // of hoisted, which changes nothing for them.
      const symbolTimeframe = resolveSymbolTimeframe(symbolName);
      const period = PERIOD_BY_TIMEFRAME[symbolTimeframe] || 'M15';
      const isM1Override = symbolTimeframe === 'M1';

      // Warm up with a MUCH deeper history than the raw-FvgEngine days: the filtered
      // combo needs enough M15 candles behind it for its slowest lookback to be
      // meaningful - the H4/EMA200 bias alone needs ~3200 M15 candles (200 H4 bars) of
      // warm-up before its EMA reading means anything, and the Divergence z-score
      // needs `lookback` H1 bars (config-driven) on top of that. ~90 days of M15
      // (24/5 markets, so this over-counts a bit) covers both with room to spare.
      // fromTimestamp/toTimestamp are REQUIRED fields on ProtoOAGetTrendbarsReq (count
      // alone is not enough - confirmed against OpenApiMessages.proto after the first
      // live deploy rejected a count-only request). The M10-H1 bucket (which M15 falls
      // into) caps the from/to span at 35 weeks, so this single 90-day window request
      // needs no pagination.
      // isM1Override (BTCUSD only): baseline config has NO HTF-bias/structure
      // lookback at all - the only real warm-up need is CONFIG.fvg.maxAgeCandles
      // (50) of context for zone staleness. A much smaller window (2 days of
      // M1 = 2880 candles) covers that with room to spare, and - unverified,
      // but worth avoiding rather than risking it - M1 is very likely capped
      // at a MUCH shorter from/to span per request than the 35 weeks the
      // M10-H1 bucket gets, so requesting 90 days of M1 here could simply be
      // rejected by the broker.
      const WARMUP_MS = isM1Override ? 2 * 24 * 60 * 60 * 1000 : 90 * 24 * 60 * 60 * 1000;
      const WARMUP_CANDLE_CAP = isM1Override ? 2 * 24 * 60 : 90 * 24 * 4;
      const toTimestamp = Date.now();
      const fromTimestamp = toTimestamp - WARMUP_MS;
      console.log(`[cTrader] ${symbolName}: requesting ${WARMUP_CANDLE_CAP} ${period} candles of warm-up history...`);
      const history = await sendCommandWithTimeout(
        this.connection,
        'ProtoOAGetTrendbarsReq',
        {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp,
          toTimestamp,
          symbolId,
          period,
          count: WARMUP_CANDLE_CAP,
        },
        60000 // this single response can be tens of thousands of bars across 3 symbols - give it more room than the default before calling it stuck
      );
      console.log(`[cTrader] ${symbolName}: received ${(history.trendbar || []).length} warm-up candles, warming up...`);
      const sortedBars = (history.trendbar || []).sort((a, b) => a.utcTimestampInMinutes - b.utcTimestampInMinutes);
      const engineCandles = sortedBars.map((bar) => {
        const candle = this._trendbarToCandle(bar);
        store.lastCandleBySymbol.set(symbolName, candle); // dashboard display, real UTC - see _toEngineCandle() below
        return this._toEngineCandle(candle);
      });
      // 2026-09 FIX: this used to call ingestCandle() once per historical
      // candle, which rebuilds+replays the WHOLE retained history from
      // scratch on EVERY call (see the old comment this replaced, and
      // HANDOFF.md's "découverte de performance") - O(n) per call, O(n^2)
      // total, measured live at ~14 minutes to warm up 3 symbols. warmUp()
      // (see liveStrategyEngine.js) reconstructs the identical end state in
      // ONE pass instead - proven bit-for-bit equivalent to the old
      // candle-by-candle replay against real market data in
      // test/liveStrategyEngine.test.js ("bulk single-pass reconstruction is
      // IDENTICAL to sequential ingestCandle() replay"), and ~900x faster
      // locally (99ms vs 89s for a full 90-day/3-symbol window) - comfortably
      // sub-second even accounting for Render's much slower free-tier CPU
      // (previously observed ~15-20x slower than local for this same work).
      // Deliberately silent (see warmUp()'s own doc): no notify/dashboard
      // side effects for historical bars - these are already-past price
      // action, only the FINAL reconstructed state (openPositions etc.)
      // matters once warm-up is done. The heartbeat-preserving yield the old
      // loop needed (multi-minute synchronous work would starve the
      // heartbeat setInterval and get the session dropped for inactivity) is
      // no longer necessary at this speed, but is kept as cheap insurance in
      // case a slower host ever makes this take more than a few seconds.
      store.strategyEngine.warmUp({ [symbolName]: engineCandles });
      await new Promise((resolve) => setImmediate(resolve));
      console.log(`[cTrader] ${symbolName}: warm-up complete`);

      // ProtoOASubscribeLiveTrendbarReq's own doc (OpenApiMessages.proto) says it
      // "Requires subscription on the spot events, see ProtoOASubscribeSpotsReq" -
      // this was missing entirely, which is why the trendbar subscription below
      // timed out with no response on the first live deploy (confirmed: adding
      // this call is what makes ProtoOASpotEvent - already listened for below -
      // actually start arriving).
      await sendCommandWithTimeout(this.connection, 'ProtoOASubscribeSpotsReq', {
        ctidTraderAccountId: Number(accountId),
        symbolId: [symbolId],
      });

      await sendCommandWithTimeout(this.connection, 'ProtoOASubscribeLiveTrendbarReq', {
        ctidTraderAccountId: Number(accountId),
        symbolId,
        period,
      });
      console.log(`[cTrader] ${symbolName}: subscribed to live ${period} candles`);

      this.connection.on('ProtoOASpotEvent', (rawEvent) => {
        // ROOT CAUSE FIX (2026-09-10): rawEvent is a CTraderLayerEvent
        // WRAPPER (see CTraderLayerEmitter.notifyListeners() and
        // CTraderLayerEvent - #type/#date/#descriptor are private class
        // fields, only reachable via getters). The real ProtoOASpotEvent
        // fields (symbolId, bid, ask, trendbar, ...) live under
        // rawEvent.descriptor, NOT on rawEvent itself - every access below
        // used to read straight off rawEvent and silently get `undefined`
        // for everything, all day, every boot: `Number(undefined) !==
        // Number(symbolId)` is always true, so this listener body never ran
        // past the guard below. That's the actual explanation for the
        // frozen dashboard price AND the spread-check endpoint's "zero
        // samples" - not the symbolId BigInt/Number type-mismatch fixed
        // below (still correct and kept, but it was never the blocking
        // issue - `undefined` fails a `Number()` comparison exactly the
        // same way a BigInt/Number mismatch would). Confirmed by logging
        // rawEvent with JSON.stringify(), which prints `{}` for ANY object
        // whose only own fields are private class fields behind getters -
        // that misleadingly looked like "the event never fires" when it
        // actually meant "the event fires constantly, JSON.stringify just
        // can't see it". console.log(rawEvent) directly (Node's
        // util.inspect, not JSON.stringify) would have shown the wrapper's
        // real shape immediately.
        const event = rawEvent.descriptor;

        // protobuf int64 fields are sometimes decoded as BigInt rather than
        // Number depending on the specific field/library path - `1n !== 1`
        // is ALWAYS true (different types). Number() is safe for both here:
        // cTrader symbol ids are small, well within Number.MAX_SAFE_INTEGER.
        if (Number(event.symbolId) !== Number(symbolId)) return;

        // Signal detection is driven by full candle BARS (the trendbar
        // payload, present only on some spot events).
        if (event.trendbar) {
          for (const bar of event.trendbar) {
            const candle = this._trendbarToCandle(bar);
            const engineCandle = this._toEngineCandle(candle);
            if (store.strategyEngine.isNewBar(symbolName, engineCandle.time)) {
              // First tick of a new bar: finish the previous bar with the broker's final values, THEN evaluate signals (see
              // _ingestNewLiveBar). Async on purpose; a duplicate first-tick event while it runs is dropped by its own guard.
              this._ingestNewLiveBar(symbolName, symbolId, candle, engineCandle);
            } else {
              // Later ticks of the bar already tracked: keep its OHLC current (2026-09-21 fix - they used to be thrown away, which
              // left one-tick stubs in the engine's history). No signal evaluation on an update.
              store.strategyEngine.ingestCandle(symbolName, engineCandle, Date.now(), { deferCloseToRealConfirmation: true });
              store.lastCandleBySymbol.set(symbolName, candle);
            }
          }
        }

        // LIVE PRICE: bid/ask arrive on EVERY tick, far more often than a
        // trendbar update. Fold the freshest bid into the displayed last
        // candle so the chart/dashboard price is genuinely live between
        // trendbar updates instead of frozen (see foldLiveBidIntoCandle).
        // Same /100000 scaling as _trendbarToCandle - VERIFY against a real
        // spot event's bid units before trusting the magnitude (display-only,
        // so a scaling error is cosmetic, never a wrong order).
        // Number(...) with an `!= null` guard, NOT `typeof === 'number'`
        // (2026-09-13, real bug found live tonight while chasing why
        // BTCUSD never traded): this broker serializes plenty of numeric
        // protobuf fields as JSON STRINGS (confirmed repeatedly tonight -
        // orderId, positionId, executionTimestamp, grossProfit, volume,
        // symbolId all showed up quoted in a real raw dump), and a strict
        // `typeof === 'number'` check silently treats a string bid/ask as
        // absent. This means `recentTicksBySymbol` (the ONLY mechanism
        // meant to verify DEFAULT_SPREADS' guessed values against reality -
        // see /admin/spread-check) has likely NEVER recorded a single real
        // tick since this feature was added, on ANY symbol, despite the
        // dashboard's own live price clearly moving - that price comes from
        // the trendbar's `close` a few lines below (a different, unaffected
        // code path), not from this bid/ask folding, so the frozen-looking
        // "0 samples" result never got noticed as a problem until tonight.
        const bid = event.bid != null ? Number(event.bid) / 100000 : null;
        const existing = store.lastCandleBySymbol.get(symbolName);
        const folded = foldLiveBidIntoCandle(existing, bid);
        if (folded && folded !== existing) store.lastCandleBySymbol.set(symbolName, folded);
        // A/B (2026-09-24): after the fold, so an order sent on this tick uses THIS tick's bid.
        if (bid !== null && this.intradayMomentum?.symbols.includes(symbolName)) {
          for (const { symbol, bar } of this.tickBars.onTick(symbolName, Date.now(), bid)) this._onMomentumBar(symbol, bar);
        }

        // Real-spread sampling (2026-09, at the user's request: "est-ce que
        // le spread est celui qu'on avait planifié?" - see accountRuntime.js's
        // recentTicksBySymbol comment). Same /100000 scaling assumption as
        // bid above (VERIFY against a real response, same caveat). Only
        // recorded when the SAME tick carries both sides - a tick with just
        // one side updated doesn't represent a real spread at that instant.
        const ask = event.ask != null ? Number(event.ask) / 100000 : null;
        if (bid !== null && ask !== null) {
          if (!store.recentTicksBySymbol.has(symbolName)) store.recentTicksBySymbol.set(symbolName, []);
          const ticks = store.recentTicksBySymbol.get(symbolName);
          ticks.push({ bid, ask, time: Date.now() });
          this.spreadAggregator.record(symbolName, ask - bid, Date.now());
          this.lastSpreadBySymbol.set(symbolName, ask - bid);
          if (ticks.length > MAX_SPREAD_SAMPLES) ticks.shift();
        }
      });
    }
  },

  async _ingestNewLiveBar(symbolName, symbolId, candle, engineCandle) {
    const store = this.account;
    const key = `${symbolName}|${engineCandle.time}`;
    if (!this._newBarInFlight) this._newBarInFlight = new Set();
    if (this._newBarInFlight.has(key)) return;
    this._newBarInFlight.add(key);
    try {
      try {
        await this._reconcileRecentBars(symbolName, symbolId);
      } catch (err) {
        console.warn(`[bar-reconcile] ${symbolName}: broker refresh failed (tick-tracked bars kept): ${err.message}`);
      }
      if (!store.strategyEngine.isNewBar(symbolName, engineCandle.time)) return;
      // The previous bar, now final (reconciled just above) - the daily strategy must see it complete, not the first-tick stub it got.
      const previousFinalBar = store.strategyEngine.getLastCandle?.(symbolName) ?? null;
      // Date.now() explicitly (2026-09-14) - see liveStrategyEngine.js's ingestCandle() comment: _toEngineCandle's -5h shift is
      // correct for signal/session logic but must NOT reach GuardrailEngine's real-calendar-day bookkeeping.
      // deferCloseToRealConfirmation: true (2026-09-14) - only this live call site gets it (real-close confirmation loop).
      const events = store.strategyEngine.ingestCandle(symbolName, engineCandle, Date.now(), { deferCloseToRealConfirmation: true });
      store.pushSignalEvents(events);
      store.lastCandleBySymbol.set(symbolName, candle);
      this._feedDailyAlertEngines(symbolName, engineCandle, previousFinalBar);
      const actionable = events.filter((e) => e.type === 'validated' && !e.blockedReason);
      if (actionable.length > 0) this._notify(actionable);
      if (actionable.length > 0 && store.isAutoExecuteActive()) {
        // A divergence signal can be for the PARTNER leg of the pair (emitted when this symbol's bar completes the pair - see
        // liveStrategyEngine._detectDivergenceSignal, 2026-09-23): route every order to its own symbol, never to the bar's symbol.
        for (const sig of actionable) {
          const sigSymbol = sig.symbol ?? symbolName;
          const sigSymbolId = sigSymbol === symbolName ? symbolId : this.symbolIdByName.get(sigSymbol);
          if (sigSymbolId == null) { console.warn(`[auto-execute] no symbol id for ${sigSymbol} - signal ${sig.id} skipped`); continue; }
          this._handleAutoExecuteEntry(sigSymbol, sigSymbolId, sig);
        }
      }
      for (const e of events) {
        if (e.type === 'pyramid-order-requested') this._handlePyramidOrderRequested(symbolName, symbolId, e);
        if (e.type === 'pyramid-order-cancel-requested') this._handlePyramidOrderCancelRequested(symbolName, e);
        if (e.type === 'closed' && e.outcome === 'timeout' && store.isAutoExecuteActive()) this._closeRealPositionsAfterTimeout(symbolName, symbolId, e);
      }
    } catch (err) {
      console.error(`[live-bar] ${symbolName}: new-bar handling failed: ${err.stack || err.message}`);
    } finally {
      this._newBarInFlight.delete(key);
    }
  },

  async _reconcileRecentBars(symbolName, symbolId) {
    const store = this.account;
    const timeframe = resolveSymbolTimeframe(symbolName);
    const period = PERIOD_BY_TIMEFRAME[timeframe] || 'M15';
    const barMs = TIMEFRAME_DURATION_MS[timeframe] || TIMEFRAME_DURATION_MS.M15;
    const now = Date.now();
    const res = await sendCommandWithTimeout(
      this.connection,
      'ProtoOAGetTrendbarsReq',
      { ctidTraderAccountId: Number(this.accountId), fromTimestamp: now - 6 * barMs, toTimestamp: now, symbolId, period, count: 8 },
      4000
    );
    const finals = (res.trendbar || []).map((b) => this._toEngineCandle(this._trendbarToCandle(b)));
    const changes = store.strategyEngine.reconcileRecentCandles(symbolName, finals, { includeNewest: true });
    this._reconcileStats = this._reconcileStats || { checks: 0, mismatches: 0 };
    this._reconcileStats.checks++;
    if (changes.length > 0) {
      this._reconcileStats.mismatches++;
      // Evidence for the 2026-09-21 diagnosis, and a permanent health signal: how far the tick-tracked bar was from the final one.
      // Rate-limited (first 40, then every 20th) so a chatty feed cannot flood the logs.
      const n = this._reconcileStats.mismatches;
      if (n <= 40 || n % 20 === 0) {
        const c = changes[0];
        console.log(`[bar-reconcile] ${symbolName}: tracked bar ${new Date(c.time + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(11, 16)}Z corrected by the broker's final values (dHigh ${c.dHigh.toFixed(4)}, dLow ${c.dLow.toFixed(4)}, dClose ${c.dClose.toFixed(4)}) - ${n} of ${this._reconcileStats.checks} bar checks so far`);
      }
    }
    return changes;
  },

  _trendbarToCandle(bar) {
    // Trendbars encode OHLC as deltas from `low` in relative price units;
    // exact scaling depends on symbol digits - VERIFY against a real response.
    const low = bar.low / 100000;
    return {
      time: bar.utcTimestampInMinutes * 60 * 1000, // genuine UTC (cTrader's field name says so, and it's the documented convention) - correct for display (store.lastCandleBySymbol) and for expirationTimestamp sent to the broker. Do NOT feed this straight into the strategy engine - see _toEngineCandle().
      open: low + bar.deltaOpen / 100000,
      high: low + bar.deltaHigh / 100000,
      low,
      close: low + bar.deltaClose / 100000,
    };
  },

  // BUG FIX (found live, 2026-09-08): the shared filtered-engine pipeline
  // (buildFilteredEngine() -> nySession.js's SessionFilteredFvgEngine, used
  // identically by backtest and live per liveStrategyEngine.js's design)
  // was built and validated entirely against HistData.com CSV candles, whose
  // `.time` uses a FIXED EST-as-UTC convention (see nySession.js's header) -
  // i.e. backtest `.time` is always exactly 5h BEHIND true UTC. cTrader's
  // live candles are genuine UTC (see _trendbarToCandle() above), so passing
  // them straight into ingestCandle() made every NY-session-window check
  // evaluate the wrong wall-clock hour by a flat 5h (confirmed live: at real
  // NY time 21:25, the session filter was computing NY time 02:25) - the
  // Silver Bullet (10-11h NY) and London-NY overlap (7-10h NY) windows were
  // effectively checking 05:00-06:00 and 02:00-05:00 NY instead, well
  // outside the killzones the whole combo was validated on.
  // This shifts ONLY the copy handed to the strategy engine into that same
  // fixed-EST-as-UTC convention, so its internal HTF/structure/sweep
  // bucketing and session-window check match backtest-validated behavior
  // exactly. The ORIGINAL true-UTC `candle` (from _trendbarToCandle) is
  // still what's stored in store.lastCandleBySymbol and used for
  // expirationTimestamp - those must stay in real time, not this shifted
  // convention. One side effect, cosmetic only: signal timestamps derived
  // from the engine's candle (validatedAt, shown as "validé HH:MM" on the
  // dashboard) will display 5h behind the real validation time - same
  // convention backtest reports have always used, not a new inconsistency,
  // but worth fixing in the dashboard layer later if it's ever confusing.
  _toEngineCandle(candle) {
    return { ...candle, time: candle.time - FIXED_EST_TO_UTC_OFFSET_MS };
  },
};
