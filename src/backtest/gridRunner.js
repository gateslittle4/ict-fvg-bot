// gridRunner.js
// Shared grid-search logic used by both the full-sample report
// (scripts/runBacktestReport.js) and the out-of-sample train/test
// validation (scripts/runTrainTestValidation.js), so both use exactly the
// same configs, cost model, and ranking rule — no risk of the validation
// silently testing something different from what the report picked.

import { FvgEngine } from '../engines/fvgEngine.js';
import { runBacktest, summarizeTrades } from './backtestEngine.js';
import { buildHtfBiasSeries, makeBiasLookup, BiasFilteredFvgEngine, TIMEFRAME_MS } from './htfBias.js';
import { buildStructureBiasSeries, makeStructureBiasLookup, StructureFilteredFvgEngine } from './marketStructure.js';
import { SessionFilteredFvgEngine } from './nySession.js';
import { buildLiquiditySweepEvents, makeSweepLookup, LiquiditySweepFilteredFvgEngine } from './liquiditySweep.js';
import { WeekdayFilteredFvgEngine } from './weekdayFilter.js';
import { applyTransactionCosts, filterViableTrades } from './transactionCosts.js';

export const MIN_DISTANCE_SPREAD_MULTIPLE = 3; // drop trades whose stop is < 3x the spread
export const STOP_MODES = ['fvg-edge', 'swing'];
export const RR_MULTIPLES = [1, 2, 3];
export const HTF_TIMEFRAMES = [
  { key: 'H1', ms: TIMEFRAME_MS.H1 },
  { key: 'H4', ms: TIMEFRAME_MS.H4 },
];
export const EMA_PERIODS = [20, 50, 200];
export const NEUTRAL_BAND_PCT = 0.1;
export const MIN_SIGNALS_FOR_RANKING = 10; // below this, a config's stats are too noisy to trust/rank

export const STRUCTURE_LOOKBACK = 5; // candles each side required to confirm a swing pivot (ICT BOS filter)
export const NY_AM_SESSION = { startHour: 8, endHour: 12 }; // NY local time, DST-aware (see nySession.js)
export const STRUCTURE_FLAGS = [false, true]; // market-structure (BOS) filter: off / on
export const SESSION_FLAGS = [false, true]; // NY AM (08:00-12:00) session filter: off / on

export const SWEEP_LOOKBACK = 5; // candles each side required to confirm a swing pivot (liquidity sweep filter)
export const SWEEP_WINDOW_CANDLES = 10; // how recent (in M15 candles) a sweep must be to count as confluence

export function withNet(trades, spread) {
  const viableTrades = filterViableTrades(trades, spread, MIN_DISTANCE_SPREAD_MULTIPLE);
  const netTrades = applyTransactionCosts(viableTrades, spread);
  return { trades: netTrades, summaryNet: summarizeTrades(netTrades), droppedAsNonViable: trades.length - viableTrades.length };
}

/**
 * Builds the fully-wrapped FvgEngine for a given config, without running any
 * backtest. Shared by runOneConfig() (single-symbol grid search) and the
 * portfolio simulator (multi-symbol, guardrail-aware simulation), so both
 * always construct "the same strategy" identically.
 *
 * Filters compose by wrapping: FvgEngine -> [HTF EMA bias] -> [ICT market
 * structure / BOS bias] -> [NY AM session window]. Each wrapper only ever
 * drops or passes a 'validated' event based on its own criterion, so the
 * combined effect is a logical AND of whichever filters are enabled —
 * wrapping order does not change the result.
 *
 * @param {string} opts.variant - 'baseline' or '<H1|H4>_EMA<20|50|200>'
 * @param {boolean} [opts.structureEnabled] - ICT market-structure (BOS) filter
 * @param {boolean} [opts.sessionEnabled] - NY AM (08:00-12:00 NY time) session filter
 * @param {object} [opts.sessionWindow] - override the NY session window, e.g. {startHour, endHour}
 * @param {boolean} [opts.liquiditySweepEnabled] - ICT liquidity-sweep confluence filter
 * @returns {{engine: object, wrappers: object[]}}
 */
