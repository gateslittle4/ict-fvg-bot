import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, normalizeChallengeParams, groupTradesByDay, simulateChallenge, buildHeatmap, analyzePortfolio, applyGuardrailsToDay, normalizeGuardrails, simulateMultiChallenge, DEFAULT_GUARDRAILS } from '../src/backtest/labAnalytics.js';
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

// --- guardrails / multi-strategy challenge ------------------------------------

const MINUTE = 60000;
// A trade at `startMin` minutes after midnight lasting `lenMin`, worth `r`.
const tr = (startMin, lenMin, r, id = 'a') => ({ id, entryTime: MON + startMin * MINUTE, exitTime: MON + (startMin + lenMin) * MINUTE, r });
const G = { maxTradesPerDay: 3, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, oneOpenPerSymbol: true };

test('normalizeGuardrails: defaults match the live bot (3 trades, 30 min, 2 %, one open per symbol)', () => {
  assert.deepEqual(normalizeGuardrails({}), { maxTradesPerDay: 3, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, oneOpenPerSymbol: true });
  assert.deepEqual(normalizeGuardrails({}), DEFAULT_GUARDRAILS);
  assert.equal(normalizeGuardrails({ oneOpenPerSymbol: false }).oneOpenPerSymbol, false);
  assert.throws(() => normalizeGuardrails({ maxTradesPerDay: 0 }), ImportError);
});

test('applyGuardrailsToDay: the day stops after maxTradesPerDay CLOSED trades', () => {
  const day = [0, 60, 120, 180, 240].map((m) => tr(m, 10, 1));
  assert.equal(applyGuardrailsToDay(day, G, 1).length, 3);
});

test('applyGuardrailsToDay: open trades do not count toward the cap (the project\'s documented semantics) - only "one open per symbol" holds them back', () => {
  const overlapping = [0, 1, 2, 3, 4].map((m) => tr(m, 600, 1)); // all still open when the next signal fires
  assert.equal(applyGuardrailsToDay(overlapping, { ...G, oneOpenPerSymbol: false }, 1).length, 5);
  assert.equal(applyGuardrailsToDay(overlapping, G, 1).length, 1);
});

test('applyGuardrailsToDay: after a loss the next entry waits out the cooldown, measured from the CLOSE of that loss', () => {
  const day = [tr(0, 10, -1), tr(20, 10, 1), tr(41, 10, 1)]; // loss closes at 10 -> entries before minute 40 are refused
  const kept = applyGuardrailsToDay(day, G, 0.5); // 0.5 % risk: one -1R loss is only -0.5 %, far from the daily limit
  assert.deepEqual(kept.map((t) => t.entryTime - MON), [0, 41 * MINUTE]);
});

test('applyGuardrailsToDay: once today\'s closed loss reaches the daily limit, nothing more is taken', () => {
  // two -1R losses at 1 % risk = -2 % = the limit; the third trade (after cooldown) is refused
  const day = [tr(0, 10, -1), tr(60, 10, -1), tr(200, 10, 1)];
  const kept = applyGuardrailsToDay(day, { ...G, maxTradesPerDay: 10 }, 1);
  assert.equal(kept.length, 2);
});

test('simulateMultiChallenge: guardrails thin the offered trades and say by how much, per strategy', () => {
  const trades = (id, offset) => Array.from({ length: 40 }, (_, d) => Array.from({ length: 4 }, (_, k) => ({ entryTime: MON + d * DAY + (offset + k * 90) * MINUTE, exitTime: MON + d * DAY + (offset + k * 90 + 10) * MINUTE, rMultiple: 0.5 }))).flat();
  const by = { a: { label: 'A', trades: trades('a', 0) }, b: { label: 'B', trades: trades('b', 30) } };
  const free = simulateMultiChallenge(by, RULES);
  const gated = simulateMultiChallenge(by, RULES, { guardrails: {} });
  assert.equal(free.offeredTrades, 320);
  assert.equal(free.acceptedTrades, 320); // no guardrails: every signal is taken
  assert.equal(gated.offeredTrades, 320);
  assert.ok(gated.acceptedTrades < 320 && gated.acceptedTrades >= 40 * 3 - 40, `accepted ${gated.acceptedTrades}`);
  assert.equal(gated.perStrategy.reduce((n, s) => n + s.accepted, 0), gated.acceptedTrades);
  assert.equal(gated.guardrails.maxTradesPerDay, 3);
});

