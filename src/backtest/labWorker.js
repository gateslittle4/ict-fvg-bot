// labWorker.js
// Thread entry for every "Labo de stratégies" computation (see labClient.js
// for why this is a thread at all). Deliberately holds at most ONE dataset in
// memory at a time: measured 2026-09-18, loading all 12 built-in datasets at
// once costs ~870 MB RSS (573 MB heap) against Render's 512 MB free-tier
// ceiling - the previous in-process cache in server.js would have let one
// click on "Comparer sur les 12 symboles" get the LIVE trading bot killed
// for lack of memory. Here the cache is a single slot, released before the
// next dataset is parsed and again after a minute of idle.

import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import { loadCandlesFromCsv, loadResampledFromCsv } from './csvLoader.js';
import { TIMEFRAME_MS } from './htfBias.js';
import { readWindow, aggregateRows } from './m1Store.js';
import { buildRateSeries } from './instrumentSpecs.js';
import { runLabBacktestTrainTest, flattenTrainTestForScreen, TRAIN_TEST_CUTOFF } from './labRunner.js';
import { listLabStrategies } from './labRegistry.js';
import { importIntoDataset } from './labDatasets.js';
import { runLiveFvg, resolveVariantConfig, describeConfig } from './liveFvgRunner.js';
import { runRecipe, describeRecipe } from './legoStrategy.js';
import { runReplayStrategy, botMechanism } from './replaySignals.js';
import { simulateChallenge, simulateMultiChallenge, buildHeatmap, analyzePortfolio, expectancyStats } from './labAnalytics.js';
import { ImportError } from './m1Import.js';

const IDLE_RELEASE_MS = 60_000;
let cache = null; // { key, candles }
let idleTimer = null;

function loadCandles(csvPath) {
  const key = `${csvPath}:${fs.statSync(csvPath).mtimeMs}`;
  if (cache?.key === key) return cache.candles;
  cache = null; // let the previous dataset go BEFORE parsing the next one - never two resident together (its per-dataset trade cache goes with it)
  const { candles } = loadCandlesFromCsv(csvPath);
  cache = { key, candles };
  return candles;
}

function scheduleRelease() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { cache = null; }, IDLE_RELEASE_MS);
  idleTimer.unref?.();
}

// The chart only needs the equity curve, the table only the latest trades:
// sending every trade of a strategy that fired 25k times would just make the
// thread->main copy and the HTTP response huge for no benefit.
function toPayload(result) {
  return {
    summary: result.summary,
    expectancy: expectancyStats(result.trades),
    equityCurve: result.equityCurve,
    droppedAsNonViable: result.droppedAsNonViable,
    recentTrades: result.trades.slice(-100).reverse(),
  };
}

// The full (untrimmed) train/test trade lists the analytics need - toPayload()
// above deliberately keeps only the last 100 for the browser. Trades are
// slimmed to the three fields the analytics read: a raw trade carries its
// whole signal (zones, prices, ...), and 6 strategies x tens of thousands of
// trades of those exceeded the thread's 160 MB heap on EURUSD (measured
// 2026-09-18) - the slim ones are a small fraction of that.
const slim = (trades) => trades.map((t) => ({ entryTime: t.entryTime, exitTime: t.exitTime, rMultiple: t.rMultiple }));

function tradesTrainTest({ csvPath, strategyId, symbol, spread = null, cutoff = null }) {
  const candles = loadCandles(csvPath);
  const { train, test } = runLabBacktestTrainTest(strategyId, candles, symbol, { spread, cutoff: cutoff ?? TRAIN_TEST_CUTOFF });
  return { train: slim(train.trades), test: slim(test.trades), candleCount: candles.length };
}

