import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullbackTrades, nyClock } from '../scripts/lib/pullbackRule.js';

const MIN = 60000, OFF = 5 * 3600000;
/** Série M1 (temps moteur) à partir d'une fonction prix(minute), sans mèches sauf précision. */
function series(fromIso, minutes, price, wick = 0) {
  const t0 = Date.parse(fromIso) - OFF, S = { t: [], o: [], h: [], l: [], c: [], n: 0 };
  for (let k = 0; k < minutes; k++) { const p = price(k), q = price(k + 1); S.t.push(t0 + k * MIN); S.o.push(p); S.c.push(q); S.h.push(Math.max(p, q) + wick); S.l.push(Math.min(p, q) - wick); }
  S.n = minutes; return S;
}

test('pullbackRule.nyClock: winter and summer New York minutes', () => {
  assert.equal(nyClock(Date.parse('2024-01-10T08:00:00Z') - OFF).min, 3 * 60); // 03:00 EST
  assert.equal(nyClock(Date.parse('2024-07-10T07:00:00Z') - OFF).min, 3 * 60); // 03:00 EDT
});

test('pullbackRule: a 4 h rise then a 1 h dip in the morning gives a buy at the next minute, stop 1 ATR, target 3R', () => {
  // départ 19:00 NY le 08/01 (préchauffage de l'ATR horaire) ; plat jusqu'à 18:00 NY le 09, puis +3 points/heure jusqu'à 03:00 NY,
  // repli de 0,2 point/minute pendant 45 min (03:00 -> 03:45), puis forte hausse. À 03:45 : 4 h en hausse, dernière heure en baisse,
  // clôture à 67 % du range du jour (<= 75 %) -> achat à la minute suivante.
  const start = '2024-01-09T00:00:00Z';
  const flat = 23 * 60, dipStart = flat + 9 * 60, dipEnd = dipStart + 45;
  const price = (k) => (k < flat ? 100 : k < dipStart ? 100 + (k - flat) * 0.05 : k < dipEnd ? 127 - (k - dipStart) * 0.2 : 118 + (k - dipEnd) * 0.5);
  const S = series(start, dipEnd + 6 * 60, price, 0.2);
  const tr = pullbackTrades(S, () => 0);
  assert.ok(tr.length >= 1);
  const t = tr[0];
  assert.equal(t.dir, 1);
  assert.equal(nyClock(t.entryTime).min, 3 * 60 + 45); // entrée à la minute qui suit la clôture de 03:45
  assert.equal(t.reason, 'target'); assert.ok(Math.abs(t.r - 3) < 1e-9);
});

test('pullbackRule: nothing from 11:00 New York, and at most 3 entries a day', () => {
  const S = series('2024-01-10T15:00:00Z', 6 * 60, (k) => 100 + Math.sin(k / 20) * 5, 0.1); // 10:00 -> 16:00 NY
  for (const t of pullbackTrades(S, () => 0)) assert.ok(nyClock(t.entryTime).min < 11 * 60);
  const long = series('2024-01-09T23:00:00Z', 24 * 60, (k) => 100 + k * 0.01 + Math.sin(k / 15) * 3, 0.1);
  const perDay = {}; for (const t of pullbackTrades(long, () => 0)) perDay[nyClock(t.entryTime).dayKey] = (perDay[nyClock(t.entryTime).dayKey] || 0) + 1;
  for (const n of Object.values(perDay)) assert.ok(n <= 3);
});
