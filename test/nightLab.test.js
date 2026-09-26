import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PHASES, assertPhaseAllowed, sliceSeries, loadPhase, nyMin, dayKey, dayOfWeek, makeBars, m15Key, h4Key, atrSeries, lastDoneBar, simulate, stats, exploreVerdict } from '../scripts/lib/nightLab.js';

const MIN = 60000, OFF = 5 * 3600000;
/** Série M1 (temps moteur) à partir de bougies [o, h, l, c] minute par minute. */
function series(fromIso, rows) {
  const t0 = Date.parse(fromIso) - OFF;
  const f = (k) => Float64Array.from(rows, (r) => r[k]);
  return { t: Float64Array.from(rows, (_, i) => t0 + i * MIN), o: f(0), h: f(1), l: f(2), c: f(3), n: rows.length };
}

test('nightLab: hidden periods need an explicit NIGHT_PHASE, exploration never does', () => {
  assert.doesNotThrow(() => assertPhaseAllowed('explore', {}));
  assert.throws(() => assertPhaseAllowed('validation', {}), /NIGHT_PHASE=validation/);
  assert.throws(() => assertPhaseAllowed('final', { NIGHT_PHASE: 'validation' }), /NIGHT_PHASE=final/);
  assert.doesNotThrow(() => assertPhaseAllowed('final', { NIGHT_PHASE: 'final' }));
  assert.ok(PHASES.explore.to <= Date.UTC(2019, 0, 1) - OFF);
});

test('nightLab: exploration data physically stops before 2019', { skip: !fs.existsSync('data/histdata-m1/US500.csv.gz') }, () => {
  const S = loadPhase('US500', 'explore', {});
  assert.ok(S.n > 1e6);
  assert.ok(S.t[S.n - 1] < Date.UTC(2019, 0, 1) - OFF);
});

test('nightLab: sliceSeries keeps [from, to)', () => {
  const S = series('2024-01-10T15:00:00Z', [[1, 1, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4, 4]]);
  const s = sliceSeries(S, S.t[1], S.t[3]);
  assert.equal(s.n, 2); assert.equal(s.o[0], 2); assert.equal(s.o[1], 3);
  assert.equal(sliceSeries(S, S.t[2], Infinity).n, 2);
});

test('nightLab: New York clock, trading day (18:00 roll) and weekday, winter and summer', () => {
  assert.equal(nyMin(Date.parse('2024-01-10T15:00:00Z') - OFF), 10 * 60); // 10:00 EST
  assert.equal(nyMin(Date.parse('2024-07-10T14:00:00Z') - OFF), 10 * 60); // 10:00 EDT
  const sun19 = Date.parse('2024-07-07T23:00:00Z') - OFF, mon10 = Date.parse('2024-07-08T14:00:00Z') - OFF, mon1759 = Date.parse('2024-07-08T21:59:00Z') - OFF;
  assert.equal(dayKey(sun19), dayKey(mon10)); // dimanche 19 h NY = début de la journée du lundi
  assert.equal(dayKey(mon1759), dayKey(mon10));
  assert.equal(dayOfWeek(sun19), 1); assert.equal(dayOfWeek(mon10), 1);
  assert.equal(dayKey(Date.parse('2024-07-08T22:00:00Z') - OFF), dayKey(mon10) + 1); // 18 h NY : journée suivante
});

test('nightLab: H4 bars start at 17:00 / 21:00 / 01:00 / 05:00 / 09:00 / 13:00 New York', () => {
  const k = (iso) => h4Key(Date.parse(iso) - OFF);
  assert.equal(k('2024-07-10T12:59:00Z'), k('2024-07-10T09:00:00Z')); // 08:59 et 05:00 EDT : même H4
  assert.equal(k('2024-07-10T13:00:00Z'), k('2024-07-10T12:59:00Z') + 1); // 09:00 EDT : nouvelle H4
  assert.equal(k('2024-01-10T14:00:00Z'), k('2024-01-10T13:59:00Z') + 1); // 09:00 EST
});

test('nightLab: bars, simple ATR and the last finished bar', () => {
  const rows = []; for (let i = 0; i < 60; i++) rows.push([100, 101, 99, 100]);
  const S = series('2024-01-10T15:00:00Z', rows);
  const b = makeBars(S, m15Key);
  assert.equal(b.length, 4); assert.equal(b[1].i0, 15); assert.equal(b[1].i1, 29); assert.equal(b[1].h, 101); assert.equal(b[1].l, 99);
  const atr = atrSeries(b, 2);
  assert.equal(atr[1], null); assert.equal(atr[2], 2); assert.equal(atr[3], 2);
  assert.equal(lastDoneBar(b, 30), 1); assert.equal(lastDoneBar(b, 29), 0); assert.equal(lastDoneBar(b, 5), -1);
});

