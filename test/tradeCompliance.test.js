import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconstructFvgZone,
  reconstructStopDistance,
  isGapThroughFill,
  computeHtfBiasAtEntry,
  requiredH1LookbackCandles,
  reconstructRiskCheck,
  buildFvgComplianceChecklist,
  reconstructNwogCandidate,
  reconstructJudasSwingCandidate,
  reconstructWeeklySweepCandidate,
  reconstructBreakerBlockCandidate,
  reconstructSilverBulletCandidate,
  requiredPreEntryContextCandles,
  buildComplianceChecklist,
} from '../src/dataSources/tradeCompliance.js';

function candle(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Bullish 3-candle gap: c1.high=101, c3.low=103 -> zone [101,103], validated
// when a later candle's low <= 103.
function bullishSetup() {
  const c1 = candle(1, 100, 101, 99, 100.5);
  const c2 = candle(2, 100.5, 105, 100.4, 104.8);
  const c3 = candle(3, 104.8, 106, 103, 105.5);
  const c4 = candle(4, 105.5, 106.5, 105, 106);
  const validating = candle(5, 105, 105.5, 102, 104); // low=102 <= zone.top(103), high=105.5 contains entryPrice(103)
  return [c1, c2, c3, c4, validating];
}

test('reconstructFvgZone: finds the bullish zone and the validating candle, matching liveStrategyEngine\'s own entryPrice convention', () => {
  const candles = bullishSetup();
  const result = reconstructFvgZone(candles, 'bullish', candles[4].time);
  assert.ok(result);
  assert.equal(result.zone.bottom, 101);
  assert.equal(result.zone.top, 103);
  assert.equal(result.entryPrice, 103); // bullish -> zone.top, same as _processFvgEvent
  assert.equal(result.c1Index, 0);
  assert.equal(result.validatedCandle.time, 5);
});

test('reconstructFvgZone: returns null when no zone of the requested direction ever validates', () => {
  const candles = bullishSetup();
  const result = reconstructFvgZone(candles, 'bearish', candles[4].time);
  assert.equal(result, null);
});

test('reconstructFvgZone: with several validations, picks the one CLOSEST to entryTime', () => {
  const candles = bullishSetup();
  // entryTime far from the actual validating candle (time=5) but still closer to it than to nothing
  const result = reconstructFvgZone(candles, 'bullish', 5.2);
  assert.ok(result);
  assert.equal(result.validatedCandle.time, 5);
});

test('isGapThroughFill: false when entryPrice sits within the validating candle\'s own range', () => {
  const validatedCandle = candle(5, 105, 105.5, 102, 104);
  assert.equal(isGapThroughFill(103, validatedCandle), false);
});

test('isGapThroughFill: true when entryPrice sits OUTSIDE the validating candle\'s range (real 2025-12-29 US100 bug shape)', () => {
  // candle gapped straight through the zone: high=102 never reached entryPrice=103
  const validatedCandle = candle(5, 100, 102, 95, 96);
  assert.equal(isGapThroughFill(103, validatedCandle), true);
});

test('reconstructStopDistance: fvg-edge mode - stop is 10% of the zone height beyond the far edge', () => {
  const candles = bullishSetup();
  const zone = { top: 103, bottom: 101 };
  const { stopPrice, distance } = reconstructStopDistance(candles, 'bullish', zone, 0, { stopMode: 'fvg-edge' });
  assert.equal(stopPrice, 101 - (103 - 101) * 0.1);
  assert.equal(Math.round(distance * 100) / 100, 2.2);
});

test('reconstructStopDistance: swing mode - stop is the lowest low in the swing-lookback window ending at c1Index', () => {
  const candles = [
    candle(0, 10, 10.5, 9.7, 10.2), // the swing low in this window
    candle(1, 100, 101, 99, 100.5), // c1 (c1Index=1)
    candle(2, 100.5, 105, 100.4, 104.8),
    candle(3, 104.8, 106, 103, 105.5), // c3
  ];
  const zone = { top: 103, bottom: 101 };
  const { stopPrice } = reconstructStopDistance(candles, 'bullish', zone, 1, { stopMode: 'swing' });
  assert.equal(stopPrice, 9.7);
});

test('computeHtfBiasAtEntry: returns null for a baseline variant (no bias filter configured)', () => {
  assert.equal(computeHtfBiasAtEntry([], 'baseline', 1000), null);
});

test('computeHtfBiasAtEntry: returns null for an unparseable variant', () => {
  assert.equal(computeHtfBiasAtEntry([candle(0, 1, 1, 1, 1)], 'nonsense', 1000), null);
});

test('computeHtfBiasAtEntry: bullish when price sits above a seeded EMA', () => {
  const H1 = 60 * 60 * 1000;
  const h1Candles = [];
  // 25 flat H1 candles at price 100 to seed an EMA20, then a jump to 110.
  for (let i = 0; i < 25; i++) h1Candles.push(candle(i * H1, 100, 100.2, 99.8, 100));
  h1Candles.push(candle(25 * H1, 100, 111, 109, 110));
  const bias = computeHtfBiasAtEntry(h1Candles, 'H1_EMA20', 26 * H1 + 1);
  assert.equal(bias, 'bullish');
});

test('requiredH1LookbackCandles: baseline needs no fetch at all', () => {
  assert.equal(requiredH1LookbackCandles('baseline'), 0);
});

test('requiredH1LookbackCandles: H4_EMA200 needs (200+10)*4 H1 candles', () => {
  assert.equal(requiredH1LookbackCandles('H4_EMA200'), 840);
});

test('requiredH1LookbackCandles: H1_EMA50 needs (50+10)*1 H1 candles', () => {
  assert.equal(requiredH1LookbackCandles('H1_EMA50'), 60);
});

test('reconstructRiskCheck: within tolerance of the configured risk% is ok', () => {
  // riskAmount = |pnlUsd/rMultiple| = |250/5| = 50; balanceBefore = 10000; actual = 0.5%
  const result = reconstructRiskCheck({ pnlUsd: 250, rMultiple: 5, balanceAfter: 10250, expectedRiskPct: 0.5 });
  assert.ok(result);
  assert.equal(result.actualRiskPct, 0.5);
  assert.equal(result.withinTolerance, true);
});

test('reconstructRiskCheck: far outside tolerance is flagged', () => {
  const result = reconstructRiskCheck({ pnlUsd: 500, rMultiple: 5, balanceAfter: 10500, expectedRiskPct: 0.5 });
  // riskAmount = 100, balanceBefore = 10000, actual = 1.0% vs expected 0.5% -> way outside 15% tolerance
  assert.equal(result.withinTolerance, false);
});

test('reconstructRiskCheck: returns null (non vérifiable) rather than a guess when data is missing', () => {
  assert.equal(reconstructRiskCheck({ pnlUsd: null, rMultiple: 5, balanceAfter: 10000, expectedRiskPct: 0.5 }), null);
  assert.equal(reconstructRiskCheck({ pnlUsd: 100, rMultiple: 0, balanceAfter: 10000, expectedRiskPct: 0.5 }), null);
  assert.equal(reconstructRiskCheck({ pnlUsd: 100, rMultiple: 5, balanceAfter: 10000, expectedRiskPct: null }), null);
});

test('buildFvgComplianceChecklist: no cfg (non-fvg source/symbol) - only the risk item is applicable', () => {
  const trade = { direction: 'bullish', entryTime: 5, pnlUsd: 250, rMultiple: 5, balanceAfter: 10250 };
  const { zone, items } = buildFvgComplianceChecklist({ trade, candles: [], cfg: null, h1Candles: null, expectedRiskPct: 0.5 });
  assert.equal(zone, null);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.risk.applicable, true);
  assert.equal(byKey.zone.applicable, false);
  assert.equal(byKey.stop.applicable, false);
  assert.equal(byKey.bias.applicable, false);
});

