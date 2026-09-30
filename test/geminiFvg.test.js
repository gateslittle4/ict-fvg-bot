import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiSignals } from '../scripts/lib/geminiFvg.js';

const M15 = 900000;
const bar = (i, o, h, l, cl) => ({ time: i * M15, open: o, high: h, low: l, close: cl });

// Un FVG haussier ancien (cible, sous le prix) puis un FVG baissier récent (exécution), puis une bougie de rejet.
function fixture(rejectClose = 104.5) {
  return [
    bar(0, 99, 100, 98, 99.5), // B1 haussier : high 100
    bar(1, 99.5, 102, 99.4, 101.8),
    bar(2, 101.8, 103, 101, 102.5), // B3 haussier : low 101 > 100 -> FVG cible [100, 101]
    bar(3, 102.5, 105, 101.9, 104.8), // montée sans nouveau FVG (mèches qui se chevauchent)
    bar(4, 104.8, 107, 102.9, 106.8),
    bar(5, 106.8, 109, 104.9, 108.8),
    bar(6, 108.8, 109.5, 107, 107.2), // B1 baissier : low 107
    bar(7, 107.2, 107.3, 104, 104.2),
    bar(8, 104.2, 105, 103.5, 103.8), // B3 baissier : high 105 < 107 -> FVG d'exécution [105, 107]
    bar(9, 103.8, 105.5, 103.7, rejectClose), // touche 105, clôture sous 107 -> rejet
    bar(10, 104.4, 104.6, 103, 103.5), // entrée à 104.4
    bar(11, 103.5, 103.6, 100.5, 101),
  ];
}

test('geminiSignals: rejet d\'un FVG baissier -> vente à l\'ouverture suivante, stop au-dessus du haut, cible = haut du FVG à gauche', () => {
  const s = geminiSignals(fixture());
  assert.equal(s.length, 1);
  assert.equal(s[0].dir, 'bearish');
  assert.equal(s[0].rejectIndex, 9);
  assert.equal(s[0].entryPrice, 104.4);
  assert.ok(Math.abs(s[0].stopPrice - 107.2) < 1e-9); // 107 + 10 % de 2
  assert.equal(s[0].targetPrice, 101); // bord le plus proche du FVG cible [100, 101]
});

test('geminiSignals: clôture au-dessus du haut -> FVG invalidé, pas de signal', () => {
  const c = fixture();
  c[9] = bar(9, 103.8, 108, 103.7, 107.5);
  assert.equal(geminiSignals(c).length, 0);
});

test('geminiSignals: objectif à moins de 1 R -> ignoré', () => {
  const c = fixture();
  c[2] = bar(2, 101.8, 103, 101.7, 102.5); // FVG cible [100, 101.7] : à 2,7 de l'entrée pour un risque de 2,8
  assert.equal(geminiSignals(c).length, 0);
});

test('geminiSignals: position déjà ouverte -> pas de signal, le FVG reste actif pour un rejet suivant', () => {
  const c = fixture();
  c.splice(11, 0, bar(11, 103.5, 105.2, 103.4, 104.8)); // deuxième rejet à l'index 11
  c[12] = bar(12, 104.7, 104.8, 100.5, 101); // entrée du 2e rejet à 104.7 (risque 2,5, cible à 3,7)
  c.push(bar(13, 101, 101.5, 100.5, 101));
  const s = geminiSignals(c, { canTrade: (i) => i !== 10 });
  assert.equal(s.length, 1);
  assert.equal(s[0].rejectIndex, 11);
});