test('nightLab.simulate: market buy pays the spread and reaches a 2R target', () => {
  const S = series('2024-01-10T15:00:00Z', [[100, 100, 100, 100], [100, 100.5, 99.8, 100.2], [100.2, 104.5, 100.1, 104], [104, 104, 104, 104]]);
  const r = simulate(S, { dir: 1, i: 1, stop: 98.5, rr: 2, spread: 0.5 });
  assert.equal(r.fill, 100.5); assert.equal(r.risk, 2); assert.equal(r.reason, 'target'); assert.equal(r.exit, 104.5); assert.equal(r.r, 2);
});

test('nightLab.simulate: stop first in the same minute, gap through the stop exits at the open', () => {
  const S = series('2024-01-10T15:00:00Z', [[100, 100, 100, 100], [100, 110, 90, 100]]);
  assert.equal(simulate(S, { dir: 1, i: 1, stop: 95, rr: 1 }).reason, 'stop');
  const G = series('2024-01-10T15:00:00Z', [[100, 100, 100, 100], [100, 100.4, 99.9, 100], [96, 96.2, 95.5, 96]]);
  const g = simulate(G, { dir: 1, i: 1, stop: 98, rr: 3 });
  assert.equal(g.reason, 'stop'); assert.equal(g.exit, 96); assert.equal(g.r, -2);
});

test('nightLab.simulate: sell limit fills at its level, pays the spread on exit, and a fill beyond the stop is no trade', () => {
  const S = series('2024-01-10T15:00:00Z', [[100, 100.2, 99.8, 100], [100, 102.1, 100, 102], [102, 102, 98.9, 99], [99, 99, 95, 95]]);
  const r = simulate(S, { dir: -1, i: 1, entry: { type: 'limit', price: 102 }, stop: 103, rr: 3, spread: 0.1 });
  assert.equal(r.fill, 102); assert.equal(r.reason, 'target'); assert.ok(Math.abs(r.exit - 99) < 1e-9); assert.ok(Math.abs(r.r - 3) < 1e-9);
  const X = simulate(S, { dir: -1, i: 1, entry: { type: 'limit', price: 101 }, stop: 100.5, rr: 3 });
  assert.equal(X.missed, 'stop-crossed');
  assert.equal(simulate(S, { dir: -1, i: 1, entry: { type: 'limit', price: 110 }, stop: 111, rr: 3, expiry: S.t[3] }).missed, 'expired');
  // remplissage prudent : le haut 102,1 ne dépasse 102 que de 0,1 -> pas rempli avec through 0,25 à cette minute
  const th = simulate(S, { dir: -1, i: 1, entry: { type: 'limit', price: 102, through: 0.25 }, stop: 103, rr: 3, expiry: S.t[3] });
  assert.equal(th.missed, 'expired');
});

test('nightLab.simulate: a limit order is cancelled if the target trades first; stop entry fills at its level; time exit', () => {
  const S = series('2024-01-10T15:00:00Z', [[100, 100, 100, 100], [100, 106, 100, 106], [106, 106, 97, 98], [98, 98.5, 97.5, 98]]);
  assert.equal(simulate(S, { dir: 1, i: 1, entry: { type: 'limit', price: 98 }, stop: 96, target: 105, cancelIfTarget: true }).missed, 'target-first');
  const st = simulate(S, { dir: 1, i: 1, entry: { type: 'stop', price: 103 }, stop: 101, target: 120 });
  assert.equal(st.fill, 103); assert.equal(st.reason, 'stop');
  const T = simulate(S, { dir: 1, i: 0, stop: 90, rr: 5, exitAt: S.t[3] });
  assert.equal(T.reason, 'time'); assert.equal(T.exit, 98); assert.equal(T.r, -0.2);
});

test('nightLab: stats and the exploration verdict (>= 60 trades, t >= 2, both halves positive)', () => {
  const s = stats([{ r: 1 }, { r: -1 }, { r: 3 }]);
  assert.equal(s.n, 3); assert.equal(s.sum, 3); assert.equal(s.mean, 1); assert.equal(s.pf, 4); assert.equal(s.maxDD, 1);
  const halves = [[0, 100], [100, 200]];
  const good = Array.from({ length: 80 }, (_, k) => ({ r: k % 2 ? 2 : -1, entryTime: k * 2.5 }));
  assert.equal(exploreVerdict(good, halves).retained, true);
  const oneHalf = good.map((x) => ({ ...x, r: x.entryTime < 100 ? x.r : -Math.abs(x.r) * 0.1 }));
  assert.equal(exploreVerdict(oneHalf, halves).retained, false);
  assert.equal(exploreVerdict(good.slice(0, 50), halves).retained, false);
});

test('nightLab.simulate: break-even after +1R moves the stop to the entry from the next minute', () => {
  const S = series('2024-01-10T15:00:00Z', [[100, 100, 100, 100], [100, 101.2, 100, 101], [101, 101, 99.8, 99.9], [99.9, 99.9, 97, 97]]);
  const r = simulate(S, { dir: 1, i: 1, stop: 99, rr: 3, beAt: 1 });
  assert.equal(r.reason, 'breakeven'); assert.equal(r.exit, 100); assert.equal(r.r, 0);
  assert.equal(simulate(S, { dir: 1, i: 1, stop: 99, rr: 3 }).reason, 'stop');
});
