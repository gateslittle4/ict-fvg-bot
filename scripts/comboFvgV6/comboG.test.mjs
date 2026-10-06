import test from 'node:test';
import assert from 'node:assert/strict';
import { eventSweepOk } from './comboG.mjs';
const bar = (i, h, l, c = (h + l) / 2) => ({ t: i * 900 + 5 * 3600, o: c, h, l, c });
test('le balayage reste valable jusqu\'au high de plage H4, puis un nouveau balayage le rouvre', () => {
  const c = []; let i = 0;
  for (; i < 16 * 8; i++) c.push(bar(i, 101, 99));        // 8 barres H4 plates
  const sweep = i; c.push(bar(i++, 100, 98));              // balayage du low
  for (let q = 0; q < 5; q++) c.push(bar(i++, 100.5, 99.5)); // reste sous le high 101
  const stillOk = i - 1; c.push(bar(i++, 101.5, 100));    // touche le high de plage -> annulé
  const killed = i - 1; c.push(bar(i++, 100, 97));         // nouveau plus bas -> nouvel épisode
  const reopened = i - 1;
  const ok = eventSweepOk(c, 6);
  assert.equal(ok[sweep - 1], 0); assert.equal(ok[sweep], 1); assert.equal(ok[stillOk], 1);
  assert.equal(ok[killed], 0); assert.equal(ok[reopened], 1);
});
test('toucher le FVG M15 baissier non rempli annule le balayage (sans nouveau balayage)', () => {
  const c = []; let i = 0;
  const special = { 40: [120, 99], 90: [108, 106], 91: [107, 105], 92: [104.5, 103] }; // le 120 garde le high de plage hors de portée ; 90-92 : FVG baissier [104.5, 106]
  for (; i < 16 * 8; i++) c.push(bar(i, ...(special[i] || [101, 99])));
  const sweep = i; c.push(bar(i++, 100, 98));
  c.push(bar(i++, 100, 99.5)); const waiting = i - 1;
  c.push(bar(i++, 104.6, 99.5)); const touched = i - 1;   // touche le bas du FVG (104.5), sans nouveau plus bas
  const ok = eventSweepOk(c, 6);
  assert.equal(ok[sweep], 1); assert.equal(ok[waiting], 1); assert.equal(ok[touched], 0);
});
