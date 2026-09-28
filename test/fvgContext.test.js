import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, findFvgs, qualifyingFvg, featuresAt, atrH1At } from '../scripts/lib/fvgContext.js';

const MIN = 60000, OFF = 5 * 3600000;
/** Série M1 (temps moteur) à partir de bougies M15 [o, h, l, c] : la 1re minute porte o/h/l/c, les 14 autres restent à c. */
function fromM15(startIso, bars) {
  const rows = []; for (const [o, h, l, c] of bars) { rows.push([o, h, l, c]); for (let k = 1; k < 15; k++) rows.push([c, c, c, c]); }
  const t0 = Date.parse(startIso) - OFF, f = (k) => Float64Array.from(rows, (r) => r[k]);
  return { t: Float64Array.from(rows, (_, i) => t0 + i * MIN), o: f(0), h: f(1), l: f(2), c: f(3), n: rows.length };
}
const flat = (n, p = 100) => Array.from({ length: n }, () => [p, p + 0.5, p - 0.5, p]);

test('fvgContext.findFvgs: bullish and bearish gaps, first touch and death on a close beyond the far edge', () => {
  const bars = [{ h: 100.5, l: 99.5, c: 100 }, { h: 104, l: 100, c: 104 }, { h: 105, l: 101.5, c: 105 }, { h: 106, l: 102, c: 103 }, { h: 103, l: 100.2, c: 100.3 },
    { h: 100.4, l: 97, c: 97 }, { h: 97.5, l: 96, c: 96.5 }, { h: 96.8, l: 94, c: 95 }];
  const z = findFvgs(bars);
  const bull = z.find((x) => x.dir === 1 && x.k === 2);
  assert.deepEqual([bull.bot, bull.top], [100.5, 101.5]);
  assert.equal(bull.touch, 4); // bas 100,2 <= haut de la zone
  assert.equal(bull.dead, 4); // clôture 100,3 < 100,5
  const bear = z.find((x) => x.dir === -1 && x.k === 7); // haut(c) 96,8 < bas(a) 97 -> zone [96,8 ; 97]
  assert.deepEqual([bear.bot, bear.top], [96.8, 97]);
});

test('fvgContext.qualifyingFvg: the most recent live FVG of the side, price inside or at most 0.5 ATR H1 beyond, 24 bars max', () => {
  // 64 bougies plates (ATR H1 = 1), puis impulsion haussière avec FVG [100,5 ; 101,5], départ, et retour juste au-dessus de la zone
  const bars = [...flat(64), [100, 104, 100, 104], [104, 105, 101.5, 105], [105, 107, 104.5, 106], [106, 106.5, 104, 104.2], [104.2, 104.3, 102, 102.1], [102.1, 102.2, 101.7, 101.8]];
  const X = buildContext(fromM15('2024-01-08T08:00:00Z', bars));
  const j = X.b15.length - 1, k = 65;
  const q = qualifyingFvg(X, j, 1, X.b15[j].c);
  assert.ok(q); assert.equal(q.k, k); assert.equal(q.age, j - k); assert.equal(q.where, 'beyond');
  assert.equal(qualifyingFvg(X, j, 1, 101).where, 'in');
  const atr = atrH1At(X, X.b15[j].i1 + 1); // l'impulsion gonfle l'ATR H1 (~1,7)
  assert.equal(qualifyingFvg(X, j, 1, 101.5 + 0.5 * atr - 0.01).where, 'beyond');
  assert.equal(qualifyingFvg(X, j, 1, 101.5 + 0.5 * atr + 0.01), null); // plus de 0,5 ATR H1 au-dessus
  const bear = qualifyingFvg(X, j, -1, X.b15[j].c); // la chute 104,2 -> 101,8 laisse un FVG baissier [102,2 ; 104] tout juste formé
  assert.equal(bear.k, j); assert.equal(bear.age, 0); assert.equal(bear.where, 'beyond');
  const f = featuresAt(X, j, 1, q);
  assert.equal(f.age, j - k); assert.equal(f.inZone, 0); assert.equal(f.long, 1);
  assert.ok(Math.abs(f.size - 1 / atr) < 1e-9); // zone de 1 point
  assert.ok(Math.abs(f.farZones - 5.5) < 1e-9); // plus haut 107 = 5,5 hauteurs de zone au-dessus de 101,5
});
