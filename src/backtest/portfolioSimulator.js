// portfolioSimulator.js
// Guardrail-aware, multi-symbol portfolio simulation.
//
// Unlike gridRunner's single-symbol grid search (which measures pure
// R-multiple edge, ignoring account-level rules and letting every valid
// signal "trade"), this reuses the EXACT SAME GuardrailEngine class the live
// bot uses (src/engines/guardrailEngine.js) to gate every candidate entry
// across ALL symbols sharing one account, and compounds a real
// percentage-of-balance risk per trade — so the resulting equity curve and
// drawdown are what the live bot would actually have produced, not an
// idealized "every signal gets taken" number.
//
// Guardrail semantics (unchanged from guardrailEngine.js, used as-is):
//   - maxTradesPerDay counts trades that have CLOSED so far today (matches
//     how the live dashboard/bot checks the gate before opening a NEW trade
//     — it can only know about trades that have already resolved)
//   - cooldownMinutesAfterLoss starts from the last CLOSED trade's close time
//   - dailyLossLimitPct blocks further entries once today's realized loss
//     (from closed trades) reaches this % of the day's starting balance
// The gate is consulted at every candidate entry, across BOTH symbols,
// because the guardrail budget is shared/global (per the user's explicit
// choice earlier in this project).
//
// Methodological note vs. the single-symbol grid: here, a signal whose stop
// is too tight vs. the spread (non-viable) is skipped BEFORE it would occupy
// the "one open trade per symbol" slot — a real trader wouldn't take it
// either, so it shouldn't block the next signal from being considered. The
// single-symbol grid (gridRunner.js) instead runs every signal through
// runBacktest first and drops non-viable ones only when computing stats
// afterward, so its "viable signal" counts can differ slightly from this
// simulator's for the same config.

import { GuardrailEngine } from '../engines/guardrailEngine.js';
import { computeStop } from './backtestEngine.js';
import { buildFilteredEngine } from './gridRunner.js';

/**
 * @param {object} opts
 * @param {Record<string, Array>} opts.candlesBySymbol - e.g. {EURUSD: [...], GBPUSD: [...]}
 * @param {Record<string, object>} opts.configBySymbol - per-symbol {variant, stopMode, rrMultiple, structureEnabled, sessionEnabled, spread}
 * @param {number} opts.riskPctPerTrade - e.g. 0.5 for 0.5% of current balance, compounding.
 *   Ignored (but still required as a fallback for pyramid add-ons) when
 *   `adaptiveRiskConfig` is provided.
 * @param {number} opts.startingBalance - e.g. 10000
 * @param {object} [opts.guardrailConfig] - passed straight to `new GuardrailEngine(...)`
 * @param {number} [opts.swingLookback]
 * @param {number} [opts.maxHoldingCandles]
 * @param {number} [opts.minDistanceSpreadMultiple] - same viability rule as the rest of the project
 * @param {object} [opts.adaptiveRiskConfig] - optional streak-based risk ladder, SHARED
 *   across all symbols (one risk level tracked off the single chronological
 *   close-time sequence, exactly like the guardrail's shared trade budget).
 *   { base, step, cap, stepDown, floor } - all in percent-of-balance units:
 *     - starts at `base` (e.g. 0.25)
 *     - after a trade that CLOSES PROFITABLY (pnl > 0): riskPct = min(riskPct + step, cap)
 *     - after a trade that closes at a loss/breakeven-or-worse (pnl <= 0):
 *       - if this is the FIRST such trade since the last profitable close: riskPct resets to `base`
 *       - if it's an ADDITIONAL one in the same losing streak: riskPct = max(riskPct - stepDown, floor)
 *   The risk level computed after a trade closes applies to the NEXT trade
 *   opened (on either symbol), matching how a trader would actually apply
 *   this rule in real time.
 */
