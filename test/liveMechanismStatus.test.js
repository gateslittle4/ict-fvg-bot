import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nwogLiveStatus,
  judasSwingLiveStatus,
  weeklySweepLiveStatus,
  breakerBlockLiveStatus,
  silverBulletLiveStatus,
  divergenceLiveStatus,
} from '../src/backtest/liveMechanismStatus.js';

function candle(time, open, high, low, close) {
  return { time, open, high, low, close };
}
const H = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;
function histDataTime(y, m, d, h, min) { return Date.UTC(y, m - 1, d, h, min, 0); }

// --- NWOG -------------------------------------------------------------

test('nwogLiveStatus: no gap anywhere reports "no signal yet"', () => {
  const candles = [candle(0, 100, 100.5, 99.5, 100), candle(M15, 100, 100.5, 99.5, 100)];
  const { items } = nwogLiveStatus(candles);
  assert.equal(items[0].ok, false);
  assert.match(items[0].detail, /Aucun gap/);
});

test('nwogLiveStatus: a recent gap reports the signal, entry already opened', () => {
  const candles = [
    candle(0, 100, 100.5, 99.5, 100),
    candle(50 * H, 108, 109, 107.5, 108.2), // gap candle
    candle(51 * H, 108.2, 108.5, 108, 108.3), // entry candle
    candle(52 * H, 108.3, 108.6, 108.1, 108.4), // one more candle so entry is "already opened", not "about to"
  ];
  const { items } = nwogLiveStatus(candles);
  assert.equal(items[0].ok, true);
  assert.match(items[0].detail, /déjà ouvert/);
});

test('nwogLiveStatus: a bearish gap on a long-only symbol is reported as filtered', () => {
  const candles = [
    candle(0, 100, 100.5, 99.5, 100),
    candle(50 * H, 92, 93, 91, 92.5), // bullish gap (mirror) - use bearish instead below
  ];
  // bearish gap: gapped DOWN from close means price opens lower -> direction bearish per detectNwogEvents mirror logic
  const bearishCandles = [candle(0, 100, 100.5, 99.5, 100), candle(50 * H, 108, 109, 107.5, 108.2), candle(51 * H, 108.2, 108.5, 108, 108.3)];
  const { items } = nwogLiveStatus(bearishCandles, { longOnlySymbols: ['US100'], symbol: 'US100' });
  assert.equal(items[0].ok, false);
  assert.match(items[0].detail, /filtré/);
});

// --- Judas Swing --------------------------------------------------------

function judasDay1() {
  return [
    candle(histDataTime(2024, 1, 15, 0, 0), 100, 101, 99, 100),
    candle(histDataTime(2024, 1, 15, 6, 0), 100, 110, 100, 108), // day high 110
    candle(histDataTime(2024, 1, 15, 12, 0), 108, 109, 90, 95), // day low 90
    candle(histDataTime(2024, 1, 15, 18, 0), 95, 100, 94, 99),
  ];
}

test('judasSwingLiveStatus: reports PDH/PDL and "no signal, in killzone" when no wick+reclaim happened yet', () => {
  const candles = [...judasDay1(), candle(histDataTime(2024, 1, 16, 2, 30), 100, 101, 99.5, 100.5)]; // inside killzone, no sweep
  const { items } = judasSwingLiveStatus(candles);
  const levels = items.find((i) => i.key === 'levels');
  const signal = items.find((i) => i.key === 'signal');
  assert.match(levels.detail, /PDH 110/);
  assert.equal(signal.ok, false);
  assert.match(signal.detail, /killzone/);
});

test('judasSwingLiveStatus: a real signal today reports it, entry already opened', () => {
  const candles = [
    ...judasDay1(),
    candle(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108), // wick+reclaim, bearish
    candle(histDataTime(2024, 1, 16, 2, 45), 108, 108.5, 107.5, 108), // entry candle
    candle(histDataTime(2024, 1, 16, 3, 0), 108, 108.2, 107.8, 108), // one more so entry reads "already opened"
  ];
  const { items } = judasSwingLiveStatus(candles);
  const signal = items.find((i) => i.key === 'signal');
  assert.equal(signal.ok, true);
  assert.match(signal.detail, /déjà ouvert/);
});

// --- Weekly Sweep --------------------------------------------------------

function twoWeekFixture(week2Candles) {
  return [candle(0, 100, 100.5, 99.7, 100), candle(M15, 100, 101, 99.5, 100.5), candle(2 * M15, 100.5, 100.8, 99, 100), ...week2Candles];
}

test('weeklySweepLiveStatus: reports PWH/PWL and "no signal" when no sweep happened yet this week', () => {
  const candles = twoWeekFixture([candle(50 * H, 100.2, 100.5, 100, 100.3)]); // no sweep
  const { items } = weeklySweepLiveStatus(candles);
  const levels = items.find((i) => i.key === 'levels');
  const signal = items.find((i) => i.key === 'signal');
  assert.match(levels.detail, /PWH 101/);
  assert.equal(signal.ok, false);
});

