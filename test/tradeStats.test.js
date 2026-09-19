import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, streaks, equityCurve, rolling, histogram, buildDimensions, groupStats, crossTab, monthlyTable, splitAt } from '../src/shared/tradeStats.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MON = Date.UTC(2020, 0, 6); // Monday, winter (engine hour == New York hour)

// One trade `i` days after MON at `hour`, worth `r`.
const tr = (i, hour, r, extra = {}) => ({
  entryTime: MON + i * DAY + hour * HOUR, exitTime: MON + i * DAY + (hour + 1) * HOUR, r,
  direction: 'bullish', outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'timeout', distance: 10, entryPrice: 1000, holdCandles: 4, ...extra,
});

test('summarize: nothing to summarise is null, not a page of NaN', () => {
  assert.equal(summarize([]), null);
});

test('summarize: the basic pack is right on a hand-checkable list', () => {
  // +3, -1, -1, +3, -1  -> 5 trades, 2 wins, total +3, avg win 3, avg loss -1
  const t = [tr(0, 9, 3), tr(1, 9, -1), tr(2, 9, -1), tr(3, 9, 3), tr(4, 9, -1)];
  const s = summarize(t);
  assert.equal(s.n, 5);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 3);
  assert.equal(s.totalR, 3);
  assert.equal(s.winRate, 0.4);
  assert.equal(s.avgWinR, 3);
  assert.equal(s.avgLossR, -1);
  assert.equal(s.payoff, 3);
  assert.equal(s.profitFactor, 2); // 6 won / 3 lost
  assert.equal(s.medianR, -1);
  assert.equal(s.bestR, 3);
  assert.equal(s.worstR, -1);
  assert.ok(Math.abs(s.kelly - (0.4 - 0.6 / 3)) < 1e-12); // 0.2
  assert.ok(Math.abs(s.probLossStreak[3] - 0.216) < 1e-12);
  assert.equal(s.avgHoldHours, 1); // 4 M15 candles
  assert.equal(s.expectancy.ci95, null); // 5 trades: no interval
});

test('streaks: longest runs and their distribution; a break-even trade ends a run', () => {
  const rs = [1, 1, 1, -1, -1, 0, -1, 1, -1, -1, -1, -1];
  const t = rs.map((r, i) => tr(i, 9, r));
  const s = streaks(t);
  assert.equal(s.longestWin, 3);
  assert.equal(s.longestLoss, 4);
  assert.deepEqual(s.lossRuns, [{ length: 1, count: 1 }, { length: 2, count: 1 }, { length: 4, count: 1 }]);
});

test('equityCurve and drawdown: peak-to-trough in R, and the time spent underwater', () => {
  const t = [1, 1, -1, -1, -1, 1, 2].map((r, i) => tr(i, 9, r));
  const curve = equityCurve(t);
  assert.deepEqual(curve.map((p) => p.cumulativeR), [1, 2, 1, 0, -1, 0, 2]);
  assert.equal(Math.max(...curve.map((p) => p.drawdownR)), 3); // 2 -> -1
  const s = summarize(t);
  assert.equal(s.maxDrawdownR, 3);
  assert.equal(s.longestUnderwaterTrades, 4); // trades 3 to 6 sit below the peak of trade 2; trade 7 makes a new high
  assert.equal(s.currentDrawdownR, 0);
});

test('rolling: average of the last N trades, starting once N exist', () => {
  const r = rolling([1, 1, 1, -1, -1].map((x, i) => tr(i, 9, x)), 3);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((p) => Math.round(p.expectancy * 1000) / 1000), [1, 0.333, -0.333]);
});

test('histogram: results land in fixed-width bins', () => {
  const h = histogram([-1, -1, 0.2, 2.9, 3].map((x, i) => tr(i, 9, x)), 1);
  assert.deepEqual(h.map((b) => [b.from, b.count]), [[-1, 2], [0, 1], [2, 1], [3, 1]]);
});