export function runPortfolioBacktest({
  candlesBySymbol,
  configBySymbol,
  riskPctPerTrade,
  startingBalance,
  guardrailConfig = {},
  swingLookback = 10,
  maxHoldingCandles = 480,
  minDistanceSpreadMultiple = 3,
  adaptiveRiskConfig = null,
}) {
  const symbols = Object.keys(candlesBySymbol);
  const guardrail = new GuardrailEngine(guardrailConfig);

  const engines = {};
  for (const symbol of symbols) {
    const { engine } = buildFilteredEngine(candlesBySymbol[symbol], symbol, configBySymbol[symbol]);
    engines[symbol] = engine;
  }

  // Merge every symbol's candles into one chronological timeline, tagged by symbol.
  const timeline = [];
  for (const symbol of symbols) {
    for (const candle of candlesBySymbol[symbol]) timeline.push({ symbol, candle });
  }
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));

  if (timeline.length === 0) {
    throw new Error('runPortfolioBacktest: no candles provided');
  }

  guardrail.setBalance(startingBalance, timeline[0].candle.time);

  let balance = startingBalance;
  let peakBalance = startingBalance;
  let maxDrawdownPct = 0;

  let currentRiskPct = adaptiveRiskConfig ? adaptiveRiskConfig.base : riskPctPerTrade;
  let consecutiveLosingCloses = 0;
  function getCurrentRiskPct() {
    return adaptiveRiskConfig ? currentRiskPct : riskPctPerTrade;
  }
  function updateAdaptiveRiskAfterClose(pnl) {
    if (!adaptiveRiskConfig) return;
    const { step, cap, stepDown, floor, resetAfterLosses = 1 } = adaptiveRiskConfig;
    if (pnl > 0) {
      consecutiveLosingCloses = 0;
      currentRiskPct = Math.min(currentRiskPct + step, cap);
    } else {
      consecutiveLosingCloses += 1;
      if (consecutiveLosingCloses < resetAfterLosses) {
        // Tolerate this loss without giving back the climb yet - a single
        // "blip" inside an otherwise winning stretch doesn't reset the ladder.
      } else if (consecutiveLosingCloses === resetAfterLosses) {
        currentRiskPct = adaptiveRiskConfig.base;
      } else {
        currentRiskPct = Math.max(currentRiskPct - stepDown, floor);
      }
    }
  }

  const openBySymbol = {};
  const addedBySymbol = {}; // 'pyramid-independent' mode only: the second unit, own stop/target, resolves on its own
  const symbolIndex = {};
  const formationIndexBySymbol = {};
  for (const symbol of symbols) {
    openBySymbol[symbol] = null;
    addedBySymbol[symbol] = null;
    symbolIndex[symbol] = -1;
    formationIndexBySymbol[symbol] = new Map();
  }

  const closedTrades = [];
  const blockedSignals = []; // candidate entries the guardrail refused
  const nonViableSignals = []; // candidate entries dropped: stop too tight vs. spread
  const equityCurve = [];

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const candles = candlesBySymbol[symbol];
    const cfg = configBySymbol[symbol];
    const spread = cfg.spread ?? 0;

    // 1) Resolve an already-open trade for this symbol using this candle.
    const open = openBySymbol[symbol];
    const tm = cfg.tradeManagement; // optional: { mode: 'pyramid', addAtR }
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const effectiveStop = open.movedToBreakeven ? open.entryPrice : open.stopPrice;
      const hitStop = bullish ? candle.low <= effectiveStop : candle.high >= effectiveStop;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, legR;
        if (hitStop) {
          outcome = open.movedToBreakeven ? 'breakeven' : 'loss';
          exitPrice = effectiveStop;
          legR = open.movedToBreakeven ? 0 : -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = open.targetPrice;
          legR = open.rrMultiple;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
          legR = signedMove / open.distance;
        }
        const costR = spread > 0 ? spread / open.distance : 0;
        const netLegR = legR - costR;
        let pnl = open.riskAmount * netLegR;

        if (open.pyramidAdded) {
          // Added unit's own leg R is always (legR - addAtR) on the same
          // shared exit event (see runBacktestManaged's 'pyramid' mode for
          // the full reasoning) - it pays its own spread cost too.
          const addedLegR = legR - open.pyramidAddAtR;
          const addedNetLegR = addedLegR - costR;
          pnl += open.addedRiskAmount * addedNetLegR;
        }

        balance += pnl;
        peakBalance = Math.max(peakBalance, balance);
        const drawdownPct = peakBalance > 0 ? ((peakBalance - balance) / peakBalance) * 100 : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

        guardrail.recordTrade({ pnl, time: candle.time, balanceAfter: balance });
        closedTrades.push({
          symbol,
          direction: open.direction,
          entryTime: open.entryTime,
          exitTime: candle.time,
          outcome,
          rMultiple: netLegR,
          grossRMultiple: legR,
          pyramided: Boolean(open.pyramidAdded) || Boolean(open.pyramidIndependentAdded),
          pyramidLeg: open.pyramidIndependentAdded ? 'original' : undefined,
          riskAmount: open.riskAmount + (open.addedRiskAmount || 0),
          riskPctUsed: open.riskPctUsed,
          pnl,
          balanceAfter: balance,
        });
        equityCurve.push({ time: candle.time, balance });
        openBySymbol[symbol] = null;
        updateAdaptiveRiskAfterClose(pnl);
      } else if (tm?.mode === 'pyramid' && !open.pyramidAdded) {
        // Not resolved this candle - check whether the +addAtR pyramid
        // trigger is newly reached (applies starting NEXT candle, same
        // conservative same-candle ordering as runBacktestManaged).
        const favorPrice = bullish ? candle.high : candle.low;
        const moveInFavor = bullish ? favorPrice - open.entryPrice : open.entryPrice - favorPrice;
        const addAtR = tm.addAtR ?? 1;
        if (moveInFavor >= addAtR * open.distance) {
          open.pyramidAdded = true;
          open.pyramidAddAtR = addAtR;
          open.movedToBreakeven = true; // both units' stop moves to the original entry
          open.addedRiskAmount = balance * (getCurrentRiskPct() / 100); // sized off CURRENT balance, like a fresh entry
        }
      } else if (tm?.mode === 'pyramid-independent' && !addedBySymbol[symbol]) {
        // 'Better pyramid, without breakeven' variant: the original unit's
        // own stop is NEVER touched (handled entirely by the block above,
        // as if no trade management were active at all). Once +addAtR is
        // reached, a SECOND, fully independent unit is opened - its own
        // entry/stop/risk, resolved and booked to the account on its own,
        // same as any other real position (see
        // runBacktestPyramidIndependentStops for the per-trade rationale).
        const favorPrice = bullish ? candle.high : candle.low;
        const moveInFavor = bullish ? favorPrice - open.entryPrice : open.entryPrice - favorPrice;
        const addAtR = tm.addAtR ?? 1;
        if (moveInFavor >= addAtR * open.distance) {
          const addEntryPrice = bullish
            ? open.entryPrice + addAtR * open.distance
            : open.entryPrice - addAtR * open.distance;
          const addStopPrice = bullish ? addEntryPrice - open.distance : addEntryPrice + open.distance;
          open.pyramidIndependentAdded = true; // reporting only - does NOT affect open's own stop/pnl
          const riskPctUsed = getCurrentRiskPct();
          addedBySymbol[symbol] = {
            direction: open.direction,
            entryIndex: i,
            entryTime: candle.time,
            entryPrice: addEntryPrice,
            stopPrice: addStopPrice,
            targetPrice: open.targetPrice,
            distance: open.distance,
            rrMultiple: open.rrMultiple - addAtR,
            riskAmount: balance * (riskPctUsed / 100), // sized off CURRENT balance, like a fresh entry
            riskPctUsed,
          };
        }
      }
    }

    // 1b) Resolve the independent added unit ('pyramid-independent' mode),
    // fully separately from the original above - it can close before, after,
    // or at the same time as the original, and its own win/loss never
    // touches the original's stop.
    const added = addedBySymbol[symbol];
    if (added && candle.time > added.entryTime) {
      const bullish = added.direction === 'bullish';
      const hitStop = bullish ? candle.low <= added.stopPrice : candle.high >= added.stopPrice;
      const hitTarget = bullish ? candle.high >= added.targetPrice : candle.low <= added.targetPrice;
      const timedOut = i - added.entryIndex >= maxHoldingCandles;

      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, legR;
        if (hitStop) {
          outcome = 'loss';
          exitPrice = added.stopPrice;
          legR = -1;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = added.targetPrice;
          legR = added.rrMultiple;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - added.entryPrice : added.entryPrice - exitPrice;
          legR = signedMove / added.distance;
        }
        const costR = spread > 0 ? spread / added.distance : 0;
        const netLegR = legR - costR;
        const pnl = added.riskAmount * netLegR;

        balance += pnl;
        peakBalance = Math.max(peakBalance, balance);
        const drawdownPct = peakBalance > 0 ? ((peakBalance - balance) / peakBalance) * 100 : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

        guardrail.recordTrade({ pnl, time: candle.time, balanceAfter: balance });
        closedTrades.push({
          symbol,
          direction: added.direction,
          entryTime: added.entryTime,
          exitTime: candle.time,
          outcome,
          rMultiple: netLegR,
          grossRMultiple: legR,
          pyramided: true,
          pyramidLeg: 'added',
          riskAmount: added.riskAmount,
          riskPctUsed: added.riskPctUsed,
          pnl,
          balanceAfter: balance,
        });
        equityCurve.push({ time: candle.time, balance });
        addedBySymbol[symbol] = null;
        updateAdaptiveRiskAfterClose(pnl);
      }
    }

    // 2) Feed the candle to this symbol's (already fully-wrapped) engine.
    const events = engines[symbol].processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexBySymbol[symbol].set(e.id, i);
      } else if (e.type === 'validated' && !openBySymbol[symbol] && !addedBySymbol[symbol]) {
        const c3Index = formationIndexBySymbol[symbol].get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({
          direction: e.direction,
          zone: e.zone,
          candles,
          c1Index,
          stopMode: cfg.stopMode,
          swingLookback,
        });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue; // degenerate zone

        if (spread > 0 && distance < spread * minDistanceSpreadMultiple) {
          nonViableSignals.push({ symbol, time: candle.time });
          continue; // stop too tight vs. spread - not really tradeable, skip before it can occupy a slot
        }

        if (!guardrail.canTakeNewTrade(candle.time)) {
          blockedSignals.push({ symbol, time: candle.time, reasons: guardrail.getStatus(candle.time).blockReasons });
          continue; // guardrail says no - matches what the live dashboard/bot would do
        }

        const targetPrice =
          e.direction === 'bullish' ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
        const riskPctUsed = getCurrentRiskPct();
        const riskAmount = balance * (riskPctUsed / 100);
        openBySymbol[symbol] = {
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple: cfg.rrMultiple,
          riskAmount,
          riskPctUsed,
          movedToBreakeven: false,
          pyramidAdded: false,
          pyramidAddAtR: 0,
          addedRiskAmount: 0,
          pyramidIndependentAdded: false,
        };
      }
    }
  }

  const wins = closedTrades.filter((t) => t.outcome === 'win').length;
  const losses = closedTrades.filter((t) => t.outcome === 'loss').length;
  const timeouts = closedTrades.filter((t) => t.outcome === 'timeout').length;
  const resolved = closedTrades.filter((t) => t.outcome !== 'timeout');
  const winRate = resolved.length > 0 ? wins / resolved.length : null;

  const blockReasonCounts = {};
  for (const b of blockedSignals) {
    for (const reason of b.reasons) blockReasonCounts[reason] = (blockReasonCounts[reason] || 0) + 1;
  }

  return {
    startingBalance,
    finalBalance: balance,
    totalReturnPct: ((balance - startingBalance) / startingBalance) * 100,
    maxDrawdownPct,
    totalTrades: closedTrades.length,
    wins,
    losses,
    timeouts,
    winRate,
    blockedSignalsCount: blockedSignals.length,
    blockReasonCounts,
    nonViableSignalsCount: nonViableSignals.length,
    closedTrades,
    blockedSignals,
    equityCurve,
  };
}
