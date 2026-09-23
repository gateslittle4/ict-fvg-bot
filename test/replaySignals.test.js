import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { BOT_MECHANISMS, BOT_IDS, botMechanismsForSymbol, runReplayStrategy, computeDivergenceCandidates } from '../src/backtest/replaySignals.js';

// Two correlated random-ish series whose ratio wanders enough to cross the z-score threshold.
function pair(n = 5000) {
  const a = [], b = [];
  const start = Date.UTC(2020, 0, 6);
  let pa = 100, pb = 50, seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 - 0.5; };
  for (let i = 0; i < n; i++) {
    const t = start + i * 900000;
    const common = rnd() * 0.6;
    const oa = pa, ob = pb;
    pa += common + rnd() * 0.3 + Math.sin(i / 300) * 0.05;
    pb += common * 0.5 + rnd() * 0.15;
    a.push({ time: t, open: oa, high: Math.max(oa, pa) + 0.2, low: Math.min(oa, pa) - 0.2, close: pa });
    b.push({ time: t, open: ob, high: Math.max(ob, pb) + 0.1, low: Math.min(ob, pb) - 0.1, close: pb });
  }
  return { a, b };
}

test('there are exactly the bot\'s 8 live mechanisms', () => {
  assert.equal(BOT_MECHANISMS.length, 8);
  assert.deepEqual(BOT_IDS.sort(), ['bot-breaker', 'bot-cbdr', 'bot-divergence', 'bot-fvg', 'bot-judas', 'bot-nwog', 'bot-silver', 'bot-weekly']);
});

test('each mechanism applies only where CONFIG says the bot trades it', () => {
  const ids = (sym) => botMechanismsForSymbol(sym).map((m) => m.id).sort();
  // Driven by CONFIG (2026-09-23: FVG and Judas Swing were taken out of live - config.js fvg.liveSymbols / judasSwing.symbols).
  assert.equal(ids('US100').includes('bot-fvg'), (CONFIG.fvg.liveSymbols ?? ['US100']).includes('US100'));
  assert.ok(ids('US100').includes('bot-cbdr') && ids('US100').includes('bot-nwog') && ids('US100').includes('bot-divergence'));
  assert.equal(ids('EURUSD').includes('bot-judas'), CONFIG.judasSwing.symbols.includes('EURUSD'));
  assert.ok(!ids('EURUSD').includes('bot-fvg'));
  assert.ok(ids('GER40').includes('bot-breaker'));
  assert.deepEqual(ids('USDCAD'), []); // a pair the bot trades nothing on
  for (const m of BOT_MECHANISMS) for (const s of m.symbolsOf()) assert.ok(botMechanismsForSymbol(s).some((x) => x.id === m.id));
});

test('divergence candidates are identical to LiveStrategyEngine._computeDivergenceCandidates (no drift from the live logic)', () => {
  const { a, b } = pair();
  const engine = new LiveStrategyEngine({ symbols: CONFIG.symbols, guardrail: new GuardrailEngine({ maxTradesPerDay: 3, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2 }) });
  const live = engine._computeDivergenceCandidates(a, b, 'US100', 'US500');
  const mine = computeDivergenceCandidates(a, b, 'US100', 'US500');
  assert.ok(live.length > 0, 'the synthetic pair must produce candidates for this to prove anything');
  assert.deepEqual(mine, live);
});

test('runReplayStrategy: divergence needs its partner series, and only runs on the configured pair', () => {
  const { a, b } = pair();
  assert.equal(runReplayStrategy('bot-divergence', a, 'US100', null), null);
  assert.equal(runReplayStrategy('bot-divergence', a, 'EURUSD', b), null);
  const trades = runReplayStrategy('bot-divergence', a, 'US100', b);
  assert.ok(trades.length > 0);
  for (const t of trades) {
    assert.equal(t.strategyId, 'bot-divergence');
    assert.equal(t.direction, 'bullish'); // divergence always buys the laggard
    assert.ok(t.stopPrice < t.entryPrice && t.targetPrice > t.entryPrice);
    assert.ok(t.exitTime >= t.entryTime);
  }
});

