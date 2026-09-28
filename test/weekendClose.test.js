import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fridayCloseReached, weekendCloseAt } from '../scripts/lib/weekendClose.js';

const OFF = 5 * 3600000;
const engine = (iso) => Date.parse(iso) - OFF; // temps moteur = UTC - 5 h fixe

test('weekendClose: Friday 16:45 New York in winter (EST) and in summer (EDT)', () => {
  assert.equal(fridayCloseReached(engine('2026-01-23T21:45:00Z')), true); // vendredi 16:45 EST
  assert.equal(fridayCloseReached(engine('2026-01-23T21:30:00Z')), false); // 16:30
  assert.equal(fridayCloseReached(engine('2026-07-17T20:45:00Z')), true); // vendredi 16:45 EDT
  assert.equal(fridayCloseReached(engine('2026-07-17T20:30:00Z')), false);
});

test('weekendClose: never on other days, even late (Thursday 16:45, Sunday reopening)', () => {
  assert.equal(fridayCloseReached(engine('2026-01-22T21:45:00Z')), false);
  assert.equal(fridayCloseReached(engine('2026-01-25T23:00:00Z')), false);
  assert.equal(fridayCloseReached(engine('2026-07-16T20:45:00Z')), false);
});

test('weekendClose (amendment): the last Friday bar closes when the data stops before 16:45, not an earlier Friday bar', () => {
  const t = engine('2019-05-03T19:00:00Z'); // vendredi 15:00 EDT, dernière bougie (HistData s'arrête à 16:15)
  const sunday = engine('2019-05-05T22:00:00Z');
  assert.equal(weekendCloseAt(t, sunday), true);
  assert.equal(weekendCloseAt(t, t + 15 * 60000), false); // pas la dernière : on attend
  assert.equal(weekendCloseAt(engine('2019-05-02T19:00:00Z'), engine('2019-05-05T22:00:00Z')), false); // jeudi (Vendredi saint) : non traité
  assert.equal(weekendCloseAt(engine('2026-01-23T21:45:00Z'), engine('2026-01-23T22:00:00Z')), true); // 16:45 : ferme même si la suite existe
});
