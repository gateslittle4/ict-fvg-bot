import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../scripts/lib/fvgContext.js';
import { dipTrades, cashSessions, gapTrades, weekdayTrades } from '../scripts/lib/dipRule.js';
import { nyMin } from '../scripts/lib/nightLab.js';

const MIN = 60000, OFF = 5 * 3600000;
/** Série M1 minute par minute à partir de prix (o = c de la minute précédente), mèches optionnelles. */
function series(startIso, prices, wick = () => 0) {
  const t0 = Date.parse(startIso) - OFF, n = prices.length;
  const S = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), n };
  for (let i = 0; i < n; i++) { const o = i ? prices[i - 1] : prices[0], c = prices[i]; S.t[i] = t0 + i * MIN; S.o[i] = o; S.c[i] = c; S.h[i] = Math.max(o, c) + wick(i); S.l[i] = Math.min(o, c) - wick(i); }
  return S;
}

test('dipRule.dipTrades: a buy limit d ATR under the M15 close, valid 15 minutes, stop 1 ATR, target in R', () => {
  // 18 h de préchauffage en dents de scie (ATR H1 ~ 1), puis à 03:00 NY la clôture M15 vaut 100 ; à 03:05 le prix plonge à 99,4 puis
  // remonte à 102 : la limite à 0,5 ATR (≈ 99,5) est remplie, objectif 1R atteint.
  const pre = Array.from({ length: 18 * 60 }, (_, k) => 100 + (k % 60 < 30 ? (k % 30) / 30 : 1 - (k % 30) / 30) * 0.9);
  const start = '2024-01-09T14:00:00Z'; // 09:00 EST la veille
  const tail = [100, 100, 100, 100, 100, 99.8, 99.4, 99.6, 100, 100.5, 101, 101.5, 102, 102.5, 103, 103, 103];
  const S = series(start, [...pre.slice(0, pre.length - (pre.length % 15)), ...tail]);
  const X = buildContext(S);
  const tr = dipTrades(X, { dirs: [1], d: 0.5, fromMin: 180, toMin: 660, exitMin: 660, rr: 1, spreadAt: () => 0 });
  const t = tr.find((x) => nyMin(x.entryTime) >= 180 && nyMin(x.entryTime) < 200);
  assert.ok(t, 'un achat au creux');
  assert.equal(t.dir, 1); assert.equal(t.reason, 'target'); assert.ok(Math.abs(t.r - 1) < 1e-9);
  const m = dipTrades(X, { dirs: [1], d: 0.5, fromMin: 180, toMin: 660, exitMin: 660, rr: 1, spreadAt: () => 0, exec: 'market' }).find((x) => nyMin(x.entryTime) >= 180 && nyMin(x.entryTime) < 200);
  assert.equal(m.entryTime, t.entryTime + MIN); // au marché à la minute qui suit le toucher
});

test('dipRule: 9:30 gap fade targets the previous 16:00 close; weekday trade exits at 16:00', () => {
  // veille : 16:00 à 100 ; ouverture 9:30 à 97 (écart -3 ATR environ) puis remontée à 100,5 à 10:00
  const t0 = '2024-01-09T14:00:00Z'; // 09:00 EST mardi
  const day1 = Array.from({ length: 7 * 60 }, (_, k) => 100 + Math.sin(k / 7) * 0.6); // 09:00 -> 16:00
  const night = Array.from({ length: 17 * 60 + 30 }, () => 99.9); // 16:00 -> 09:30 le lendemain
  const open = [97, 97.5, 98, 98.5, 99, 99.5, 100, 100.5, ...Array.from({ length: 400 }, () => 100.5)];
  const prices = [...day1, ...night, ...open];
  const S = series(t0, prices, (i) => (i < day1.length ? 0.4 : 0.05));
  S.c[day1.length - 1] = 100; S.o[day1.length] = 100;
  const X = buildContext(S), sess = cashSessions(S);
  const g = gapTrades(X, sess, { g: 0.5, exitMin: 660, spreadAt: () => 0 });
  assert.equal(g.length, 1); assert.equal(g[0].dir, 1); assert.equal(g[0].reason, 'target'); assert.ok(Math.abs(g[0].exit - S.c[sess.get([...sess.keys()].sort()[0]).close1600]) < 1e-9);
  const w = weekdayTrades(X, sess, { dow: 3, dir: 1, spreadAt: () => 0 });
  assert.equal(w.length, 1); assert.equal(nyMin(w[0].exitTime), 960);
});