test('dimensions: weekday, sense, year and the New York hour (DST-aware)', () => {
  const winter = tr(0, 10, 1, { direction: 'bearish' }); // Monday 10h engine = 10h New York in January
  const summer = { ...tr(0, 10, 1), entryTime: Date.UTC(2020, 6, 6, 10) }; // July: engine 10h = 15 UTC = 11h EDT
  const d = buildDimensions([winter, summer]);
  assert.equal(d.weekday.key(winter), 'Lundi');
  assert.equal(d.direction.key(winter), 'Vente');
  assert.equal(d.year.key(winter), 2020);
  assert.equal(d.hour.key(winter), '10h');
  assert.equal(d.hour.key(summer), '11h');
  assert.equal(d.month.key(summer), 'Juillet');
});

test('dimensions: "previous trade" and "rank in the day" depend on the sequence, not on the trade alone', () => {
  const t = [tr(0, 9, 1), tr(0, 10, -1), tr(0, 11, 1), tr(1, 9, 1)];
  const d = buildDimensions(t);
  assert.deepEqual(t.map((x) => d.previous.key(x)), ['Premier trade', 'Après un gain', 'Après une perte', 'Après un gain']);
  assert.deepEqual(t.map((x) => d.rank.key(x)), ['1er trade du jour', '2e trade du jour', '3e trade du jour ou plus', '1er trade du jour']);
});

test('dimensions: stop size is a tercile of the stop as a share of price', () => {
  const t = [1, 2, 3, 4, 5, 6].map((d, i) => tr(i, 9, 1, { distance: d * 10, entryPrice: 1000 }));
  const dim = buildDimensions(t).stop;
  const labels = t.map((x) => dim.key(x));
  assert.equal(labels.filter((l) => l === 'Stop serré').length, 2);
  assert.equal(labels.filter((l) => l === 'Stop large').length, 2);
  assert.equal(dim.key(t[0]), 'Stop serré');
  assert.equal(dim.key(t[5]), 'Stop large');
});

test('groupStats: one row per value, in the dimension\'s natural order, with count, hit rate, average and total', () => {
  const t = [tr(0, 9, 2), tr(0, 10, -1), tr(1, 9, 1), tr(4, 9, -1)]; // Mon, Mon, Tue, Fri
  const rows = groupStats(t, buildDimensions(t).weekday);
  assert.deepEqual(rows.map((r) => r.key), ['Lundi', 'Mardi', 'Vendredi']);
  assert.equal(rows[0].n, 2);
  assert.equal(rows[0].totalR, 1);
  assert.equal(rows[0].expectancy, 0.5);
  assert.equal(rows[0].winRate, 0.5);
  assert.equal(rows[1].winRate, 1);
});

test('crossTab: two dimensions crossed, empty combinations simply absent', () => {
  const t = [tr(0, 9, 2), tr(0, 10, -1, { direction: 'bearish' }), tr(1, 9, 1, { direction: 'bearish' })];
  const dims = buildDimensions(t);
  const x = crossTab(t, dims.weekday, dims.direction);
  assert.deepEqual(x.rows, ['Lundi', 'Mardi']);
  assert.deepEqual(x.cols, ['Achat', 'Vente']);
  assert.equal(x.cells.Lundi.Achat.totalR, 2);
  assert.equal(x.cells.Lundi.Vente.totalR, -1);
  assert.equal(x.cells.Mardi.Achat, undefined);
});

test('monthlyTable: total R per calendar month of the exit, per year', () => {
  const t = [tr(0, 9, 1), tr(1, 9, 2), { ...tr(0, 9, -1), exitTime: Date.UTC(2021, 2, 5) }];
  const m = monthlyTable(t);
  assert.deepEqual(m.years.map((y) => y.year), [2020, 2021]);
  assert.equal(m.years[0].months[0], 3);
  assert.equal(m.years[0].months[1], null);
  assert.equal(m.years[1].months[2], -1);
  assert.equal(m.years[0].total, 3);
});

test('splitAt: before the cutoff is training, from it on is test', () => {
  const t = [tr(0, 9, 1), tr(10, 9, 1)];
  const { train, test } = splitAt(t, MON + 5 * DAY);
  assert.equal(train.length, 1);
  assert.equal(test.length, 1);
});