test('runReplayStrategy: a Labo strategy comes back in the same shape; an unknown one throws; a target-less one has targetPrice null', () => {
  const { a } = pair();
  const macd = runReplayStrategy('macd-trend', a, 'US100');
  assert.ok(macd.length > 0);
  for (const t of macd) {
    assert.equal(t.strategyId, 'macd-trend');
    assert.ok(['bullish', 'bearish'].includes(t.direction));
    assert.ok(t.targetPrice === null || Number.isFinite(t.targetPrice));
    assert.ok(Number.isFinite(t.entryTime) && Number.isFinite(t.entryPrice) && Number.isFinite(t.stopPrice));
  }
  assert.throws(() => runReplayStrategy('nope', a, 'US100'), /inconnue/);
});

test('a bot mechanism on a symbol the bot does not trade it on returns null instead of inventing trades', () => {
  const { a } = pair();
  assert.equal(runReplayStrategy('bot-judas', a, 'US100'), null);
  assert.equal(runReplayStrategy('bot-fvg', a, 'EURUSD'), null);
});

// Weekdays only (a real weekend gap before every Monday), with the Monday open jumping up or down,
// so NWOG has gaps of BOTH signs to trade.
function weeklyGapSeries(weeks = 60) {
  const c = [];
  let price = 100;
  const start = Date.UTC(2020, 0, 6); // Monday 00:00
  for (let w = 0; w < weeks; w++) {
    price += w % 2 ? 4 : -4; // the weekend gap
    for (let d = 0; d < 5; d++) {
      for (let q = 0; q < 96; q++) {
        const t = start + (w * 7 + d) * 86400000 + q * 900000;
        const open = price;
        price += Math.sin((w * 500 + d * 96 + q) / 7) * 0.6;
        c.push({ time: t, open, high: Math.max(open, price) + 0.3, low: Math.min(open, price) - 0.3, close: price });
      }
    }
  }
  return c;
}

test('the NWOG long-only rule of the live config is applied: US100 never shows a sell, GER40 (not long-only) does', () => {
  assert.ok((CONFIG.nwog.longOnlySymbols || []).includes('US100'));
  assert.ok(!(CONFIG.nwog.longOnlySymbols || []).includes('GER40'));
  const candles = weeklyGapSeries();
  const us100 = runReplayStrategy('bot-nwog', candles, 'US100');
  const ger40 = runReplayStrategy('bot-nwog', candles, 'GER40');
  assert.ok(ger40.length > 0 && ger40.some((t) => t.direction === 'bearish'), 'the synthetic gaps must give GER40 sells for the comparison to mean anything');
  assert.ok(us100.length > 0 && us100.every((t) => t.direction === 'bullish'));
  assert.ok(us100.length < ger40.length);
});

// --- streamed hourly loader (memory-safe partner series) ------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCandlesFromCsv, loadResampledFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';

test('loadResampledFromCsv gives exactly resampleCandles(loadCandlesFromCsv(...)) without holding the M15 series', () => {
  const { a } = pair(900);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  const file = path.join(dir, 'x.csv');
  // shuffle a few rows to prove order does not matter inside a bucket
  const rows = a.map((c) => `${c.time},${c.open},${c.high},${c.low},${c.close}`);
  [rows[5], rows[6]] = [rows[6], rows[5]];
  fs.writeFileSync(file, `time,open,high,low,close\n${rows.join('\n')}\n`);
  const expected = resampleCandles(loadCandlesFromCsv(file).candles, TIMEFRAME_MS.H1);
  const streamed = loadResampledFromCsv(file, TIMEFRAME_MS.H1);
  assert.deepEqual(streamed, expected);
  assert.ok(streamed.length > 100);
  assert.throws(() => { fs.writeFileSync(file, 'a,b\n1,2\n'); loadResampledFromCsv(file, 3600000); }, /required columns/);
  fs.rmSync(dir, { recursive: true });
});

test('loadResampledFromCsv with a window keeps only that window (and does not throw when it is empty)', () => {
  const { a } = pair(900);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs2-'));
  const file = path.join(dir, 'w.csv');
  fs.writeFileSync(file, `time,open,high,low,close\n${a.map((c) => `${c.time},${c.open},${c.high},${c.low},${c.close}`).join('\n')}\n`);
  const from = a[200].time, to = a[399].time;
  const win = loadResampledFromCsv(file, TIMEFRAME_MS.H1, { from, to });
  const expected = resampleCandles(loadCandlesFromCsv(file).candles.filter((c) => c.time >= from && c.time <= to), TIMEFRAME_MS.H1);
  assert.deepEqual(win, expected);
  assert.deepEqual(loadResampledFromCsv(file, TIMEFRAME_MS.H1, { from: 1, to: 2 }), []);
  fs.rmSync(dir, { recursive: true });
});
