import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, normalizeChallengeParams, groupTradesByDay, simulateChallenge, buildHeatmap, analyzePortfolio } from '../src/backtest/labAnalytics.js';
import { ImportError } from '../src/backtest/m1Import.js';

const DAY = 86400000;
const MON = Date.UTC(2020, 0, 6); // a Monday, 00:00 engine time
const HOUR = 3600000;

// One trade a day at 10:00, each with the given R; day i = MON + i days.
function dailyTrades(rs, startDay = 0) {
  return rs.map((r, i) => ({ entryTime: MON + (startDay + i) * DAY + 10 * HOUR, exitTime: MON + (startDay + i) * DAY + 11 * HOUR, rMultiple: r }));
}
const RULES = { targetPct: 10, dailyLossLimitPct: 3, maxDrawdownPct: 10, riskPct: 1, runs: 400, seed: 7 };

test('mulberry32: same seed, same sequence; values in [0,1)', () => {
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 50; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('normalizeChallengeParams: fills defaults, refuses nonsense with a user-facing error', () => {
  const p = normalizeChallengeParams({ targetPct: 10, dailyLossLimitPct: 5, maxDrawdownPct: 10 });
  assert.equal(p.riskPct, 1);
  assert.equal(p.maxDrawdownType, 'static');
  assert.throws(() => normalizeChallengeParams({ targetPct: 10, dailyLossLimitPct: 5 }), ImportError); // no drawdown
  assert.throws(() => normalizeChallengeParams({ ...RULES, riskPct: 50 }), ImportError);
  assert.throws(() => normalizeChallengeParams({ ...RULES, targetPct: 'abc' }), ImportError);
  assert.throws(() => normalizeChallengeParams({ ...RULES, maxDrawdownType: 'weird' }), ImportError);
  assert.throws(() => normalizeChallengeParams({ ...RULES, runs: 10 ** 9 }), ImportError);
});

test('groupTradesByDay: keeps a day together, in exit order, and skips non-finite R', () => {
  const t = [
    { entryTime: MON + 9 * HOUR, exitTime: MON + 12 * HOUR, rMultiple: 2 },
    { entryTime: MON + 8 * HOUR, exitTime: MON + 9 * HOUR, rMultiple: -1 },
    { entryTime: MON + DAY, exitTime: MON + DAY + HOUR, rMultiple: 1 },
    { entryTime: MON + DAY, exitTime: MON + DAY + HOUR, rMultiple: NaN },
  ];
  assert.deepEqual(groupTradesByDay(t), [[-1, 2], [1]]);
});

test('simulateChallenge: too few trades is reported, never a number built on nothing', () => {
  const r = simulateChallenge(dailyTrades([1, 1, 1]), RULES);
  assert.equal(r.insufficient, true);
});

test('simulateChallenge: a strategy that only wins passes every time, in target/risk days', () => {
  const r = simulateChallenge(dailyTrades(Array(30).fill(1)), RULES);
  assert.equal(r.passRate, 1);
  assert.equal(r.daysToPass.median, 10); // +1% a day to reach +10%
  assert.equal(r.counts.failDrawdown + r.counts.failDaily + r.counts.timeout, 0);
});

test('simulateChallenge: a strategy that only loses hits the total drawdown, never passes', () => {
  const r = simulateChallenge(dailyTrades(Array(30).fill(-1)), RULES);
  assert.equal(r.passRate, 0);
  assert.equal(r.counts.failDrawdown, r.runs);
});

test('simulateChallenge: four losses in one day breach a 3% daily limit on the third', () => {
  // 30 identical days of 4 x -1R. Third loss = -3% = the limit -> failDaily, before the 10% drawdown.
  const trades = [];
  for (let d = 0; d < 30; d++) for (let k = 0; k < 4; k++) trades.push({ entryTime: MON + d * DAY + (8 + k) * HOUR, exitTime: MON + d * DAY + (8 + k) * HOUR + 1000, rMultiple: -1 });
  const r = simulateChallenge(trades, RULES);
  assert.equal(r.counts.failDaily, r.runs);
});

test('simulateChallenge: never reaching the target inside the time limit is a timeout, not a pass or a failure', () => {
  const r = simulateChallenge(dailyTrades(Array.from({ length: 30 }, (_, i) => (i % 2 ? -1 : 1))), { ...RULES, maxDays: 10 });
  // +1/-1 days drawn at random can wander, but 10 days can't reach +10% or lose 10%.
  assert.equal(r.counts.timeout, r.runs);
});

test('simulateChallenge: reproducible for a seed', () => {
  const t = dailyTrades(Array.from({ length: 60 }, (_, i) => (i % 3 ? 1.5 : -1)));
  assert.deepEqual(simulateChallenge(t, RULES), simulateChallenge(t, RULES));
});

test('simulateChallenge: a trailing drawdown is stricter than a static one on the same trades', () => {
  const t = dailyTrades(Array.from({ length: 60 }, (_, i) => (i % 2 ? -1 : 1)));
  const tight = { targetPct: 100, dailyLossLimitPct: 50, maxDrawdownPct: 4, riskPct: 1, runs: 3000, seed: 3, maxDays: 100 };
  const stat = simulateChallenge(t, { ...tight, maxDrawdownType: 'static' });
  const trail = simulateChallenge(t, { ...tight, maxDrawdownType: 'trailing-eod' });
  assert.ok(trail.counts.failDrawdown > stat.counts.failDrawdown, `${trail.counts.failDrawdown} vs ${stat.counts.failDrawdown}`);
});

test('buildHeatmap: a cell holds only with enough trades AND a positive expectancy on both halves', () => {
  const at = (weekdayOffset, hour, r, week) => ({ entryTime: MON + (weekdayOffset + 7 * week) * DAY + hour * HOUR, exitTime: MON + (weekdayOffset + 7 * week) * DAY + (hour + 1) * HOUR, rMultiple: r });
  const train = [], test = [];
  for (let w = 0; w < 12; w++) {
    train.push(at(0, 10, 1, w)); // Monday 10h: wins both sides -> holds
    test.push(at(0, 10, 0.5, w + 100));
    train.push(at(1, 9, 1, w)); // Tuesday 9h: wins in train, loses in test -> testable, not holding
    test.push(at(1, 9, -1, w + 100));
  }
  for (let w = 0; w < 3; w++) { train.push(at(2, 8, 1, w)); test.push(at(2, 8, 1, w + 100)); } // too few
  const h = buildHeatmap(train, test);
  const cell = (wd, hr) => h.cells.find((c) => c.weekday === wd && c.hour === hr);
  assert.equal(cell(1, 10).holds, true);
  assert.equal(cell(2, 9).testable, true);
  assert.equal(cell(2, 9).holds, false);
  assert.equal(cell(3, 8).testable, false);
  assert.equal(cell(3, 8).holds, false);
  assert.equal(h.holdingCells, 1);
  assert.equal(h.testableCells, 2);
  assert.equal(h.byWeekday.find((d) => d.key === 1).n, 24);
  assert.equal(h.byHour.find((d) => d.key === 10).n, 24);
});

test('analyzePortfolio: two identical strategies are perfectly correlated and diversify nothing', () => {
  const t = dailyTrades(Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? -1 : 1)));
  const p = analyzePortfolio({ a: { label: 'A', train: t, test: [] }, b: { label: 'B', train: t, test: [] } });
  assert.ok(Math.abs(p.correlation[0][1] - 1) < 1e-9);
  assert.ok(Math.abs(p.drawdownReduction) < 1e-9);
  assert.equal(p.combined.trades, 80);
  assert.equal(p.combined.maxConcurrent, 2);
});

