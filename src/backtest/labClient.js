// labClient.js
// Main-thread side of the Labo's compute thread (labWorker.js).
//
// WHY A THREAD (2026-09-18): the Labo shipped running its backtests inside
// the same process as the LIVE trading bot. Measured afterwards: one
// strategy screened across every symbol blocks the event loop for seconds
// (13 s on XAUUSD), and the datasets are large enough that holding them all
// costs ~870 MB against the 512 MB the free Render instance has - so a
// single click could have starved the broker connection's heartbeats or got
// the whole process OOM-killed with real positions open. A worker thread
// fixes the blocking; its own `resourceLimits` fixes the memory side: if a
// job blows the heap, only the worker dies (ERR_WORKER_OUT_OF_MEMORY) and
// the bot keeps trading.

import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./labWorker.js', import.meta.url);
const WORKER_HEAP_MB = 160; // largest single dataset (~350k candles) measured ~30 MB of heap once parsed; the rest is transient parse garbage that a low ceiling forces V8 to collect promptly instead of letting RSS balloon toward the 512 MB container limit
const DEFAULT_TIMEOUT_MS = 180_000;

let worker = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, timer }

function failAll(message) {
  for (const [id, job] of pending) {
    clearTimeout(job.timer);
    job.reject(new Error(message));
    pending.delete(id);
  }
}

function getWorker() {
  if (worker) return worker;
  const w = new Worker(WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB, maxYoungGenerationSizeMb: 24 } });
  w.on('message', ({ id, ok, result, error }) => {
    const job = pending.get(id);
    if (!job) return; // already timed out
    clearTimeout(job.timer);
    pending.delete(id);
    ok ? job.resolve(result) : job.reject(new Error(error));
  });
  const onDeath = (reason) => {
    if (worker === w) worker = null; // next job lazily starts a fresh one
    failAll(`Le calcul du Labo s'est arrêté (${reason}) - réessaie, le bot de trading n'est pas affecté.`);
  };
  w.on('error', (err) => onDeath(err.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'mémoire insuffisante pour ce jeu de données' : err.message));
  w.on('exit', (code) => { if (worker === w) onDeath(`code ${code}`); });
  worker = w;
  return w;
}

/**
 * @param {'runTrainTest'|'screenSymbols'|'screenStrategies'} op
 * @param {object} payload
 * @returns {Promise<object>}
 */
export function runLabJob(op, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Calcul trop long (délai dépassé) - le thread de calcul a été relancé.'));
      // A stuck job blocks the thread's queue for everyone behind it - kill it.
      const w = worker;
      worker = null;
      w?.terminate();
      failAll('un autre calcul a dépassé le délai');
    }, timeoutMs);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
    try {
      getWorker().postMessage({ id, op, payload });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

/** For tests - lets the process exit instead of hanging on the idle thread. */
export async function shutdownLabWorker() {
  const w = worker;
  worker = null;
  failAll('arrêt demandé');
  await w?.terminate();
}