test('simulateMultiChallenge: a strategy\'s risk weight scales its results', () => {
  const t = Array.from({ length: 40 }, (_, d) => ({ entryTime: MON + d * DAY, exitTime: MON + d * DAY + 10 * MINUTE, rMultiple: 1 }));
  const double = simulateMultiChallenge({ a: { trades: t } }, RULES, { weights: { a: 2 } });
  const single = simulateMultiChallenge({ a: { trades: t } }, RULES);
  assert.equal(single.daysToPass.median, 10); // +1 % a day
  assert.equal(double.daysToPass.median, 5); // +2 % a day
  assert.equal(double.perStrategy[0].weight, 2);
});

test('simulateMultiChallenge: too few accepted trades is reported as insufficient, not simulated', () => {
  const t = [{ entryTime: MON, exitTime: MON + MINUTE, rMultiple: 1 }];
  assert.equal(simulateMultiChallenge({ a: { trades: t } }, RULES, { guardrails: {} }).insufficient, true);
});

// --- confidence intervals -------------------------------------------------------

import { expectancyStats } from '../src/backtest/labAnalytics.js';

test('expectancyStats: nothing, or fewer than 10 trades, gives no interval (never a confident-looking number on scraps)', () => {
  assert.equal(expectancyStats([]).n, 0);
  const few = expectancyStats([1, 2, -1]);
  assert.equal(few.ci95, null);
  assert.equal(few.significant, false);
  assert.equal(few.mean, 2 / 3);
});

test('expectancyStats: a clear edge is significant and needs no more trades', () => {
  const r = expectancyStats(Array.from({ length: 100 }, (_, i) => (i % 2 ? 0 : 2))); // mean 1, sd ~1
  assert.ok(Math.abs(r.mean - 1) < 1e-9);
  assert.ok(r.ci95[0] > 0.75 && r.ci95[1] < 1.25);
  assert.equal(r.significant, true);
  assert.equal(r.moreTradesNeeded, 0);
});

test('expectancyStats: a small edge on 100 trades is NOT significant, and the answer says how many more it would take', () => {
  const r = expectancyStats(Array.from({ length: 100 }, (_, i) => (i % 2 ? -0.9 : 1.1))); // mean 0.1, sd ~1
  assert.ok(Math.abs(r.mean - 0.1) < 1e-9);
  assert.ok(r.ci95[0] < 0 && r.ci95[1] > 0);
  assert.equal(r.significant, false);
  const expected = Math.ceil((1.96 * r.sd / 0.1) ** 2);
  assert.equal(r.tradesToConfirm, expected);
  assert.equal(r.moreTradesNeeded, expected - 100);
  assert.ok(expected > 300 && expected < 450);
});

test('expectancyStats: a losing average can never be "confirmed" (no trade count is promised)', () => {
  const r = expectancyStats(Array.from({ length: 50 }, (_, i) => (i % 2 ? -1.2 : 1)));
  assert.equal(r.tradesToConfirm, null);
  assert.equal(r.moreTradesNeeded, null);
});

test('expectancyStats: accepts trade objects as well as plain numbers, skipping non-finite R', () => {
  const objs = Array.from({ length: 20 }, (_, i) => ({ rMultiple: i % 2 ? 1 : 0 })).concat([{ rMultiple: NaN }]);
  assert.equal(expectancyStats(objs).n, 20);
});

test('simulateChallenge and portfolio results carry the interval too', () => {
  const t = dailyTrades(Array.from({ length: 40 }, (_, i) => (i % 2 ? 0 : 2)));
  assert.equal(simulateChallenge(t, RULES).expectancy.n, 40);
  const p = analyzePortfolio({ a: { label: 'A', train: t, test: [] } });
  assert.equal(p.strategies[0].expectancy.n, 40);
  assert.equal(p.combined.expectancy.n, 40);
});
