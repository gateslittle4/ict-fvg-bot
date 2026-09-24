// managedStrategies.js - méthodes de CTraderDataSource (src/dataSources/cTraderDataSource.js), découpées le 2026-09-24 sans changement de
// comportement. Stratégies gérées : RSI(2) journalier, A (ORB 5 min) et B (noise area) - moteurs, préchauffage, entrées et sorties réelles.
// Rattachées à la classe par Object.assign(CTraderDataSource.prototype, ...) : `this` est l'instance, comme avant.

import { CONFIG } from '../../config.js';

import { FIXED_EST_TO_UTC_OFFSET_MS } from '../../backtest/nySession.js';

import { logOrderEvent, logAlertSignal } from '../demoTrackingLog.js';
import { DailyAlertEngine } from '../../dailyAlertEngine.js';
import { IntradayMomentumEngine, NOISE_STRATEGY } from '../../intradayMomentumEngine.js';
import { isStrategyEnabled, loadStrategySwitches } from '../../strategySwitches.js';

import { DAILY_RSI2_STRATEGY, momentumEntryBlockReason, momentumOrderSignal } from '../../execution/entryPolicy.js';
import fs from 'node:fs';
import zlib from 'node:zlib';

import { sendCommandWithTimeout } from './shared.js';

export const managedStrategiesMethods = {

  /**
   * First tick of a NEW bar (2026-09-21). 1) Ask the broker for the last few bars and overwrite the ones the engine tracked from
   * ticks with their final values (the feed can miss a bar's last ticks); 2) only then evaluate the new bar. If the broker
   * request fails or times out (4 s), the tick-tracked values are used - never a reason to miss the entry.
   */

  /**
   * Boot-time warm-up of the "mode alerte" daily engines (2026-09-22) - see this method's own caller comment and dailyAlertEngine.js's header.
   * Only US500/RSI(2) exists today (the sole candidate that cleared the pre-registered t>=2 bar - FVG/XAGUSD is a WEAKER candidate, t=0.81,
   * deliberately NOT tracked live yet). Warms up from the bundled real M1 history (data/real-m1-full/US500.csv.gz, real UTC, shifted -5h to
   * engine time like every other real-data script in this project) rather than the live feed's own 90-day window, because the daily engine
   * needs ~200 daily bars (SMA200) - far more history than 90 days of M15 warm-up gives it. Silent (warmUp()), so this never logs a flood of
   * historical alerts - only NEW live bars produce events from here on.
   */
  async _loadDailyAlertEngines() {
    this.dailyAlertEngines = new Map();
    // 2026-09-22, Esdras's EXPLICIT, eyes-open decision ("on le code" - real execution now, not waiting for more mode-alerte confirmation):
    // RSI(2)/US500 (research-memory `prereg-batch3-results-2026-09-21`, t=2.23 - the pre-registered bar was cleared, but this is still a candidate
    // with real caveats: ~58 test trades likely not independent, US100 nearly passed the same test, tested almost entirely inside one long bull
    // market, swap assumed not measured). To revert to observation-only, empty this Set - dailyAlertEngines above keeps logging to
    // bot_alert_signals either way, real orders only fire for a symbol listed here.
    this.dailyLiveExecutionSymbols = new Set(['US500']);
    if (!this.symbols.includes('US500')) return; // nothing to track if this account doesn't even trade US500
    const file = 'data/real-m1-full/US500.csv.gz';
    if (!fs.existsSync(file)) {
      console.warn('[cTrader] mode-alerte: no local M1 history for US500 (data/real-m1-full/US500.csv.gz missing) - skipping');
      return;
    }
    const engine = new DailyAlertEngine({ strategy: DAILY_RSI2_STRATEGY, symbol: 'US500' });
    // 2026-09-22 FIX (production incident: OOM crash loop within ~35s of every boot, heap saturated at 256 MB - see HANDOFF.md): this used to
    // .split('\n') the whole decompressed text (~1.5M lines) into an array, then map it into a SECOND array of ~1.5M candle objects, both held
    // in memory at once on top of the live bot's own state - on Render's 512 MB instance that alone was enough to crash it. Now scans the
    // decompressed string in place (no line array) and feeds each candle to warmUp() one at a time (no candle array) - peak extra memory is
    // just the decompressed text itself (a few tens of MB), not two ~1.5M-element arrays.
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    let pos = text.indexOf('\n') + 1; // skip the header line
    let count = 0;
    let lastFileTime = -Infinity; // engine time of the file's last bar
    while (pos > 0 && pos < text.length) {
      let end = text.indexOf('\n', pos);
      if (end === -1) end = text.length;
      if (end > pos) {
        const line = text.slice(pos, end);
        const c1 = line.indexOf(','), c2 = line.indexOf(',', c1 + 1), c3 = line.indexOf(',', c2 + 1), c4 = line.indexOf(',', c3 + 1);
        if (c1 > 0 && c2 > c1 && c3 > c2 && c4 > c3) {
          const time = Number(line.slice(0, c1)) - FIXED_EST_TO_UTC_OFFSET_MS;
          engine.ingest(
            { time, open: Number(line.slice(c1 + 1, c2)), high: Number(line.slice(c2 + 1, c3)), low: Number(line.slice(c3 + 1, c4)), close: Number(line.slice(c4 + 1)) },
            { silent: true }
          );
          lastFileTime = time;
          count++;
        }
      }
      pos = end + 1;
    }
    // 2026-09-24 FIX (bug hunt, Esdras : « cherche tout autre défaut ») : the file above is the one COMMITTED in the repo - it stops on the
    // day it was exported (2026-09-21 03:43 UTC), and every boot since fed live bars on top of it with the days in between simply
    // missing (RSI(2), SMA5, ATR and the position state computed on a daily series with holes - 3 days missing at the 2026-09-24 deploy,
    // and growing). Top up with the broker's own M15 history from the file's end to now before going live.
    let topUp = 0;
    try {
      const gapDays = Math.ceil((Date.now() - (lastFileTime + FIXED_EST_TO_UTC_OFFSET_MS)) / 86400000) + 1;
      if (Number.isFinite(gapDays) && gapDays > 0) {
        const recent = await this.getHistoricalCandles({ symbol: 'US500', days: Math.min(gapDays, 240), timeframe: 'M15' });
        for (const c of recent) {
          const time = c.time - FIXED_EST_TO_UTC_OFFSET_MS; // broker candles are real UTC, the daily engine runs on engine time
          if (time <= lastFileTime) continue;
          engine.ingest({ time, open: c.open, high: c.high, low: c.low, close: c.close }, { silent: true });
          lastFileTime = time;
          topUp++;
        }
      }
    } catch (err) {
      console.warn(`[cTrader] mode-alerte: complément d'historique US500 depuis le courtier impossible (${err.message}) - RSI(2) démarre avec un trou depuis la fin du fichier.`);
    }
    this.dailyAlertEngines.set('US500', engine);
    console.log(`[cTrader] mode-alerte: RSI(2)/US500 warmed up on ${count} bars + ${topUp} broker M15 bars since the file's end (${engine.bars.length} jours), position=${engine.position ? 'ouverte' : 'plate'}`);
  },

  /**
   * Feeds one new live M15 candle to any daily engine tracking this symbol and logs whatever it fires (always, for the durable record -
   * bot_alert_signals). For a symbol in `dailyLiveExecutionSymbols` (2026-09-22, Esdras: "on le code", explicit eyes-open acceptance of an
   * unvalidated candidate - see HANDOFF.md and research-memory `prereg-batch3-results-2026-09-21`, t=2.23, NOT a strong result), an 'entry'/'exit'
   * event ALSO drives a real order, through the SAME guardrail and the SAME _handleAutoExecuteEntry() every other mechanism uses - see that
   * method's own mutual-exclusion check and this method's guardrail check below for why a second, uncoordinated real position on the same
   * symbol can never happen. A failure anywhere in this path is caught and logged, never thrown - the live intraday combo must never be affected
   * by this strategy's own trouble.
   */
  _feedDailyAlertEngines(symbolName, engineCandle, previousFinalBar = null) {
    const engine = this.dailyAlertEngines?.get(symbolName);
    if (!engine) return;
    let events;
    try {
      // 2026-09-23: complete the previous bar first (see DailyAlertEngine.updateFormingBar) - engineCandle is only the new bar's first tick.
      if (previousFinalBar) engine.updateFormingBar?.(previousFinalBar);
      events = engine.ingest(engineCandle);
    } catch (err) {
      console.warn(`[cTrader] mode-alerte (${symbolName}) ingest failed (non-fatal): ${err.message}`);
      return;
    }
    for (const ev of events) {
      console.log(`[mode-alerte] ${ev.strategy} ${ev.symbol} ${ev.event} ${ev.direction ?? ''} @ ${ev.price} (${ev.detail})`);
      logAlertSignal(this.tradeLogClient, ev);
      if (this.dailyLiveExecutionSymbols?.has(symbolName)) {
        this._executeDailyStrategySignal(symbolName, ev).catch((err) =>
          console.error(`[mode-alerte->reel] ${ev.strategy} ${symbolName} ${ev.event}: échec (non-fatal pour le reste du bot): ${err.message}`)
        );
      }
    }
  },

  /** Turns one DailyAlertEngine event into a real order, reusing the existing auto-execute/close machinery. Never throws (caller wraps it). */
  async _executeDailyStrategySignal(symbolName, ev) {
    const store = this.account;
    const symbolId = this.symbolIdByName.get(symbolName);
    if (symbolId == null) { console.warn(`[mode-alerte->reel] ${symbolName}: pas de symbolId - abandon`); return; }
    if (ev.event === 'entry') {
      // Same guardrail every intraday mechanism is subject to (3 trades clôturés/jour, pause 30 min après perte, arrêt du jour) - a real RSI(2)
      // trade/loss counts against the SAME shared FTMO-facing budget as the rest of the combo, and vice versa, by design (one account, one risk).
      if (!store.guardrail.canTakeNewTrade(Date.now(), symbolName)) {
        console.log(`[mode-alerte->reel] ${ev.strategy} ${symbolName}: entrée bloquée par le garde-fou partagé (voir GuardrailEngine).`);
        logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: ev.strategy, event: 'skipped', side: 'buy', price: ev.price, detail: 'blocked by shared guardrail' });
        return;
      }
      await this._handleAutoExecuteEntry(symbolName, symbolId, {
        id: `${ev.strategy}-${symbolName}-${ev.barTime}`,
        source: ev.strategy,
        suggestedSide: ev.direction === 'bullish' ? 'buy' : 'sell',
        entryPrice: ev.price,
        stopPrice: ev.stopPrice,
        targetPrice: null, // signal-based exit (SMA5/time-out), not a price target - see adjustMarketProtectionForSpread's null-target branch
        distance: Math.abs(ev.price - ev.stopPrice),
      });
      return;
    }
    if (ev.event === 'exit') {
      const held = this.dailyPositionBySymbol.get(symbolName);
      if (held && held.source && held.source !== ev.strategy) {
        console.log(`[mode-alerte->reel] ${ev.strategy} ${symbolName}: la position suivie appartient à ${held.source} - rien à fermer.`);
        return;
      }
      if (!held) {
        // Nothing real to close: either the entry order never actually filled at the broker (rejected/expired), or the broker's own stop
        // already closed it and _handleExecutionEvent's generic close branch already cleared dailyPositionBySymbol - either way, correct to do
        // nothing here, not an error worth escalating (ev.detail === 'stop' from OUR simulation is the expected, harmless case for the latter).
        if (ev.detail !== 'stop') console.log(`[mode-alerte->reel] ${ev.strategy} ${symbolName}: signal de sortie (${ev.detail}) mais aucune position réelle suivie - rien à faire.`);
        return;
      }
      if (ev.detail === 'stop') return; // our own simulated stop-touch: the broker's real stop order resolves this on its own, never race it with a close
      try {
        await sendCommandWithTimeout(this.connection, 'ProtoOAClosePositionReq', {
          ctidTraderAccountId: Number(this.accountId),
          positionId: held.positionId,
          volume: held.volumeCents,
        });
        console.log(`[mode-alerte->reel] ${ev.strategy} ${symbolName}: clôture envoyée (positionId=${held.positionId}, raison=${ev.detail}).`);
        logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: ev.strategy, event: 'close_sent', side: 'sell', price: ev.price, detail: `positionId=${held.positionId} reason=${ev.detail}` });
        // dailyPositionBySymbol is cleared by _handleExecutionEvent's generic close branch once the broker confirms the close, not here - this
        // request can still be rejected, and a rejection must leave the position tracked as open (it still is).
      } catch (err) {
        console.error(`[mode-alerte->reel] ${ev.strategy} ${symbolName}: échec de l'envoi de la clôture (positionId=${held.positionId}): ${err.message}`);
      }
    }
  },

  /**
   * 2026-09-24 - A (cassure de la bougie d'ouverture de 5 min, US100) et B (« noise area », US500) sur CE compte (Esdras : « mets-le dans le
   * même compte, il faut que tout soit enregistré au même endroit »). Règles : preregistration-intraday-momentum-2026-09-23.md, décisions par
   * IntradayMomentumEngine (mêmes fonctions que l'étude, test de parité sur M1 réel). Préchauffage : 30 jours de M1 du broker ; ensuite des
   * barres M1 construites à partir des ticks (bid). Best-effort : un échec ici ne touche jamais le combo.
   */
  async _startIntradayMomentum() {
    const cfg = CONFIG.intradayMomentum;
    if (!cfg?.enabled) return;
    const orbSymbols = (cfg.orb?.symbols || []).filter((s) => this.symbols.includes(s));
    const noiseSymbols = (cfg.noise?.symbols || []).filter((s) => this.symbols.includes(s));
    if (!orbSymbols.length && !noiseSymbols.length) return;
    const switches = await loadStrategySwitches(this.tradeLogClient);
    console.log(`[A/B] interrupteurs : A ${switches.orb5 ? 'actif' : 'DÉSACTIVÉ'}, B ${switches.noise ? 'actif' : 'DÉSACTIVÉ'}`);
    const engine = new IntradayMomentumEngine({ orbSymbols, noiseSymbols, lookback: cfg.noise?.lookback ?? 14 });
    for (const symbol of engine.symbols) {
      const bars = await this.getHistoricalCandles({ symbol, days: cfg.warmupDays ?? 30, timeframe: 'M1' });
      engine.addBars(symbol, bars);
      console.log(`[A/B] ${symbol}: ${bars.length} barres M1 de préchauffage, ${engine.sessionCount(symbol)} séances.`);
    }
    this.intradayMomentum = engine;
    if (this._momentumClock) clearInterval(this._momentumClock);
    this._momentumClock = setInterval(() => {
      try {
        for (const { symbol, bar } of this.tickBars.flush(Date.now())) this._onMomentumBar(symbol, bar);
        for (const ev of engine.onClock(Date.now())) this._handleMomentumEvent(ev);
      } catch (err) {
        console.warn(`[A/B] clock tick failed (non-fatal): ${err.message}`);
      }
    }, 5000);
    this._momentumClock.unref?.();
    console.log(`[A/B] actif : A (ORB 5 min) sur ${orbSymbols.join(', ') || '-'}, B (noise area) sur ${noiseSymbols.join(', ') || '-'}.`);
  },

  _onMomentumBar(symbol, bar) {
    let events;
    try {
      events = this.intradayMomentum.ingestBar(symbol, bar);
    } catch (err) {
      console.warn(`[A/B] ${symbol}: ingestBar failed (non-fatal): ${err.message}`);
      return;
    }
    for (const ev of events) this._handleMomentumEvent(ev);
  },

  _handleMomentumEvent(ev) {
    const price = this.account.lastCandleBySymbol.get(ev.symbol)?.close ?? null;
    console.log(`[A/B] ${ev.strategy} ${ev.symbol} ${ev.type} ${ev.side}${ev.reason ? ` (${ev.reason})` : ''}`);
    logAlertSignal(this.tradeLogClient, {
      strategy: ev.strategy, symbol: ev.symbol, event: ev.type, direction: ev.side === 'buy' ? 'bullish' : 'bearish', price,
      stopPrice: ev.stopPrice ?? null, targetPrice: null, rMultiple: null, barTime: ev.time,
      detail: ev.type === 'exit' ? ev.reason : ev.strategy === NOISE_STRATEGY ? `check=${ev.check} vol14=${ev.vol14}` : `range=${ev.rangeLow}-${ev.rangeHigh}`,
    });
    this._executeMomentumEvent(ev).catch((err) => console.error(`[A/B] ${ev.strategy} ${ev.symbol} ${ev.type}: échec (non-fatal): ${err.message}`));
  },

  /** One A/B engine event -> real order / real close, through the shared guardrail and _handleAutoExecuteEntry. Never throws (caller catches). */
  async _executeMomentumEvent(ev) {
    const store = this.account;
    const cfg = CONFIG.intradayMomentum || {};
    const symbolName = ev.symbol;
    const held = this.dailyPositionBySymbol.get(symbolName);
    const skip = (detail) => {
      console.log(`[A/B] ${ev.strategy} ${symbolName} ${ev.type}: ${detail}`);
      logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: ev.strategy, event: 'skipped', side: ev.side, price: store.lastCandleBySymbol.get(symbolName)?.close ?? null, detail });
    };
    if (ev.type === 'exit') {
      if (!held || held.source !== ev.strategy) return; // never filled, already stopped/targeted by the broker, or someone else's position
      if (held.closing) return;
      held.closing = true;
      try {
        await sendCommandWithTimeout(this.connection, 'ProtoOAClosePositionReq', { ctidTraderAccountId: Number(this.accountId), positionId: held.positionId, volume: held.volumeCents });
        logOrderEvent(this.tradeLogClient, { symbol: symbolName, source: ev.strategy, event: 'close_sent', side: ev.side === 'buy' ? 'sell' : 'buy', price: store.lastCandleBySymbol.get(symbolName)?.close ?? null, detail: `positionId=${held.positionId} reason=${ev.reason}` });
      } catch (err) {
        held.closing = false;
        console.error(`[A/B] ${ev.strategy} ${symbolName}: échec de l'envoi de la clôture (positionId=${held.positionId}): ${err.message}`);
      }
      return;
    }
    // entry
    if (!isStrategyEnabled(ev.strategy)) return skip(momentumEntryBlockReason({ strategyEnabled: false }));
    if (!store.isAutoExecuteActive()) return skip('auto-execute inactive');
    if (held && held.source === ev.strategy && held.closing) { this.pendingEntryAfterClose.set(symbolName, { ev, until: Date.now() + 60000 }); return; }
    // Pair already held (managed strategy or combo), shared guardrail: entryPolicy.momentumEntryBlockReason, shared with the replay.
    const blocked = momentumEntryBlockReason({
      heldBy: held ? (held.source ?? DAILY_RSI2_STRATEGY) : null,
      comboHolds: Boolean(store.strategyEngine.getOpenPosition?.(symbolName)),
      guardrailOk: store.guardrail.canTakeNewTrade(Date.now(), symbolName),
    });
    if (blocked) return skip(blocked);
    const symbolId = this.symbolIdByName.get(symbolName);
    const spec = this._specFor(symbolName);
    const bid = store.lastCandleBySymbol.get(symbolName)?.close;
    const spread = this.lastSpreadBySymbol.get(symbolName) ?? 0;
    if (symbolId == null || !spec || !(bid > 0)) return skip('no symbol id / spec / price');
    // Stop / target / sizing stop / 4x cap: entryPolicy.momentumOrderSignal, the same function the replay uses.
    const plan = momentumOrderSignal(ev, { bid, spread, balance: store.balance, cfg });
    if (plan.skip) return skip(plan.skip);
    const notionalPerLot = (bid / (spec.pointSize || 1)) * (spec.valuePerPointPerLot || 1);
    const maxLots = notionalPerLot > 0 ? plan.maxNotional / notionalPerLot : undefined;
    const signal = plan.signal;
    await this._handleAutoExecuteEntry(symbolName, symbolId, {
      id: `${ev.strategy}-${symbolName}-${ev.time}`,
      source: ev.strategy,
      suggestedSide: ev.side,
      entryPrice: bid,
      maxLots,
      ...signal,
    });
  },
};
