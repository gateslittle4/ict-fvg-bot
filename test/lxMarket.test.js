import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeMarket } from '../scripts/lib/lxMarket.js';

const MIN = 60000;
// Série M1 synthétique : 3 barres M15 (45 minutes), prix constants par barre. Barre 0 = pose, barres 1-2 = suite, puis 40 minutes de sortie.
function make(bars) {
  const t = [], o = [], h = [], l = [], c = [], b15 = [];
  let m = 0;
  for (const [op, hi, lo, cl] of bars) {
    const i0 = m;
    for (let x = 0; x < 15; x++, m++) { t.push(m * MIN); o.push(x === 0 ? op : cl); h.push(x === 7 ? hi : Math.max(op, cl)); l.push(x === 7 ? lo : Math.min(op, cl)); c.push(cl); }
    b15.push({ i0, i1: m - 1, o: op, h: Math.max(hi, op, cl), l: Math.min(lo, op, cl), c: cl });
  }
  return { S: { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length }, b15 };
}
const sig = (X, extra = {}) => ({ tau: X.S.t[X.b15[0].i1] + MIN, dir: 1, i: X.b15[0].i1 + 1, plan: [{ entry: 100, stop: 95 }], target: 130, expiry: 1e12, exitAt: 1e12, f: {}, ...extra });

test('executeMarket: achat sur rejet (touche 100, clôture au-dessus) -> entrée à l\'ouverture suivante, sortie à l\'objectif', () => {
  const { S, b15 } = make([[105, 106, 104, 105], [104, 105, 99, 101], [101, 131, 100, 130], [130, 131, 129, 130]]);
  const X = { S, b15 };
  const tr = executeMarket(X, [sig(X)]);
  assert.equal(tr.length, 1);
  assert.equal(tr[0].fill, 101); // ouverture de la barre 2 (le rejet est la barre 1)
  assert.equal(tr[0].reason, 'target');
});

test('executeMarket: la bougie touche 100 mais clôture dedans -> attend, pas d\'entrée sur cette bougie', () => {
  const { S, b15 } = make([[105, 106, 104, 105], [104, 105, 99, 99.5], [99.5, 100, 99, 99.8], [99.8, 100, 99, 99.9]]);
  const X = { S, b15 };
  assert.equal(executeMarket(X, [sig(X)]).length, 0);
});

test('executeMarket: clôture sous le stop avant tout rejet -> setup annulé', () => {
  const { S, b15 } = make([[105, 106, 104, 105], [104, 105, 94, 94.5], [94.5, 101, 94, 101], [101, 131, 100, 130]]);
  const X = { S, b15 };
  assert.equal(executeMarket(X, [sig(X)]).length, 0);
});

test('executeMarket: ratio réel sous 3R -> pas de trade', () => {
  const { S, b15 } = make([[105, 106, 104, 105], [104, 105, 99, 101], [101, 131, 100, 130], [130, 131, 129, 130]]);
  const X = { S, b15 };
  assert.equal(executeMarket(X, [sig(X, { target: 110 })]).length, 0);
});

test('executeMarket: shift décale le début de la recherche (le rejet de la barre 1 est manqué)', () => {
  const { S, b15 } = make([[105, 106, 104, 105], [104, 105, 99, 101], [101, 131, 100, 130], [130, 131, 129, 130]]);
  const X = { S, b15 };
  assert.equal(executeMarket(X, [sig(X)], { shift: () => 1 }).length, 0);
});