test('weeklySweepLiveStatus: a real signal this week reports it', () => {
  const candles = twoWeekFixture([
    candle(50 * H, 100.2, 102, 100, 100.5), // wick above PWH, bearish, reclaims
    candle(50 * H + M15, 100.5, 100.6, 100.4, 100.5), // entry candle
    candle(50 * H + 2 * M15, 100.5, 100.6, 100.4, 100.5), // one more so entry reads "already opened"
  ]);
  const { items } = weeklySweepLiveStatus(candles);
  const signal = items.find((i) => i.key === 'signal');
  assert.equal(signal.ok, true);
  assert.match(signal.detail, /déjà ouvert/);
});

// --- Breaker Block (production-default fixture, reused from tradeCompliance.test.js) --

function breakerFixtureUpToRetest() {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(5000, 1, 2.0, 0.95, 1)); // swing high spike
  for (let i = 6; i <= 10; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(11000, 1.0, 1.02, 0.85, 0.9)); // bearish OB candle
  candles.push(candle(12000, 1, 1.05, 0.95, 1.05));
  candles.push(candle(13000, 1, 2.2, 0.95, 2.1)); // bullish BOS candle
  return candles;
}

test('breakerBlockLiveStatus: idle when no BOS yet', () => {
  const { items } = breakerBlockLiveStatus([candle(0, 1, 1.05, 0.95, 1), candle(1000, 1, 1.05, 0.95, 1)]);
  assert.equal(items[0].ok, false);
  assert.match(items[0].detail, /Aucune cassure/);
});

test('breakerBlockLiveStatus: watchBreak phase right after the BOS/order-block is found', () => {
  const { items } = breakerBlockLiveStatus(breakerFixtureUpToRetest());
  assert.match(items[0].label, /Order block trouvé/);
});

test('breakerBlockLiveStatus: pendingEntry phase reports "entrée à la prochaine bougie"', () => {
  const candles = breakerFixtureUpToRetest();
  for (let i = 14; i <= 17; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(18000, 1, 1.05, 0.5, 0.6)); // breaks through zoneLow
  for (let i = 19; i <= 22; i++) candles.push(candle(i * 1000, 0.6, 0.7, 0.55, 0.6));
  candles.push(candle(23000, 0.6, 0.94, 0.55, 0.7)); // retests the mid -> pendingEntry, no more candles after
  const { items } = breakerBlockLiveStatus(candles);
  assert.equal(items[0].ok, true);
  assert.match(items[0].detail, /prochaine bougie/);
});

// --- Silver Bullet (fixture reused from tradeCompliance.test.js) --------

function silverBaseToFvg() {
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(candle(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(candle(t, 105, 110, 104, 106)); t += M15;
  for (let i = 0; i < 5; i++) { candles.push(candle(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(candle(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(candle(t, 105, 112, 104, 111)); t += M15;
  for (let i = 0; i < 5; i++) { candles.push(candle(t, 108, 108.2, 107.8, 108)); t += M15; }
  while (new Date(t).getUTCHours() < 9 || (new Date(t).getUTCHours() === 9 && new Date(t).getUTCMinutes() < 30)) {
    candles.push(candle(t, 108, 108.2, 107.8, 108)); t += M15;
  }
  candles.push(candle(t, 108, 108.5, 107.5, 108)); t += M15;
  candles.push(candle(t, 108, 109, 107, 108)); t += M15;
  candles.push(candle(t, 109, 110, 108.9, 109.5)); t += M15; // c3 -> bullish FVG [108.5, 108.9]
  return { candles, t };
}

test('silverBulletLiveStatus: active phase once the zone forms, waiting for mitigation', () => {
  const { candles } = silverBaseToFvg();
  const { items } = silverBulletLiveStatus(candles);
  assert.match(items[0].label, /en attente de mitigation/);
});

test('silverBulletLiveStatus: pendingEntry phase reports "entrée à la prochaine bougie"', () => {
  const { candles, t } = silverBaseToFvg();
  const withMitigation = [...candles, candle(t, 109.3, 109.4, 108.7, 108.8)]; // mitigation on the last candle
  const { items } = silverBulletLiveStatus(withMitigation);
  assert.equal(items[0].ok, true);
  assert.match(items[0].detail, /prochaine bougie/);
});

// --- Divergence -----------------------------------------------------------

test('divergenceLiveStatus: not enough aligned H1 history degrades to non applicable, not a crash', () => {
  const own = [candle(0, 100, 101, 99, 100)];
  const partner = [candle(0, 50, 51, 49, 50)];
  const cfg = { pair: ['US100', 'US500'], lookback: 100, zThreshold: 2 };
  const { items } = divergenceLiveStatus('US100', own, partner, cfg);
  assert.equal(items[0].applicable, false);
});
