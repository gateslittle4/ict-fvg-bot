import test from 'node:test';
import assert from 'node:assert/strict';
import { decideWatchdogAlert, decideNotification, OK, STALE_FEED_SEC } from '../src/watchdogDecision.js';

const healthy = {
  ok: true,
  accountsConnected: 1,
  marketOpen: true,
  lastCandleAgeSec: 120,
  lastOrderRejectionAgeSec: null,
  lastOrderRejectionCode: null,
  unconfirmedOrderStreak: 0,
};

test('a healthy bot during market hours raises nothing', () => {
  assert.equal(decideWatchdogAlert({ health: healthy }).state, OK);
});

test('an unreachable service alerts, even without a reason', () => {
  assert.equal(decideWatchdogAlert({ health: null }).state, 'unreachable');
  assert.match(decideWatchdogAlert({ health: null, fetchError: 'timeout' }).body, /timeout/);
});

test('a closed market silences everything, including a dead feed', () => {
  // The weekend false-alarm trap: the service is asleep by design from Friday
  // 17:00 to Sunday 17:00 NY, so every signal below looks broken.
  const asleep = { ...healthy, marketOpen: false, accountsConnected: 0, lastCandleAgeSec: 99999, unconfirmedOrderStreak: 4 };
  assert.equal(decideWatchdogAlert({ health: asleep }).state, OK);
});

test('a lost broker socket alerts even though the site still answers', () => {
  assert.equal(decideWatchdogAlert({ health: { ...healthy, accountsConnected: 0 } }).state, 'broker-disconnected');
});

test('a recent refusal alerts and names the reason', () => {
  const r = decideWatchdogAlert({
    health: { ...healthy, lastOrderRejectionAgeSec: 60, lastOrderRejectionCode: 'NOT_ENOUGH_MONEY' },
  });
  assert.equal(r.state, 'order-rejected:NOT_ENOUGH_MONEY');
  assert.match(r.body, /NOT_ENOUGH_MONEY/);
});

test('an old refusal is history, not news', () => {
  assert.equal(decideWatchdogAlert({ health: { ...healthy, lastOrderRejectionAgeSec: 7200, lastOrderRejectionCode: 'X' } }).state, OK);
});

test('orders vanishing without any answer are reported distinctly from a refusal', () => {
  const r = decideWatchdogAlert({ health: { ...healthy, unconfirmedOrderStreak: 2 } });
  assert.equal(r.state, 'order-unconfirmed');
  assert.match(r.body, /2 ordre/);
});

test('a stale feed alerts, and a merely slow one does not', () => {
  assert.equal(decideWatchdogAlert({ health: { ...healthy, lastCandleAgeSec: STALE_FEED_SEC + 1 } }).state, 'feed-stale');
  assert.equal(decideWatchdogAlert({ health: { ...healthy, lastCandleAgeSec: STALE_FEED_SEC } }).state, OK);
});

test('a bot still warming up (no candle yet) is not reported as a dead feed', () => {
  assert.equal(decideWatchdogAlert({ health: { ...healthy, lastCandleAgeSec: null } }).state, OK);
});

test('execution faults outrank a stale feed, because they name the real cause', () => {
  const both = { ...healthy, lastCandleAgeSec: 99999, lastOrderRejectionAgeSec: 30, lastOrderRejectionCode: 'BAD_VOLUME' };
  assert.match(decideWatchdogAlert({ health: both }).state, /^order-rejected/);
});

// ---- repeat suppression --------------------------------------------------

test('a fault speaks once, not every ten minutes', () => {
  const fault = decideWatchdogAlert({ health: { ...healthy, accountsConnected: 0 } });
  assert.equal(decideNotification(fault, null).send, true);
  assert.equal(decideNotification(fault, 'broker-disconnected').send, false);
});

test('a DIFFERENT fault speaks, even while something was already broken', () => {
  const fault = decideWatchdogAlert({ health: { ...healthy, accountsConnected: 0 } });
  assert.equal(decideNotification(fault, 'feed-stale').send, true);
});

test('recovery sends an all-clear, but only if something had broken', () => {
  const fine = decideWatchdogAlert({ health: healthy });
  const recovered = decideNotification(fine, 'broker-disconnected');
  assert.equal(recovered.send, true);
  assert.match(recovered.title, /opérationnel/);
  assert.equal(decideNotification(fine, OK).send, false);
  assert.equal(decideNotification(fine, null).send, false);
});
