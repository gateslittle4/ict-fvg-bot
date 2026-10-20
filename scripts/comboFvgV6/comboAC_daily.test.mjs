import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTrend } from './comboAC_daily.mjs';

// Une bougie par jour (suffisant pour tester la logique daily). t moteur : jour NY d = floor((t - 5 h) / 86 400).
const day = (d, h, l, c) => ({ t: d * 86400 + 5 * 3600 + 43200, o: c, h, l, c, raw: d * 86400000 });
const stOf = (bars) => dailyTrend(bars);

test('sans sommet ni creux confirmé : état neutre', () => {
  const st = stOf([day(0, 10, 9, 9.5), day(1, 11, 10, 10.5), day(2, 12, 11, 11.5), day(3, 13, 12, 12.5), day(4, 14, 13, 13.5)]);
  assert.deepEqual([...st], [0, 0, 0, 0, 0]);
});

test('2 clôtures au-dessus du dernier sommet confirmé => haussier, mais seulement le jour suivant (causal)', () => {
  // sommet daily à d2 (high 20), confirmé à la clôture de d4 ; clôtures à 21 les jours 6 et 7 ; l'état n'existe qu'à partir du jour 8
  const bars = [day(0, 10, 8, 9), day(1, 12, 9, 11), day(2, 20, 11, 15), day(3, 13, 10, 12), day(4, 12, 9, 10), day(5, 11, 9, 10), day(6, 22, 10, 21), day(7, 23, 20, 21), day(8, 24, 21, 23), day(9, 25, 22, 24)];
  const st = stOf(bars);
  assert.equal(st[6], 0); // un seul jour de clôture au-dessus : pas encore
  assert.equal(st[7], 0); // le jour de la 2e clôture, l'état n'est pas encore connu (barre incomplète)
  assert.equal(st[8], 1); // après la clôture complète de la barre 7 : haussier
  assert.equal(st[9], 1);
});

test('une seule clôture au-dessus : pas de tendance haussière', () => {
  const bars = [day(0, 10, 8, 9), day(1, 12, 9, 11), day(2, 20, 11, 15), day(3, 13, 10, 12), day(4, 12, 9, 10), day(5, 11, 9, 10), day(6, 22, 10, 21), day(7, 19, 10, 18), day(8, 19, 10, 18), day(9, 19, 10, 18)];
  assert.ok([...stOf(bars)].every((s) => s === 0));
});

test('après une tendance haussière, 2 clôtures sous le dernier creux confirmé => baissier', () => {
  // d0..d9 : tendance haussière (voir test 2) ; creux daily confirmé à d10 (low 5, jours 8-12 autour), puis clôtures à 4 les jours 13 et 14
  const bars = [day(0, 10, 8, 9), day(1, 12, 9, 11), day(2, 20, 11, 15), day(3, 13, 10, 12), day(4, 12, 9, 10), day(5, 11, 9, 10), day(6, 22, 10, 21), day(7, 23, 20, 21), day(8, 24, 21, 23), day(9, 25, 22, 24),
    day(10, 24, 5, 23), day(11, 26, 22, 25), day(12, 27, 24, 26), day(13, 26, 3, 4), day(14, 5, 2, 3), day(15, 5, 2, 4)];
  const st = stOf(bars);
  assert.equal(st[9], 1);
  assert.equal(st[14], 1); // clôture de la barre 13 sous le creux, mais une seule
  assert.equal(st[15], -1); // 2 clôtures consécutives (13 et 14) sous Lp = 5 : baissier
});

test('plusieurs bougies M15 le même jour forment une seule barre daily', () => {
  const m15 = (d, hh, h, l, c) => ({ t: d * 86400 + 5 * 3600 + hh * 3600, o: c, h, l, c, raw: d * 86400000 + hh * 3600000 });
  const bars = [m15(0, 1, 10, 9, 9.5), m15(0, 14, 12, 8, 11), m15(1, 2, 11, 9, 10)];
  const st = stOf(bars);
  assert.equal(st.length, 3);
  assert.deepEqual([...st], [0, 0, 0]);
});
