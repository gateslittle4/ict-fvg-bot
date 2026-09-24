import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupNyDays, sweepFvgTrade } from '../scripts/lib/nyOpenSweepFvg.js';

// Journée synthétique (hiver : minute locale NY m -> UTC = jour + 5 h + m). `bars` = [[minuteLocale, o, h, l, c], ...]
function series(dayUtc, bars) {
  const t = [], o = [], h = [], l = [], c = [];
  for (const [m, ...ohlc] of bars) { t.push(dayUtc + 5 * 3600000 + m * 60000); o.push(ohlc[0]); h.push(ohlc[1]); l.push(ohlc[2]); c.push(ohlc[3]); }
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}
const HM = (h, m = 0) => h * 60 + m;
const flat = (from, to, p, w = 1) => Array.from({ length: to - from }, (_, i) => [from + i, p, p + w, p - w, p]);

// Reproduit le 24/09 : Londres bas 100, pré-ouverture bas 95 à 5:30 (sweep), plancher tenu, bougie de 9:30 qui casse le haut de pré-ouverture,
// FVG 9:15/9:45, retour dans le FVG à 10:45, puis montée jusqu'au haut de Londres (cible).
function dayBars({ lateLow = false, retrace = true } = {}) {
  return [
    ...flat(HM(2), HM(5), 110, 1), [HM(3), 110, 130, 109, 110], [HM(4, 45), 110, 111, 100, 105], // Londres : haut 130, bas 100
    [HM(5, 30), 104, 105, 95, 100], ...flat(HM(5, 31), HM(8), 104, 1),
    ...flat(HM(8), HM(9, 15), lateLow ? 101 : 106, 1), ...(lateLow ? [[HM(8, 30), 101, 102, 90, 101]] : []),
    ...flat(HM(9, 15), HM(9, 30), 107, 1), // A : haut 108
    [HM(9, 30), 107, 109, 105, 108], ...Array.from({ length: 14 }, (_, i) => [HM(9, 31) + i, 108 + i, 110 + i, 107 + i, 109 + i]), // B : bas 105, clôture 122 > 108
    ...flat(HM(9, 45), HM(10), 118, 1), // C : bas 117 -> FVG [108, 117]
    ...flat(HM(10), HM(10, 45), 121, 1), [HM(10, 45), 120, 120, 116, 118], ...(retrace ? [] : []),
    ...flat(HM(10, 46), HM(12), 119, 1), [HM(12, 15), 119, 131, 118, 130], ...flat(HM(12, 16), HM(16), 128, 1),
  ].sort((a, b) => a[0] - b[0]);
}
const prevDay = [...flat(HM(9, 30), HM(16), 150, 2), ...flat(HM(20), HM(24), 140, 2)]; // veille : séance NY haut 152, Asie haut 142

function run(opts, spread = 0.1) {
  const d0 = Date.UTC(2024, 0, 9), d1 = Date.UTC(2024, 0, 10);
  const prev = series(d0, prevDay), cur = series(d1, dayBars(opts));
  const all = { t: Float64Array.from([...prev.t, ...cur.t]), o: Float64Array.from([...prev.o, ...cur.o]), h: Float64Array.from([...prev.h, ...cur.h]), l: Float64Array.from([...prev.l, ...cur.l]), c: Float64Array.from([...prev.c, ...cur.c]), n: prev.n + cur.n };
  const days = groupNyDays(all);
  const keys = [...days.keys()].sort((a, b) => a - b);
  return sweepFvgTrade(days.get(keys[1]), days.get(keys[0]), () => spread);
}

test('sweepFvgTrade: the 24/09 scenario - long LIMIT at the FVG top, stop at the 9:30 low, nearest liquidity >= 2R as target, filled on the retrace and won', () => {
  const tr = run({});
  assert.equal(tr.long, true);
  assert.equal(tr.entry, 117); // bas de la bougie de 9:45
  assert.equal(tr.stop, 105); // bas de la bougie de 9:30
  assert.equal(tr.target, 142); // plus proche à >= 2R (24) : Londres 130 (1,1R) trop près, Asie 142 (2,1R)
  assert.equal(tr.filled, true);
  assert.equal(tr.reason, 'close'); // 142 jamais atteint (max 131) : sortie à 15:59
  assert.ok(tr.r > 0);
});

test('sweepFvgTrade: a new low after 8:00 (floor not held) cancels the setup; a stop narrower than 3 spreads too', () => {
  assert.equal(run({ lateLow: true }), null);
  assert.equal(run({}, 5), null); // R = 12 < 3 x 5
});
