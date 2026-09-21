import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS as OFF } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const FIXTURE = new URL('./fixtures/us500-m15-2026-08-24_to_2026-09-21.csv', import.meta.url).pathname;
const engineCandles = () => loadCandlesFromCsv(FIXTURE).candles.map((c) => ({ ...c, time: c.time - OFF }));
const stub = (c) => ({ time: c.time, open: c.open, high: c.open, low: c.open, close: c.open }); // what the first tick of a bar looks like
const at = (iso) => Date.parse(iso) - OFF;

function makeEngine(historyBefore) {
  const guard = new GuardrailEngine(CONFIG.guardrails);
  guard.setBalance(10943.88, Date.now());
  const e = new LiveStrategyEngine({ symbols: ['US500'], fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: null, nwogConfig: null, judasSwingConfig: null, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: null, silverBulletConfig: null, cbdrConfig: null, guardrail: guard, riskPctPerTrade: 0.3, spreads: DEFAULT_SPREADS });
  e.setBalance(10943.88);
  e.warmUp({ US500: historyBefore });
  for (const [s, p] of [...e.openPositions.entries()]) e.clearBelievedPosition(s, p.id); // what the production boot does: the broker holds no such position
  return e;
}
const weeklySweep = (events) => events.find((x) => x.type === 'validated' && x.source === 'weeklysweep');

test('a later tick of the bar being formed updates it, and never evaluates signals', () => {
  const all = engineCandles();
  const e = makeEngine(all.filter((c) => c.time < at('2026-09-21T00:00:00Z')));
  const bar = all.find((c) => c.time === at('2026-09-21T00:00:00Z'));
  const n = e.getHistoryLength('US500');
  assert.equal(e.isNewBar('US500', bar.time), true);
  e.ingestCandle('US500', stub(bar));
  assert.equal(e.isNewBar('US500', bar.time), false);
  const events = e.ingestCandle('US500', bar); // same bar, more ticks
  assert.deepEqual(events, []);
  const hist = e.getHistory('US500');
  assert.equal(hist.length, n + 1); // still ONE bar, not two
  assert.deepEqual(hist[hist.length - 1], bar); // and it carries the full OHLC now
});

test('an older bar is still ignored, and the open of the tracked bar never moves', () => {
  const all = engineCandles();
  const e = makeEngine(all.filter((c) => c.time < at('2026-09-21T00:00:00Z')));
  const bar = all.find((c) => c.time === at('2026-09-21T00:00:00Z'));
  e.ingestCandle('US500', stub(bar));
  const len = e.getHistory('US500').length;
  assert.deepEqual(e.ingestCandle('US500', all.find((c) => c.time === at('2026-09-20T23:45:00Z'))), []);
  assert.equal(e.getHistory('US500').length, len);
  e.ingestCandle('US500', { ...bar, open: bar.open + 5 });
  assert.equal(e.getHistory('US500').at(-1).open, bar.open);
});

test('REGRESSION 2026-09-21: the Weekly Sweep on US500 is found when the sweep bar is kept complete, and hidden when it stays a one-tick stub', () => {
  const all = engineCandles();
  const before = all.filter((c) => c.time < at('2026-09-21T00:00:00Z'));
  const sweepBar = all.find((c) => c.time === at('2026-09-21T00:00:00Z'));
  const entryBar = all.find((c) => c.time === at('2026-09-21T00:15:00Z'));

  // the live feed as it used to be handled: the stub of the 00:00 bar is all the engine ever kept
  const stubbed = makeEngine(before);
  stubbed.ingestCandle('US500', stub(sweepBar));
  assert.equal(weeklySweep(stubbed.ingestCandle('US500', stub(entryBar))), undefined);

  // the fixed handling: later ticks of the 00:00 bar complete it before the 00:15 bar starts
  const fixed = makeEngine(before);
  fixed.ingestCandle('US500', stub(sweepBar));
  fixed.ingestCandle('US500', sweepBar);
  const sig = weeklySweep(fixed.ingestCandle('US500', stub(entryBar)));
  assert.ok(sig, 'the weekly sweep must be detected');
  assert.equal(sig.direction, 'bearish');
  assert.equal(sig.blockedReason ?? null, null);
  assert.equal(sig.entryPrice, entryBar.open);
});

test('reconcileRecentCandles overwrites tracked bars with the broker finals, reports what moved, and only touches known bars', () => {
  const all = engineCandles();
  const e = makeEngine(all.filter((c) => c.time < at('2026-09-21T00:00:00Z')));
  const b0 = all.find((c) => c.time === at('2026-09-21T00:00:00Z'));
  e.ingestCandle('US500', stub(b0)); // tracked from the first tick only
  const finals = [b0, { ...all[all.length - 1], time: b0.time + 900000 * 5 }]; // the 2nd bar is unknown to the history: ignored
  assert.deepEqual(e.reconcileRecentCandles('US500', finals), []); // the newest tracked bar is left to the feed by default
  const changes = e.reconcileRecentCandles('US500', finals, { includeNewest: true });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].time, b0.time);
  assert.equal(changes[0].dHigh, b0.high - b0.open);
  assert.deepEqual(e.getHistory('US500').at(-1), b0);
  assert.deepEqual(e.reconcileRecentCandles('US500', finals, { includeNewest: true }), []); // idempotent: nothing left to fix
});

test('isNewBar is false for an unknown symbol and true only for a time after the last tracked bar', () => {
  const all = engineCandles();
  const e = makeEngine(all.filter((c) => c.time < at('2026-09-21T00:00:00Z')));
  assert.equal(e.isNewBar('NOPE', 1), false);
  const last = e.getHistory('US500').at(-1).time;
  assert.equal(e.isNewBar('US500', last), false);
  assert.equal(e.isNewBar('US500', last + 900000), true);
});
