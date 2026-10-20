import test from 'node:test';
import assert from 'node:assert/strict';
import { h4Events, decide, VARIANTS } from './comboH.mjs';
const bar = (i, h, l) => ({ t: i * 900 + 5 * 3600, o: (h + l) / 2, h, l, c: (h + l) / 2 });
const flat = (n) => Array.from({ length: n }, (_, i) => bar(i, 101, 99)); // 16 bougies M15 = 1 barre H4
test('balayage du low de la plage H4 -> état +1 ; toucher le high -> -1 ; ambiguë -> inchangé', () => {
  const c = flat(16 * 8); let i = c.length;
  c.push(bar(i++, 100, 98));  const low = i - 1;     // low < 99 : balayage du bas
  c.push(bar(i++, 100, 99.5)); const calm = i - 1;
  c.push(bar(i++, 101.5, 99.5)); const high = i - 1; // high > 101 : balayage du haut
  c.push(bar(i++, 102, 97));  const both = i - 1;    // les deux : ignorée
  const { state, last } = h4Events(c, 6);
  assert.equal(state[low], 1); assert.equal(last[low], low); assert.equal(state[calm], 1); assert.equal(last[calm], low);
  assert.equal(state[high], -1); assert.equal(last[high], high); assert.equal(state[both], -1); assert.equal(last[both], high);
});
test('FVG H4 haussier non rempli touché par le dessus -> +1', () => {
  // 3 barres H4 : a (haut 100), b (milieu), c (bas 105) => FVG haussier [100,105]
  const c = []; let i = 0;
  const H4 = (h, l) => { for (let q = 0; q < 16; q++) c.push(bar(i++, h, l)); };
  H4(100, 90); H4(104, 96); H4(130, 105); H4(130, 120);
  const { state } = h4Events(c, 6);
  // N=6 barres pas atteint : seul le FVG joue. Le prix reste >= 120 : pas de touche
  assert.equal(state[c.length - 1], 0);
  c.push(bar(i++, 125, 104)); // low 104 <= 105 : touche le FVG haussier (sans le remplir, 104 > 100)
  assert.equal(h4Events(c, 6).state[c.length - 1], 1);
});
test('decide : tableau de vérité des combos', () => {
  const F = (c1, c2, recent) => ({ c1, c2, recent });
  assert.equal(decide('none', F(false, false, false)), true);
  assert.equal(decide('and', F(true, false, true)), false); assert.equal(decide('and', F(true, true, true)), true);
  assert.equal(decide('or', F(false, true, false)), true); assert.equal(decide('or', F(false, false, true)), false);
  assert.equal(decide('sw', F(true, false, true)), true);   // récent -> critère 1
  assert.equal(decide('sw', F(true, false, false)), false); // pas récent -> critère 2
  assert.equal(decide('sw', F(false, true, false)), true);
  assert.throws(() => decide('x', F(1, 1, 1)));
  assert.equal(VARIANTS.length, 12);
});
