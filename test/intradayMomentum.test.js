import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessions, orbTrade, noiseTrades, lastHalfHourTrade, dailyVol, nyOffsetMs, NOISE_CHECKS, MIN } from '../scripts/lib/intradayMomentum.js';

// Séance synthétique : `closes[k]` = clôture de la minute k (k = minutes depuis 9:30), ouverture = clôture précédente,
// mèches de ±w autour de chaque barre. `day0` = minuit UTC du jour (hiver : 9:30 NY = 14:30 UTC).
function series(daysCloses, { w = 0.1, startUtc = Date.UTC(2024, 0, 8) } = {}) {
  const t = [], o = [], h = [], l = [], c = [];
  daysCloses.forEach((closes, di) => {
    const base = startUtc + di * 86400000 + 14.5 * 3600000; // 9:30 NY en janvier
    let prev = closes[0];
    closes.forEach((cl, k) => {
      const op = k === 0 ? cl : prev;
      t.push(base + k * MIN); o.push(op); h.push(Math.max(op, cl) + w); l.push(Math.min(op, cl) - w); c.push(cl); prev = cl;
    });
  });
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}
const flat = (v, n = 390) => Array.from({ length: n }, () => v);
const noSpread = () => 0;

test('intradayMomentum: New York time follows US daylight saving (9:30 NY = 13:30 UTC in July, 14:30 UTC in January)', () => {
  assert.equal(nyOffsetMs(Date.UTC(2024, 6, 10, 13, 30)), -4 * 3600000);
  assert.equal(nyOffsetMs(Date.UTC(2024, 0, 10, 14, 30)), -5 * 3600000);
  const S = series([flat(100, 10)], { startUtc: Date.UTC(2024, 0, 8) });
  const [d] = buildSessions(S);
  assert.equal(d.k[0], 0);
  assert.equal(d.date, '2024-01-08');
});

test('intradayMomentum: a session without a 9:30 bar is dropped; cl[k] carries the last known close forward', () => {
  const S = series([flat(100, 30)]);
  const cut = { ...S, t: S.t.subarray(1), o: S.o.subarray(1), h: S.h.subarray(1), l: S.l.subarray(1), c: S.c.subarray(1), n: S.n - 1 };
  assert.equal(buildSessions(cut).length, 0);
  const [d] = buildSessions(series([[100, 101, 102]]));
  assert.equal(d.cl[1], 101);
  assert.equal(d.cl[389], 102);
  assert.equal(d.close, 102);
});

test('orbTrade: bullish first 5-min candle -> long at the 9:35 open, stop at the candle low, 10R target reached', () => {
  const closes = [100, 100.5, 101, 101.5, 102]; // 5 premières minutes haussières (plus bas 100 - 0,1)
  for (let k = 5; k < 390; k++) closes.push(102 + (k - 4) * 1); // tendance forte ensuite
  const [d] = buildSessions(series([closes]));
  const tr = orbTrade(d, () => 0.05);
  assert.equal(tr.dir, 'buy');
  assert.ok(Math.abs(tr.fill - (102 + 0.05)) < 1e-9); // ouverture de 9:35 = clôture de 9:34, plus le spread
  assert.ok(Math.abs(tr.stop - 99.9) < 1e-9);
  assert.equal(tr.reason, 'target');
  assert.ok(Math.abs(tr.r - 10) < 1e-9);
});

test('orbTrade: a doji first candle gives no trade; a bearish one sells and is stopped at the candle high (stop first in the same minute)', () => {
  const doji = [100, 101, 99, 100.5, 100];
  assert.equal(orbTrade(buildSessions(series([[...doji, ...flat(100, 385)]]))[0], noSpread), null);
  const bear = [100, 99.5, 99, 98.5, 98, 101]; // 9:35 remonte au-dessus du plus haut de la première bougie
  const tr = orbTrade(buildSessions(series([[...bear, ...flat(101, 384)]]))[0], noSpread);
  assert.equal(tr.dir, 'sell');
  assert.equal(tr.reason, 'stop');
  assert.ok(tr.r <= -1);
});

test('orbTrade: a stop narrower than 3 spreads is skipped (bot viability rule)', () => {
  const tiny = [100, 100.01, 100.02, 100.03, 100.04];
  const [d] = buildSessions(series([[...tiny, ...flat(100.04, 385)]], { w: 0 }));
  assert.equal(orbTrade(d, () => 0.03), null); // exécution 100,07, stop 100 : R = 0,07 < 3 x 0,03
  assert.notEqual(orbTrade(d, () => 0.01), null); // R = 0,05 >= 3 x 0,01 : pris
});

test('noiseTrades: after 14 quiet days, a strong rally breaks the upper boundary at 10:00 -> long entered at the next open, held to the close', () => {
  const quiet = Array.from({ length: 14 }, () => Array.from({ length: 390 }, (_, k) => 100 + 0.05 * Math.sin(k)));
  const rally = Array.from({ length: 390 }, (_, k) => 100 + 0.02 * k); // +7,8 sur la séance, bien au-dessus du bruit
  const days = buildSessions(series([...quiet, rally]));
  const trades = noiseTrades(days, 14, noSpread);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].dir, 'buy');
  assert.equal(trades[0].reason, 'close');
  assert.equal(trades[0].entryTime, days[14].t[30]); // décision sur la barre 9:59 (k = 29), exécution à 10:00 (k = 30)
  assert.ok(trades[0].ret > 0);
  assert.deepEqual(NOISE_CHECKS.slice(0, 2), [29, 59]);
  assert.equal(noiseTrades(days, 13, noSpread).length, 0); // moins de 14 séances avant : pas de trade
});

test('noiseTrades: the upper boundary starts from max(open, previous close) - a gap down does not create a long', () => {
  const quiet = Array.from({ length: 14 }, () => Array.from({ length: 390 }, (_, k) => 110 + 0.05 * Math.sin(k)));
  const gapDownDrift = Array.from({ length: 390 }, (_, k) => 100 + 0.005 * k); // ouvre à 100 après une clôture à ~110, remonte un peu
  const days = buildSessions(series([...quiet, gapDownDrift]));
  assert.ok(noiseTrades(days, 14, noSpread).every((t) => t.dir !== 'buy'));
});

test('lastHalfHourTrade: first half-hour up -> long from the 15:30 open to the close; no 15:30 bar -> no trade', () => {
  const up = Array.from({ length: 390 }, (_, k) => (k < 30 ? 100 + k * 0.1 : k < 360 ? 103 : 103 + (k - 359) * 0.01));
  const [d] = buildSessions(series([up]));
  const tr = lastHalfHourTrade(d, 100, noSpread);
  assert.equal(tr.dir, 'buy');
  assert.equal(tr.entryTime, d.t[360]);
  assert.ok(tr.ret > 0);
  const [half] = buildSessions(series([up.slice(0, 210)])); // demi-journée (fin à 13:00)
  assert.equal(lastHalfHourTrade(half, 100, noSpread), null);
});

test('dailyVol: standard deviation of the previous 14 close-to-close returns, null without enough history', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ close: 100 * (1 + (i % 2 ? 0.01 : -0.01)) }));
  assert.equal(dailyVol(days, 10), null);
  assert.ok(dailyVol(days, 18) > 0.015);
});
