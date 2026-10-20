import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPD } from './comboAD_dailyPD.mjs';

// Une bougie par jour (suffisant pour tester la logique daily). t moteur : jour NY d = floor((t - 5 h) / 86 400).
const day = (d, h, l, c) => ({ t: d * 86400 + 5 * 3600 + 43200, o: c, h, l, c, raw: d * 86400000 });
const stOf = (bars) => [...dailyPD(bars).st];
// Creux daily à d2 (low 5, confirmé à la clôture de d4) ; sommet daily à d2 pour la variante haute.
const lowBase = [day(0, 12, 8, 10), day(1, 11, 7, 9), day(2, 10, 5, 8), day(3, 11, 7, 9), day(4, 12, 8, 10)];
const highBase = [day(0, 18, 8, 10), day(1, 19, 9, 12), day(2, 20, 10, 14), day(3, 19, 9, 12), day(4, 18, 8, 10)];

test('low daily pris puis rejeté (clôture au-dessus) => haussier, mais seulement le jour suivant (causal)', () => {
  const st = stOf([...lowBase, day(5, 11, 4, 6), day(6, 11, 6, 8)]);
  assert.equal(st[5], 0); // le jour de l'événement, la barre est incomplète
  assert.equal(st[6], 1);
});

test('low pris mais clôture en dessous : pas de rejet, pas de tendance', () => {
  const st = stOf([...lowBase, day(5, 9, 4, 4.5), day(6, 6, 4, 5), day(7, 6, 4, 5)]);
  assert.ok(st.every((s) => s === 0));
});

test('high daily pris puis rejeté (clôture en dessous) => baissier', () => {
  const st = stOf([...highBase, day(5, 21, 12, 19), day(6, 19, 12, 15)]);
  assert.equal(st[5], 0);
  assert.equal(st[6], -1);
});

test('FVG daily haussier touché et rejeté (clôture au-dessus du haut de la zone) => haussier', () => {
  // d0 h=10, d2 l=12 : FVG haussier [10, 12], né à la clôture de d2 ; d3 : low 11 (dans la zone), clôture 13 > 12
  const st = stOf([day(0, 10, 8, 9), day(1, 14, 9, 13), day(2, 16, 12, 15), day(3, 15, 11, 13), day(4, 14, 12, 13)]);
  assert.equal(st[3], 0);
  assert.equal(st[4], 1);
});

test('FVG touché mais clôture dans la zone : pas de rejet', () => {
  const st = stOf([day(0, 10, 8, 9), day(1, 14, 9, 13), day(2, 16, 12, 15), day(3, 15, 11, 11.5), day(4, 15, 13, 14), day(5, 15, 13, 14)]);
  assert.ok(st.every((s) => s === 0));
});

test('FVG entièrement rempli par la mèche : mort, pas d\'événement même avec une clôture au-dessus', () => {
  const st = stOf([day(0, 10, 8, 9), day(1, 14, 9, 13), day(2, 16, 12, 15), day(3, 15, 9.5, 13), day(4, 14, 12, 13), day(5, 14, 12, 13)]);
  assert.ok(st.every((s) => s === 0));
});

test('FVG daily baissier touché et rejeté => baissier, et un événement opposé retourne l\'état', () => {
  // d0 l=20, d2 h=18 : FVG baissier [18, 20] ; d3 : high 19 (dans la zone), clôture 17 < 18 => baissier
  const st = stOf([day(0, 22, 20, 21), day(1, 21, 17, 18), day(2, 18, 14, 15), day(3, 19, 15, 17), day(4, 17, 15, 16)]);
  assert.equal(st[3], 0);
  assert.equal(st[4], -1);
});

test('le FVG créé à la clôture de d n\'est pas testé à d (pas d\'événement le jour de sa naissance)', () => {
  const st = stOf([day(0, 10, 8, 9), day(1, 14, 9, 13), day(2, 16, 12, 15), day(3, 16, 12, 15)]);
  assert.ok(st.every((s) => s === 0));
});