test('analyzePortfolio: opposite strategies cancel each other - correlation -1, no combined drawdown', () => {
  const a = dailyTrades(Array.from({ length: 40 }, (_, i) => (i % 2 ? -1 : 1)));
  const b = dailyTrades(Array.from({ length: 40 }, (_, i) => (i % 2 ? 1 : -1)));
  // Each day the winner exits before the loser, so the merged path is +1 then back to 0 (deterministic order).
  for (const t of [...a, ...b]) if (t.rMultiple > 0) t.exitTime -= HOUR / 2;
  const p = analyzePortfolio({ a: { label: 'A', train: a, test: [] }, b: { label: 'B', train: b, test: [] } });
  assert.ok(Math.abs(p.correlation[0][1] + 1) < 1e-9);
  assert.ok(p.combined.maxDrawdownR <= 1);
  assert.ok(p.drawdownReduction > 0.4);
  assert.ok(Math.abs(p.combined.totalR) < 1e-9);
});

test('analyzePortfolio: strategies that never trade the same day have no measurable correlation (null, not 0)', () => {
  const a = dailyTrades([1, 1, 1, 1, 1, 1]);
  const b = dailyTrades([1, 1, 1, 1, 1, 1], 100);
  const p = analyzePortfolio({ a: { label: 'A', train: a, test: [] }, b: { label: 'B', train: b, test: [] } });
  assert.ok(p.correlation[0][1] < 0); // 12 days, each traded by exactly one of them: perfectly opposite pattern
});

test('analyzePortfolio: splits the combined result into train and test halves', () => {
  const p = analyzePortfolio({ a: { label: 'A', train: dailyTrades([1, 1, 1]), test: dailyTrades([-1, -1], 10) } });
  assert.equal(p.train.trades, 3);
  assert.equal(p.test.trades, 2);
  assert.equal(p.test.totalR, -2);
});
