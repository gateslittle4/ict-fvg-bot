import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recordAlert, getRecentAlerts, _resetAlertHistoryForTests } from '../src/alertHistory.js';

beforeEach(() => {
  _resetAlertHistoryForTests();
});

test('getRecentAlerts: empty when nothing has been recorded', () => {
  assert.deepEqual(getRecentAlerts(), []);
});

test('recordAlert/getRecentAlerts: returns newest first', () => {
  recordAlert('first');
  recordAlert('second');
  recordAlert('third');
  const alerts = getRecentAlerts();
  assert.deepEqual(alerts.map((a) => a.text), ['third', 'second', 'first']);
  for (const a of alerts) assert.equal(typeof a.at, 'number');
});

test('getRecentAlerts: respects the limit argument', () => {
  recordAlert('a');
  recordAlert('b');
  recordAlert('c');
  const alerts = getRecentAlerts(2);
  assert.deepEqual(alerts.map((a) => a.text), ['c', 'b']);
});

test('recordAlert: caps history at 200 entries, dropping the oldest', () => {
  for (let i = 0; i < 250; i++) recordAlert(`alert-${i}`);
  const alerts = getRecentAlerts(500);
  assert.equal(alerts.length, 200);
  assert.equal(alerts[0].text, 'alert-249');
  assert.equal(alerts[alerts.length - 1].text, 'alert-50');
});
