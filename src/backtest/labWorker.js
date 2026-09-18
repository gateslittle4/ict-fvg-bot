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
import { loadCandlesFromCsv } from './csvLoader.js';
import { runLabBacktestTrainTest, flattenTrainTestForScreen, TRAIN_TEST_CUTOFF } from './labRunner.js';
import { listLabStrategies } from './labRegistry.js';

const IDLE_RELEASE_MS = 60_000;
let cache = null; // { key, candles }
let idleTimer = null;

function loadCandles(csvPath) {
  const key = `${csvPath}:${fs.statSync(csvPath).mtimeMs}`;
  if (cache?.key === key) return cache.candles;
  cache = null; // let the previous dataset go BEFORE parsing the next one - never two resident together
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
    equityCurve: result.equityCurve,
    droppedAsNonViable: result.droppedAsNonViable,
    recentTrades: result.trades.slice(-100).reverse(),
  };
}

const handlers = {
  runTrainTest({ csvPath, strategyId, symbol }) {
    const candles = loadCandles(csvPath);
    const { train, test, verdict } = runLabBacktestTrainTest(strategyId, candles, symbol);
    return { candleCount: candles.length, trainCutoff: TRAIN_TEST_CUTOFF, verdict, train: toPayload(train), test: toPayload(test) };
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
  screenStrategies({ csvPath, symbol }) {
    const candles = loadCandles(csvPath);
    const results = listLabStrategies().map(({ id, label }) => {
      try {
        const trainTest = runLabBacktestTrainTest(id, candles, symbol);
        return { strategyId: id, label, ok: true, ...flattenTrainTestForScreen(trainTest) };
      } catch (err) {
        return { strategyId: id, label, ok: false, error: err.message };
      }
    });
    return { candleCount: candles.length, results };
  },
};

parentPort.on('message', ({ id, op, payload }) => {
  try {
    if (!handlers[op]) throw new Error(`Opération inconnue: ${op}`);
    parentPort.postMessage({ id, ok: true, result: handlers[op](payload) });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err.message });
  } finally {
    scheduleRelease();
  }
});