export function buildFilteredEngine(
  candles,
  symbol,
  {
    variant,
    structureEnabled = false,
    sessionEnabled = false,
    sessionWindow = NY_AM_SESSION,
    liquiditySweepEnabled = false,
    structureLookback = STRUCTURE_LOOKBACK,
    sweepLookback = SWEEP_LOOKBACK,
    sweepWindowCandles = SWEEP_WINDOW_CANDLES,
    excludedWeekdays = [],
  }
) {
  let engine = new FvgEngine({ symbol });
  const wrappers = []; // track wrapper instances so callers can sum up filteredCount/passedCount

  if (variant !== 'baseline') {
    const [tfKey, emaLabel] = variant.split('_');
    const tf = HTF_TIMEFRAMES.find((t) => t.key === tfKey);
    const emaPeriod = Number(emaLabel.replace('EMA', ''));
    const biasSeries = buildHtfBiasSeries(candles, {
      bucketMs: tf.ms,
      emaPeriod,
      neutralBandPct: NEUTRAL_BAND_PCT,
    });
    const biasLookup = makeBiasLookup(biasSeries);
    engine = new BiasFilteredFvgEngine(engine, biasLookup);
    wrappers.push(engine);
  }

  if (structureEnabled) {
    const structureSeries = buildStructureBiasSeries(candles, { lookback: structureLookback });
    const structureLookup = makeStructureBiasLookup(structureSeries);
    engine = new StructureFilteredFvgEngine(engine, structureLookup);
    wrappers.push(engine);
  }

  if (sessionEnabled) {
    engine = new SessionFilteredFvgEngine(engine, sessionWindow);
    wrappers.push(engine);
  }

  if (liquiditySweepEnabled) {
    const sweepEvents = buildLiquiditySweepEvents(candles, { lookback: sweepLookback });
    const sweepLookup = makeSweepLookup(sweepEvents, { windowMs: sweepWindowCandles * 15 * 60 * 1000 });
    engine = new LiquiditySweepFilteredFvgEngine(engine, sweepLookup);
    wrappers.push(engine);
  }

  if (excludedWeekdays.length > 0) {
    engine = new WeekdayFilteredFvgEngine(engine, excludedWeekdays);
    wrappers.push(engine);
  }

  return { engine, wrappers };
}

/**
 * Runs one specific config against a given set of candles. This is the
 * single code path used both by the grid search and by the out-of-sample
 * re-evaluation, so "same config" always means "same code, same parameters"
 * — only the candle window differs.
 */
export function runOneConfig(
  candles,
  symbol,
  spread,
  {
    variant,
    stopMode,
    rrMultiple,
    structureEnabled = false,
    sessionEnabled = false,
    sessionWindow = NY_AM_SESSION,
    liquiditySweepEnabled = false,
    structureLookback,
    sweepLookback,
    sweepWindowCandles,
    excludedWeekdays,
  }
) {
  const { engine, wrappers } = buildFilteredEngine(candles, symbol, {
    variant,
    structureEnabled,
    sessionEnabled,
    sessionWindow,
    liquiditySweepEnabled,
    structureLookback,
    sweepLookback,
    sweepWindowCandles,
    excludedWeekdays,
  });

  const trades = runBacktest({ candles, symbol, fvgEngine: engine, stopMode, rrMultiple });
  const { summaryNet, droppedAsNonViable } = withNet(trades, spread);
  const filteredCount = wrappers.reduce((sum, w) => sum + w.filteredCount, 0);
  const passedCount = wrappers.length > 0 ? wrappers[wrappers.length - 1].passedCount : undefined;

  return {
    variant,
    stopMode,
    rrMultiple,
    structureEnabled,
    sessionEnabled,
    liquiditySweepEnabled,
    summary: summarizeTrades(trades),
    summaryNet,
    droppedAsNonViable,
    trades,
    filteredCount,
    passedCount,
  };
}

export function runGrid(candles, symbol, spread) {
  const results = [];
  const variants = ['baseline', ...HTF_TIMEFRAMES.flatMap((tf) => EMA_PERIODS.map((p) => `${tf.key}_EMA${p}`))];

  for (const variant of variants) {
    for (const structureEnabled of STRUCTURE_FLAGS) {
      for (const sessionEnabled of SESSION_FLAGS) {
        for (const stopMode of STOP_MODES) {
          for (const rrMultiple of RR_MULTIPLES) {
            results.push(
              runOneConfig(candles, symbol, spread, { variant, stopMode, rrMultiple, structureEnabled, sessionEnabled })
            );
          }
        }
      }
    }
  }

  return results;
}

export function rankKey(r) {
  // Rank by NET (post-spread) expectancy - that's the number that matters for
  // real trading - but only among configs with enough signals to trust.
  if (r.summary.totalSignals < MIN_SIGNALS_FOR_RANKING) return -Infinity;
  return r.summaryNet.avgR ?? -Infinity;
}
