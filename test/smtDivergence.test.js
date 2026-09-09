import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSmtDivergenceEvents, runSmtDivergenceBacktest } from '../src/backtest/smtDivergence.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Flat filler: high=1.2/low=0.9 on every candle disqualifies every index from
// being a swing point by itself (ties never satisfy the strict fractal
// comparison in detectSwingPoints) — only the spikes we inject below register.
function flat(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(c(i * 1000, 1, 1.2, 0.9, 1));
  return arr;
}

test('detectSmtDivergenceEvents: A prints a higher high while B fails to confirm -> bearish divergence', () => {
  const lookback = 2;
  const candlesA = flat(21);
  candlesA[5] = c(5000, 1, 10, 0.95, 1);
  candlesA[15] = c(15000, 1, 12, 0.95, 1); // higher high than 10

  const candlesB = flat(21);
  candlesB[5] = c(5000, 1, 10, 0.95, 1);
  candlesB[15] = c(15000, 1, 9, 0.95, 1); // fails to exceed its own prior high (10)

  const events = detectSmtDivergenceEvents(candlesA, candlesB, { lookback });
  const bearish = events.filter((e) => e.direction === 'bearish');
  assert.equal(bearish.length, 1);
  assert.equal(bearish[0].index, 15);
  assert.equal(bearish[0].extreme, 12);
  assert.equal(bearish[0].eligibleTime, 17000); // max confirm time of A's and B's swings involved
});

test('detectSmtDivergenceEvents: A prints a lower low while B fails to confirm -> bullish divergence', () => {
  const lookback = 2;
  const candlesA = flat(21);
  candlesA[5] = c(5000, 1, 1.0, 0.5, 1);
  candlesA[15] = c(15000, 1, 1.0, 0.3, 1); // lower low than 0.5

  const candlesB = flat(21);
  candlesB[5] = c(5000, 1, 1.0, 0.5, 1);
  candlesB[15] = c(15000, 1, 1.0, 0.6, 1); // fails to go below its own prior low (0.5)

  const events = detectSmtDivergenceEvents(candlesA, candlesB, { lookback });
  const bullish = events.filter((e) => e.direction === 'bullish');
  assert.equal(bullish.length, 1);
  assert.equal(bullish[0].index, 15);
  assert.equal(bullish[0].extreme, 0.3);
});

test('detectSmtDivergenceEvents: no corresponding swing on B in the window -> no claim made', () => {
  const lookback = 2;
  const candlesA = flat(21);
  candlesA[5] = c(5000, 1, 10, 0.95, 1);
  candlesA[15] = c(15000, 1, 12, 0.95, 1);
  const candlesB = flat(21); // B never swings at all

  const events = detectSmtDivergenceEvents(candlesA, candlesB, { lookback });
  assert.equal(events.filter((e) => e.direction === 'bearish').length, 0);
});

test('detectSmtDivergenceEvents: B also extends its prior high -> confirmed, not a divergence', () => {
  const lookback = 2;
  const candlesA = flat(21);
  candlesA[5] = c(5000, 1, 10, 0.95, 1);
  candlesA[15] = c(15000, 1, 12, 0.95, 1);

  const candlesB = flat(21);
  candlesB[5] = c(5000, 1, 10, 0.95, 1);
  candlesB[15] = c(15000, 1, 13, 0.95, 1); // B ALSO makes a higher high -> confirms A, no divergence

  const events = detectSmtDivergenceEvents(candlesA, candlesB, { lookback });
  assert.equal(events.filter((e) => e.direction === 'bearish').length, 0);
});

test('runSmtDivergenceBacktest: arms on divergence, enters on MSS confirmation, stop beyond the swept extreme -> loss', () => {
  const lookback = 2;
  const candlesA = flat(22);
  candlesA[5] = c(5000, 1, 2.0, 0.95, 1); // swing high #1 (A & B agree so far)
  candlesA[9] = c(9000, 1, 1.0, 0.5, 1); // swing low (MSS reference level)
  candlesA[15] = c(15000, 1, 2.5, 0.95, 1); // swing high #2: A extends (2.5 > 2.0) -> divergence candidate
  candlesA[18] = c(18000, 1, 1.0, 0.3, 0.4); // close 0.4 < confirmed low 0.5 -> Market Structure Shift
  candlesA[19] = c(19000, 0.4, 0.45, 0.3, 0.4); // entry candle, open=0.4
  candlesA[20] = c(20000, 0.4, 2.6, 0.3, 1); // high 2.6 >= stop 2.5 -> stop hit

  const candlesB = flat(22);
  candlesB[5] = c(5000, 1, 2.0, 0.95, 1);
  candlesB[15] = c(15000, 1, 1.9, 0.95, 1); // B fails to extend (1.9 < 2.0) -> bearish divergence

  const trades = runSmtDivergenceBacktest(candlesA, candlesB, { lookback });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 19);
  assert.equal(t.entryPrice, 0.4);
  assert.equal(t.stopPrice, 2.5);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.exitPrice, 2.5);
  assert.equal(t.rMultiple, -1);
});

test('runSmtDivergenceBacktest: same setup resolves to a win at the fixed 1:3 target', () => {
  const lookback = 2;
  const candlesA = flat(22);
  candlesA[5] = c(5000, 1, 2.0, 0.95, 1);
  candlesA[9] = c(9000, 1, 1.0, 0.5, 1);
  candlesA[15] = c(15000, 1, 2.5, 0.95, 1);
  candlesA[18] = c(18000, 1, 1.0, 0.3, 0.4);
  candlesA[19] = c(19000, 0.4, 0.45, 0.3, 0.4); // entry open=0.4, stop=2.5, distance=2.1, target=0.4-3*2.1=-5.9
  candlesA[20] = c(20000, 0.4, 0.4, -6, 0.4); // low -6 <= target -5.9 -> target hit, high 0.4 well below stop

  const candlesB = flat(22);
  candlesB[5] = c(5000, 1, 2.0, 0.95, 1);
  candlesB[15] = c(15000, 1, 1.9, 0.95, 1);

  const trades = runSmtDivergenceBacktest(candlesA, candlesB, { lookback });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.outcome, 'win');
  assert.equal(t.exitPrice, -5.9);
  assert.equal(t.rMultiple, 3);
});
