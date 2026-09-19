import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipe, describeRecipe, resimulateExit, runRecipe } from '../src/backtest/legoStrategy.js';
import { ImportError } from '../src/backtest/m1Import.js';

test('normalizeRecipe: a bare trigger gets neutral defaults', () => {
  assert.deepEqual(normalizeRecipe({ trigger: 'macd-trend' }), { trigger: 'macd-trend', session: null, weekdays: null, direction: 'both', bias: 'baseline', structure: false, sweep: false, rr: null, guardrails: null });
});

test('normalizeRecipe: keeps valid blocks, normalises them, refuses the rest with a user-facing error', () => {
  const r = normalizeRecipe({ trigger: 'ote', session: { startHour: '8', endHour: 12 }, weekdays: [1, 2, 3, 1], direction: 'bullish', bias: 'H4_EMA200', structure: 'true', sweep: true, rr: '4', guardrails: {} });
  assert.deepEqual(r.session, { startHour: 8, endHour: 12 });
  assert.deepEqual(r.weekdays, [1, 2, 3]);
  assert.equal(r.rr, 4);
  assert.equal(r.structure, true);
  assert.equal(r.guardrails.maxTradesPerDay, 3);
  assert.equal(normalizeRecipe({ trigger: 'ote', weekdays: [0, 1, 2, 3, 4, 5, 6] }).weekdays, null); // every day = no filter
  for (const bad of [
    { trigger: 'nope' }, { trigger: 'ote', session: { startHour: 12, endHour: 8 } }, { trigger: 'ote', weekdays: [] }, { trigger: 'ote', weekdays: [9] },
    { trigger: 'ote', direction: 'sideways' }, { trigger: 'ote', bias: 'M5_EMA3' }, { trigger: 'ote', rr: 99 },
  ]) assert.throws(() => normalizeRecipe(bad), ImportError, JSON.stringify(bad));
});

test('describeRecipe: a readable one-liner of what the recipe does', () => {
  const s = describeRecipe(normalizeRecipe({ trigger: 'ote', session: { startHour: 8, endHour: 12 }, weekdays: [1, 2], direction: 'bearish', rr: 4, sweep: true }));
  assert.match(s, /OTE/);
  assert.match(s, /session 8h–12h/);
  assert.match(s, /jours lun\/mar/);
  assert.match(s, /ventes seulement/);
  assert.match(s, /balayage de liquidité/);
  assert.match(s, /objectif 1:4/);
});

// resimulateExit ---------------------------------------------------------------------------
const bull = { entryIndex: 0, entryPrice: 100, stopPrice: 99, distance: 1, direction: 'bullish' };
const candle = (time, high, low, close = 100) => ({ time, open: 100, high, low, close });

test('resimulateExit: reaches the new target -> a win of exactly that many R', () => {
  const win = resimulateExit([candle(0, 100, 100), candle(1, 101, 99.5), candle(2, 103.2, 100)], bull, 3);
  assert.equal(win.outcome, 'win');
  assert.equal(win.rMultiple, 3);
  assert.equal(win.exitIndex, 2);
  assert.equal(win.targetPrice, 103);
});

test('resimulateExit: the stop wins a tie inside one candle (conservative convention)', () => {
  const r = resimulateExit([candle(0, 100, 100), candle(1, 104, 98.9)], bull, 3);
  assert.equal(r.outcome, 'loss');
  assert.equal(r.rMultiple, -1);
});

test('resimulateExit: a bearish trade mirrors the logic', () => {
  const bear = { entryIndex: 0, entryPrice: 100, stopPrice: 101, distance: 1, direction: 'bearish' };
  const r = resimulateExit([candle(0, 100, 100), candle(1, 100.5, 96.5)], bear, 3);
  assert.equal(r.outcome, 'win');
  assert.equal(r.rMultiple, 3);
});

test('resimulateExit: times out at the close after 480 candles, and gives up if the data ends first', () => {
  const flat = Array.from({ length: 481 }, (_, i) => candle(i, 100.2, 99.8, i === 480 ? 100.5 : 100));
  const t = resimulateExit(flat, bull, 3);
  assert.equal(t.outcome, 'timeout');
  assert.equal(t.rMultiple, 0.5);
  assert.equal(resimulateExit(flat.slice(0, 50), bull, 3), null);
  assert.equal(resimulateExit(flat, { ...bull, distance: 0 }, 3), null);
});

// runRecipe ---------------------------------------------------------------------------------
function series() {
  const candles = [];
  const start = Date.UTC(2020, 0, 6);
  let price = 100;
  for (let i = 0; i < 6000; i++) {
    const open = price;
    const close = open + Math.sin(i / 9) * 1.4 + (i % 31 === 0 ? 3 : 0) - (i % 47 === 0 ? 3 : 0);
    candles.push({ time: start + i * 900000, open, high: Math.max(open, close) + 0.9, low: Math.min(open, close) - 0.9, close });
    price = close;
  }
  return candles;
}

test('runRecipe: a bare trigger returns all its trades in the compact shape', () => {
  const candles = series();
  const r = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend' }));
  assert.ok(r.rawCount > 50, 'the synthetic series must produce trades for this to prove anything');
  assert.equal(r.trades.length, r.rawCount);
  assert.equal(r.afterFilters, r.rawCount);
  for (const t of r.trades) {
    assert.ok(Number.isFinite(t.r) && Number.isFinite(t.entryTime) && t.holdCandles >= 0);
    assert.ok(['bullish', 'bearish'].includes(t.direction));
  }
});

test('runRecipe: the weekday and direction filters remove exactly the trades they should', () => {
  const candles = series();
  const base = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend' }));
  const mondays = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend', weekdays: [1] }));
  assert.ok(mondays.trades.length > 0 && mondays.trades.length < base.trades.length);
  assert.ok(mondays.trades.every((t) => new Date(t.entryTime).getUTCDay() === 1));
  const longs = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend', direction: 'bullish' }));
  assert.ok(longs.trades.length > 0 && longs.trades.every((t) => t.direction === 'bullish'));
  assert.equal(longs.trades.length + runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend', direction: 'bearish' })).trades.length, base.trades.length);
});

test('runRecipe: the session filter keeps only entries whose New York hour is in the window', () => {
  const candles = series();
  const r = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend', session: { startHour: 8, endHour: 12 } }));
  assert.ok(r.trades.length > 0);
  for (const t of r.trades) {
    const nyHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit' }).format(new Date(t.entryTime + 5 * 3600000)));
    assert.ok(nyHour >= 8 && nyHour < 12, `entry at NY hour ${nyHour}`);
  }
});

test('runRecipe: another R:R replaces the exits - every winner is worth exactly that R', () => {
  const candles = series();
  const r = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'asian-range-breakout', rr: 2 }));
  assert.ok(r.trades.length > 0);
  assert.ok(r.trades.some((t) => t.outcome === 'win') && r.trades.some((t) => t.outcome === 'loss'));
  for (const t of r.trades) {
    if (t.outcome === 'win') assert.equal(t.r, 2);
    if (t.outcome === 'loss') assert.equal(t.r, -1);
  }
});

test('runRecipe: the bot\'s guardrails thin the trades out and say by how many', () => {
  const candles = series();
  const free = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend' }));
  const gated = runRecipe(candles, 'US100', 0, normalizeRecipe({ trigger: 'macd-trend', guardrails: { maxTradesPerDay: 1 } }));
  assert.ok(gated.trades.length < free.trades.length);
  assert.equal(gated.guardrailSkipped, free.trades.length - gated.trades.length);
});
