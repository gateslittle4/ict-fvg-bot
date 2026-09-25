import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fridayCloseReached } from '../scripts/lib/weekendClose.js';

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