test('buildFvgComplianceChecklist: fvg source, zone found, gap-through fill flagged as an anomaly', () => {
  const candles = [
    candle(1, 100, 101, 99, 100.5),
    candle(2, 100.5, 105, 100.4, 104.8),
    candle(3, 104.8, 106, 103, 105.5),
    candle(4, 105.5, 106.5, 105, 106),
    candle(5, 100, 102, 95, 96), // gaps straight through - never trades up to entryPrice(103)
  ];
  const trade = { direction: 'bullish', entryTime: 5, pnlUsd: -50, rMultiple: -1, balanceAfter: 9950 };
  const { zone, items } = buildFvgComplianceChecklist({ trade, candles, cfg: { variant: 'baseline', stopMode: 'fvg-edge' }, h1Candles: null, expectedRiskPct: 0.5 });
  assert.deepEqual(zone, { top: 103, bottom: 101 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.zone.ok, true);
  assert.equal(byKey.stop.ok, false);
  assert.match(byKey.stop.label, /anormalement petite/);
  assert.equal(byKey.bias.applicable, false); // variant is 'baseline' here
});

test('buildFvgComplianceChecklist: bias variant with no h1Candles is marked non vérifiable, not guessed', () => {
  const candles = [candle(1, 100, 101, 99, 100.5), candle(2, 100.5, 105, 100.4, 104.8), candle(3, 104.8, 106, 103, 105.5), candle(4, 103, 104, 102, 103)];
  const trade = { direction: 'bullish', entryTime: 4, pnlUsd: 250, rMultiple: 5, balanceAfter: 10250 };
  const { items } = buildFvgComplianceChecklist({ trade, candles, cfg: { variant: 'H4_EMA200', stopMode: 'fvg-edge' }, h1Candles: [], expectedRiskPct: 0.5 });
  const bias = items.find((i) => i.key === 'bias');
  assert.equal(bias.applicable, false);
  assert.match(bias.detail, /Non vérifiable/);
});

// ---------------------------------------------------------------------------
// Non-FVG mechanisms (2026-09-17) - fixtures reused verbatim from each
// mechanism's own test file (test/nwog.test.js, test/judasSwing.test.js,
// test/weeklyLiquiditySweep.test.js, test/liveStrategyEngine.test.js's
// production-default Breaker Block fixture, test/silverBullet.test.js) so
// these tests are checking the WRAPPING logic (shift-to-entry, candidate
// matching, checklist items), not re-proving detection already covered
// elsewhere.
// ---------------------------------------------------------------------------

const H = 60 * 60 * 1000;
function histDataTime(y, m, d, h, min) { return Date.UTC(y, m - 1, d, h, min, 0); }

test('reconstructNwogCandidate: finds the real candidate at its entry candle (fixture from test/nwog.test.js)', () => {
  const candles = [
    candle(0, 100, 100.5, 99.5, 100),
    candle(50 * H, 108, 109, 107.5, 108.2), // gap candle
    candle(51 * H, 108.2, 108.5, 108, 108.3), // entry candle
  ];
  const found = reconstructNwogCandidate(candles, 'bearish', 51 * H);
  assert.ok(found);
  assert.equal(found.stopReference, 109);
});

test('reconstructNwogCandidate: a direction mismatch at the same timestamp is never returned', () => {
  const candles = [candle(0, 100, 100.5, 99.5, 100), candle(50 * H, 108, 109, 107.5, 108.2), candle(51 * H, 108.2, 108.5, 108, 108.3)];
  assert.equal(reconstructNwogCandidate(candles, 'bullish', 51 * H), null);
});

test('reconstructJudasSwingCandidate: finds the real candidate at its entry candle (fixture from test/judasSwing.test.js)', () => {
  const candles = [
    candle(histDataTime(2024, 1, 15, 0, 0), 100, 101, 99, 100),
    candle(histDataTime(2024, 1, 15, 6, 0), 100, 110, 100, 108), // day high 110
    candle(histDataTime(2024, 1, 15, 12, 0), 108, 109, 90, 95), // day low 90
    candle(histDataTime(2024, 1, 15, 18, 0), 95, 100, 94, 99),
    candle(histDataTime(2024, 1, 16, 1, 0), 99, 100, 98, 99),
    candle(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108), // wick+reclaim, bearish, sweepExtreme=112
    candle(histDataTime(2024, 1, 16, 2, 45), 108, 108.5, 107.5, 108), // entry candle
  ];
  const entryTime = histDataTime(2024, 1, 16, 2, 45);
  const found = reconstructJudasSwingCandidate(candles, 'bearish', entryTime);
  assert.ok(found);
  assert.equal(found.stopReference, 112);
});

test('reconstructWeeklySweepCandidate: finds the real candidate at its entry candle (fixture from test/weeklyLiquiditySweep.test.js)', () => {
  const M15 = 15 * 60 * 1000;
  const candles = [
    candle(0, 100, 100.5, 99.7, 100), candle(M15, 100, 101, 99.5, 100.5), candle(2 * M15, 100.5, 100.8, 99, 100),
    candle(50 * H, 100.2, 102, 100, 100.5), // wick above PWH, bearish, sweepExtreme=102
    candle(50 * H + M15, 100.5, 100.6, 100.4, 100.5), // entry candle
  ];
  const entryTime = 50 * H + M15;
  const found = reconstructWeeklySweepCandidate(candles, 'bearish', entryTime);
  assert.ok(found);
  assert.equal(found.stopReference, 102);
});

test('reconstructBreakerBlockCandidate: finds the real candidate at its entry candle (production-default fixture from test/liveStrategyEngine.test.js)', () => {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(5000, 1, 2.0, 0.95, 1)); // swing high spike
  for (let i = 6; i <= 10; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(11000, 1.0, 1.02, 0.85, 0.9)); // bearish OB candle
  candles.push(candle(12000, 1, 1.05, 0.95, 1.05));
  candles.push(candle(13000, 1, 2.2, 0.95, 2.1)); // bullish BOS candle
  for (let i = 14; i <= 17; i++) candles.push(candle(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(candle(18000, 1, 1.05, 0.5, 0.6)); // breaks through zoneLow
  for (let i = 19; i <= 22; i++) candles.push(candle(i * 1000, 0.6, 0.7, 0.55, 0.6));
  candles.push(candle(23000, 0.6, 0.94, 0.55, 0.7)); // retests the mid
  candles.push(candle(24000, 0.93, 0.95, 0.9, 0.92)); // entry candle, open=0.93

  const found = reconstructBreakerBlockCandidate(candles, 'bearish', 24000);
  assert.ok(found);
  assert.equal(found.stopReference, 1.02);
});

test('reconstructSilverBulletCandidate: finds the real candidate at its entry candle (fixture from test/silverBullet.test.js)', () => {
  const M15 = 15 * 60 * 1000;
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(candle(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(candle(t, 105, 110, 104, 106)); t += M15; // swing high = 110
  for (let i = 0; i < 5; i++) { candles.push(candle(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(candle(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(candle(t, 105, 112, 104, 111)); t += M15; // BOS -> bullish structure bias
  for (let i = 0; i < 5; i++) { candles.push(candle(t, 108, 108.2, 107.8, 108)); t += M15; }
  while (new Date(t).getUTCHours() < 9 || (new Date(t).getUTCHours() === 9 && new Date(t).getUTCMinutes() < 30)) {
    candles.push(candle(t, 108, 108.2, 107.8, 108)); t += M15;
  }
  candles.push(candle(t, 108, 108.5, 107.5, 108)); t += M15; // c1
  candles.push(candle(t, 108, 109, 107, 108)); t += M15; // c2
  candles.push(candle(t, 109, 110, 108.9, 109.5)); t += M15; // c3 -> bullish FVG [108.5, 108.9]
  candles.push(candle(t, 109.3, 109.4, 108.7, 108.8)); t += M15; // mitigation
  const entryTime = t;
  candles.push(candle(t, 109.5, 109.6, 109.4, 109.5)); t += M15; // entry candle, open=109.5

  const found = reconstructSilverBulletCandidate(candles, 'bullish', entryTime);
  assert.ok(found);
  assert.ok(Math.abs(found.stopReference - 108.46) < 1e-9);
});

test('requiredPreEntryContextCandles: 0 for fvg/divergence/nwog, positive for the other 4', () => {
  assert.equal(requiredPreEntryContextCandles('fvg'), 0);
  assert.equal(requiredPreEntryContextCandles('divergence'), 0);
  assert.equal(requiredPreEntryContextCandles('nwog'), 0);
  assert.ok(requiredPreEntryContextCandles('judaswing') > 0);
  assert.ok(requiredPreEntryContextCandles('weeklysweep') > 0);
  assert.ok(requiredPreEntryContextCandles('breakerblock') > 0);
  assert.ok(requiredPreEntryContextCandles('silverbullet') > 0);
});

test('buildComplianceChecklist: fvg source delegates to buildFvgComplianceChecklist unchanged', () => {
  const candles = [candle(1, 100, 101, 99, 100.5), candle(2, 100.5, 105, 100.4, 104.8), candle(3, 104.8, 106, 103, 105.5), candle(4, 103, 104, 102, 103), candle(5, 105, 105.5, 102, 104)];
  const trade = { source: 'fvg', direction: 'bullish', entryTime: 5, pnlUsd: 250, rMultiple: 5, balanceAfter: 10250 };
  const { items } = buildComplianceChecklist({ trade, candles, cfg: { variant: 'baseline', stopMode: 'fvg-edge' }, h1Candles: null, expectedRiskPct: 0.5 });
  assert.ok(items.find((i) => i.key === 'zone'));
});

test('buildComplianceChecklist: nwog source finds the real candidate and reports the longOnlySymbols rule when applicable', () => {
  const candles = [candle(0, 100, 100.5, 99.5, 100), candle(50 * H, 92, 93, 91, 92.5), candle(51 * H, 92.5, 93, 92, 92.8)]; // bullish gap
  const trade = { source: 'nwog', symbol: 'US100', direction: 'bullish', entryTime: 51 * H, entryPrice: 92.5, stopPrice: 91, pnlUsd: 150, rMultiple: 5, balanceAfter: 10150 };
  const { items } = buildComplianceChecklist({ trade, candles, cfg: { longOnlySymbols: ['US100'] }, h1Candles: null, expectedRiskPct: 0.5 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.signal.ok, true);
  assert.equal(byKey.stop.ok, true);
  assert.equal(byKey['direction-filter'].ok, true); // bullish, conforms to the achat-seul rule
});

test('buildComplianceChecklist: judaswing source reports the killzone item alongside the signal', () => {
  const candles = [
    candle(histDataTime(2024, 1, 15, 0, 0), 100, 101, 99, 100),
    candle(histDataTime(2024, 1, 15, 6, 0), 100, 110, 100, 108),
    candle(histDataTime(2024, 1, 15, 12, 0), 108, 109, 90, 95),
    candle(histDataTime(2024, 1, 15, 18, 0), 95, 100, 94, 99),
    candle(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108),
    candle(histDataTime(2024, 1, 16, 2, 45), 108, 108.5, 107.5, 108),
  ];
  const entryTime = histDataTime(2024, 1, 16, 2, 45);
  const trade = { source: 'judaswing', symbol: 'EURUSD', direction: 'bearish', entryTime, entryPrice: 108, stopPrice: 112, pnlUsd: -50, rMultiple: -1, balanceAfter: 9950 };
  const { items } = buildComplianceChecklist({ trade, candles, cfg: null, h1Candles: null, expectedRiskPct: 0.5 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.signal.ok, true);
  assert.equal(byKey.session.ok, true); // 02:45 NY is inside 02:00-05:00
});

test('buildComplianceChecklist: an unrecognized source degrades to a labeled "unknown mechanism" item, never a crash', () => {
  const trade = { source: 'not-a-real-source', symbol: 'US100', direction: 'bullish', entryTime: 1, entryPrice: 100, stopPrice: 99, pnlUsd: 10, rMultiple: 1, balanceAfter: 10010 };
  const { items } = buildComplianceChecklist({ trade, candles: [], cfg: null, h1Candles: null, expectedRiskPct: 0.5 });
  const signal = items.find((i) => i.key === 'signal');
  assert.equal(signal.applicable, false);
  assert.match(signal.detail, /inconnu/);
});

test('buildComplianceChecklist: divergence source always confirms the "always buys the laggard" rule and marks z-score non vérifiable', () => {
  const candles = [candle(0, 100, 101, 99, 100), candle(1, 100, 101, 99.5, 100.5)];
  const trade = { source: 'divergence', symbol: 'US100', direction: 'bullish', entryTime: 1, entryPrice: 100, stopPrice: 98, pnlUsd: 50, rMultiple: 2, balanceAfter: 10050 };
  const { items } = buildComplianceChecklist({ trade, candles, cfg: { atrPeriod: 14, stopAtrMultiple: 1.5 }, h1Candles: null, expectedRiskPct: 0.5 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey['direction-rule'].ok, true);
  assert.equal(byKey.zscore.applicable, false);
  assert.match(byKey.zscore.detail, /PARTENAIRE/);
});

test('buildComplianceChecklist: a signal not found in the available candles degrades to non vérifiable, not a fabricated pass', () => {
  const candles = [candle(0, 100, 100.5, 99.5, 100), candle(15 * 60 * 1000, 100, 100.5, 99.5, 100)]; // no real NWOG gap anywhere here
  const trade = { source: 'nwog', symbol: 'GER40', direction: 'bullish', entryTime: 15 * 60 * 1000, entryPrice: 100, stopPrice: 99, pnlUsd: 30, rMultiple: 1, balanceAfter: 10030 };
  const { items } = buildComplianceChecklist({ trade, candles, cfg: {}, h1Candles: null, expectedRiskPct: 0.5 });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.signal.applicable, false);
  assert.equal(byKey.stop.applicable, false);
});