const handlers = {
  // `spread`/`cutoff` are only set for imported datasets (they carry their own);
  // built-in ones pass neither and get the table spread + the project-wide cutoff.
  runTrainTest({ csvPath, strategyId, symbol, spread = null, cutoff = null }) {
    const candles = loadCandles(csvPath);
    const usedCutoff = cutoff ?? TRAIN_TEST_CUTOFF;
    const { train, test, verdict } = runLabBacktestTrainTest(strategyId, candles, symbol, { spread, cutoff: usedCutoff });
    return { candleCount: candles.length, trainCutoff: usedCutoff, verdict, train: toPayload(train), test: toPayload(test) };
  },

  // One strategy across several datasets, sequentially, one resident at a time.
  screenSymbols({ strategyId, datasets }) {
    return datasets.map(({ key, csvPath, symbol }) => {
      try {
        const candles = loadCandles(csvPath);
        const trainTest = runLabBacktestTrainTest(strategyId, candles, symbol);
        return { symbol: key, ok: true, candleCount: candles.length, ...flattenTrainTestForScreen(trainTest) };
      } catch (err) {
        return { symbol: key, ok: false, error: err.message };
      }
    });
  },

  // Every registered strategy against one dataset.
  screenStrategies({ csvPath, symbol, spread = null, cutoff = null }) {
    const candles = loadCandles(csvPath);
    const options = { spread, cutoff: cutoff ?? TRAIN_TEST_CUTOFF };
    const results = listLabStrategies().map(({ id, label }) => {
      try {
        const trainTest = runLabBacktestTrainTest(id, candles, symbol, options);
        return { strategyId: id, label, ok: true, ...flattenTrainTestForScreen(trainTest) };
      } catch (err) {
        return { strategyId: id, label, ok: false, error: err.message };
      }
    });
    return { candleCount: candles.length, results };
  },

  // Monte Carlo of one strategy's trades against prop-firm rules.
  // With `strategyIds` (2+) the strategies are traded together, optionally through
  // the bot's guardrails and per-strategy risk weights; without, one strategy alone.
  analyzeChallenge({ sample = 'all', params, strategyIds = null, guardrails = null, weights = {}, ...run }) {
    const pick = ({ train, test }) => (sample === 'test' ? test : [...train, ...test]);
    if (!strategyIds) {
      const one = tradesTrainTest(run);
      return { candleCount: one.candleCount, sample, ...simulateChallenge(pick(one), params) };
    }
    const labels = Object.fromEntries(listLabStrategies().map(({ id, label }) => [id, label]));
    const byStrategy = {};
    let candleCount = 0;
    for (const strategyId of strategyIds) {
      const t = tradesTrainTest({ ...run, strategyId });
      candleCount = t.candleCount;
      byStrategy[strategyId] = { label: labels[strategyId] ?? strategyId, trades: pick(t) };
    }
    return { candleCount, sample, ...simulateMultiChallenge(byStrategy, params, { guardrails, weights }) };
  },

  analyzeHeatmap(run) {
    const { train, test, candleCount } = tradesTrainTest(run);
    return { candleCount, ...buildHeatmap(train, test) };
  },

  // Several strategies on the same dataset (one resident at a time is kept by loadCandles).
  analyzePortfolio({ strategyIds, ...run }) {
    const labels = Object.fromEntries(listLabStrategies().map(({ id, label }) => [id, label]));
    const byStrategy = {};
    let candleCount = 0;
    for (const strategyId of strategyIds) {
      const t = tradesTrainTest({ ...run, strategyId });
      candleCount = t.candleCount;
      byStrategy[strategyId] = { label: labels[strategyId] ?? strategyId, train: t.train, test: t.test };
    }
    return { candleCount, ...analyzePortfolio(byStrategy) };
  },

  // The bot's own FVG strategy (and combinations of it) on one dataset. Returns
  // the compact trade lists; every statistic and slicing is done by the page.
  runLiveFvg({ csvPath, symbol, spread = null, cutoff = null, variants }) {
    const candles = loadCandles(csvPath);
    return {
      candleCount: candles.length,
      trainCutoff: cutoff ?? TRAIN_TEST_CUTOFF,
      variants: variants.map(({ id, label, overrides }) => {
        const cfg = resolveVariantConfig(symbol, overrides);
        return { id, label, config: describeConfig(cfg), ...runLiveFvg(candles, symbol, cfg, spread) };
      }),
    };
  },

  // "Lego": one or more recipes (trigger + filters + exit) on one dataset, compact trades back.
  runLego({ csvPath, symbol, spread = null, cutoff = null, variants }) {
    const candles = loadCandles(csvPath);
    return {
      candleCount: candles.length,
      trainCutoff: cutoff ?? TRAIN_TEST_CUTOFF,
      variants: variants.map(({ id, label, recipe }) => ({ id, label, description: describeRecipe(recipe), recipe, ...runRecipe(candles, symbol, spread, recipe) })),
    };
  },

  // Live challenge outlook: the same Monte Carlo, started from the account's REAL state.
  // The trades come from the main thread's per-symbol cache (small: a few thousand slim
  // trades), so nothing is re-read from disk here.
  outlook({ tradesBySymbol, params, guardrails, states, cone }) {
    const byStrategy = Object.fromEntries(Object.entries(tradesBySymbol).map(([symbol, trades]) => [symbol, { label: symbol, trades }]));
    return states.map((state, i) => {
      const r = simulateMultiChallenge(byStrategy, params, { guardrails, state, perSymbol: true, cone: i === 0 ? cone : 0 });
      return r.insufficient ? r : { ...r, perStrategy: undefined };
    });
  },

  // "Simulateur": a window of candles to replay plus the strategy trades that fall in it. The
  // strategies are run on the WHOLE history (their signals need the warm-up before the window) and
  // cached per dataset; only the trades overlapping the window are sent back. Times stay in engine
  // time here - the route converts them for the browser.
  replayWindow({ csvPath, symbol, partnerCsvPath = null, strategyIds = [], fromEngine = null, days, warmupBars, baseMinutes = 15, m1 = null, conversion = null }) {
    const candles = loadCandles(csvPath);
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    const DAY = 86400000;
    // random start when none is given: leave room for the warm-up before and the horizon after
    const lo = first + warmupBars * 900000;
    const hi = last - days * DAY;
    if (hi <= lo) throw new Error('Ce jeu de données est trop court pour cette durée de rejeu.');
    let from = fromEngine ?? lo + Math.floor(Math.random() * (hi - lo));
    from = Math.min(Math.max(from, lo), hi);
    const to = from + days * DAY;
    const startTime = from - warmupBars * 900000;
    let a = 0, b = candles.length;
    { let l = 0, h = candles.length; while (l < h) { const m = (l + h) >> 1; if (candles[m].time >= startTime) h = m; else l = m + 1; } a = l; }
    { let l = 0, h = candles.length; while (l < h) { const m = (l + h) >> 1; if (candles[m].time > to) h = m; else l = m + 1; } b = l; }
    // Finer replay (M1/M5) reads the minute store for the same window; the strategies below still run on M15.
    const slice = baseMinutes < 15 && m1
      ? aggregateRows(readWindow(m1.file, m1.scale, startTime, to), baseMinutes)
      : candles.slice(a, b).map((c) => [c.time, c.open, c.high, c.low, c.close]);

    if (!cache.trades) cache.trades = new Map();
    const trades = [];
    const notApplicable = [];
    for (const id of strategyIds) {
      let all = cache.trades.get(`${symbol}:${id}`);
      if (all === undefined) {
        let partner = null;
        if (botMechanism(id)?.needsPartner && partnerCsvPath) partner = loadResampledFromCsv(partnerCsvPath, TIMEFRAME_MS.H1); // hourly only, streamed: two full M15 series do not fit in this thread
        all = runReplayStrategy(id, candles, symbol, partner);
        partner = null;
        // Kept for the next request only when small: 21 strategies x tens of thousands of trades each
        // (RSI, MACD... on EURUSD) exceeded this thread's heap when everything was cached (measured 2026-09-19).
        if (all === null || all.length <= 4000) cache.trades.set(`${symbol}:${id}`, all);
      }
      if (all === null) { notApplicable.push(id); continue; }
      for (const t of all) if (t.exitTime >= startTime && t.entryTime <= to) trades.push(t);
    }
    // Conversion of quote-currency P&L into USD: the conversion pair(s) at M15, streamed and windowed, never resident.
    let rates = null;
    if (conversion && conversion.status === 'ok') {
      const legs = conversion.legs.map((leg) => ({ mode: leg.mode, bars: loadResampledFromCsv(leg.csvPath, TIMEFRAME_MS.H1 / 4, { from: startTime - DAY, to }) }));
      rates = buildRateSeries(conversion.combine, legs);
      if (!rates.length) rates = null; // the conversion pair has no data over this window
    }
    return { range: { first, last }, window: { from, to, startTime }, candles: slice, trades, notApplicable, rates };
  },

  // Parses one uploaded file into a dataset (CPU-heavy, hence here and not in
  // the main thread). The dataset file changes, so the single-slot cache above
  // invalidates itself through its mtime key.
  // The upload arrives as a temp FILE (written straight from the request by
  // the main thread, which therefore never holds the body in memory) - read
  // here, in the thread that has its own heap ceiling.
  importDataset({ textFile, ...params }) {
    cache = null;
    return importIntoDataset({ ...params, text: fs.readFileSync(textFile, 'utf8') });
  },
};

parentPort.on('message', ({ id, op, payload }) => {
  try {
    if (!handlers[op]) throw new Error(`Opération inconnue: ${op}`);
    parentPort.postMessage({ id, ok: true, result: handlers[op](payload) });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err.message, userError: err instanceof ImportError });
  } finally {
    scheduleRelease();
  }
});
