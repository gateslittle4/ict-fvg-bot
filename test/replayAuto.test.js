import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, onCandle } from '../src/shared/replayBroker.js';
import { createAutoState, stepAuto, guardAllows, tradeKey, DEFAULT_GUARD } from '../src/shared/replayAuto.js';

const DAY = 86400;
const T0 = Date.UTC(2024, 2, 4, 15, 0) / 1000; // a Monday afternoon (New York)
const trade = (over = {}) => ({ strategyId: 'bot-fvg', direction: 'bullish', entrySec: T0 + 900, exitSec: T0 + 900 * 5, entryPrice: 100, stopPrice: 99, targetPrice: 103, exitPrice: 103, ...over });
const acct = (o = {}) => { const a = createAccount({ balance: 10000, ...o }); a.spreads = { AAA: 0 }; a.rates = { AAA: 1 }; return a; };
const opts = (over = {}) => ({ fromSec: T0, riskPct: 1, guard: null, ...over });

test('a trade is taken when the clock reaches its entry, once, at its own entry price, risking the asked %', () => {
  const acc = acct(); const st = createAutoState();
  assert.equal(stepAuto(acc, st, 'AAA', [trade()], T0, opts()).length, 0); // not due yet
  const ev = stepAuto(acc, st, 'AAA', [trade()], T0 + 900, opts());
  assert.equal(ev[0].type, 'opened');
  assert.equal(acc.positions[0].entry, 100);
  assert.equal(acc.positions[0].units, 100); // 1 % of 10 000 = 100 over a 1-point stop
  assert.equal(acc.positions[0].tag, 'bot-fvg');
  assert.equal(stepAuto(acc, st, 'AAA', [trade()], T0 + 1800, opts()).length, 0); // never twice
});

test('signals from before the replay start are context: never traded', () => {
  const acc = acct(); const st = createAutoState();
  stepAuto(acc, st, 'AAA', [trade({ entrySec: T0 - 900 })], T0 + 900, opts());
  assert.equal(acc.positions.length, 0);
});

test('the broker resolves a trade at its target; the scheduled exit then finds nothing left to close', () => {
  const acc = acct(); const st = createAutoState();
  stepAuto(acc, st, 'AAA', [trade()], T0 + 900, opts());
  onCandle(acc, { time: T0 + 1800, open: 100, high: 104, low: 100, close: 103 }, 'AAA');
  assert.equal(acc.history[0].reason, 'objectif');
  const ev = stepAuto(acc, st, 'AAA', [trade()], T0 + 900 * 5, opts());
  assert.equal(ev.filter((e) => e.type === 'closed').length, 0);
  assert.equal(acc.history.length, 1);
  assert.equal(st.open.size, 0);
});

test('a trade with no target (or unresolved by the broker) is closed at the strategy\'s own exit price at its exit time', () => {
  const acc = acct(); const st = createAutoState();
  const t = trade({ targetPrice: null, exitPrice: 101.5 });
  stepAuto(acc, st, 'AAA', [t], T0 + 900, opts());
  stepAuto(acc, st, 'AAA', [t], T0 + 2700, opts()); // before the exit time: still open
  assert.equal(acc.positions.length, 1);
  const ev = stepAuto(acc, st, 'AAA', [t], T0 + 900 * 5, opts());
  assert.equal(ev.find((e) => e.type === 'closed').type, 'closed');
  assert.equal(acc.history[0].exit, 101.5);
  assert.equal(acc.history[0].reason, 'sortie de la stratégie');
});

test('with a spread, a sell is still closed exactly at the strategy exit price', () => {
  const acc = acct(); acc.spreads.AAA = 0.4;
  const st = createAutoState();
  const t = trade({ direction: 'bearish', entryPrice: 100, stopPrice: 102, targetPrice: null, exitPrice: 98.5 });
  stepAuto(acc, st, 'AAA', [t], T0 + 900, opts());
  stepAuto(acc, st, 'AAA', [t], T0 + 900 * 5, opts());
  assert.equal(acc.history[0].exit, 98.5);
});

test('guardrails: the 4th closed trade of the day is refused, and refusals are reported, not silent', () => {
  const acc = acct(); const st = createAutoState();
  const g = { ...DEFAULT_GUARD, oneOpenPerSymbol: false };
  for (let i = 0; i < 3; i++) acc.history.push({ closeTime: T0 + i * 60, pnl: 10, symbol: 'AAA' });
  const ev = stepAuto(acc, st, 'AAA', [trade()], T0 + 900, opts({ guard: g }));
  assert.equal(ev[0].type, 'skipped');
  assert.match(ev[0].reason, /3 trades clôturés/);
  assert.equal(acc.positions.length, 0);
  assert.equal(st.skipped.length, 1);
});

test('guardrails: cooldown after a loss, daily loss limit, and one position per pair', () => {
  const now = T0 + 900;
  const base = () => acct();
  const a = base(); a.history.push({ closeTime: now - 600, pnl: -50, symbol: 'AAA' });
  assert.match(guardAllows(a, 'AAA', now, DEFAULT_GUARD).reason, /pause de 30 min/);
  assert.equal(guardAllows(a, 'AAA', now + 3600, DEFAULT_GUARD).ok, true); // an hour later
  const b = base(); b.balance = 9800; b.history.push({ closeTime: now - 7200, pnl: -200, symbol: 'AAA' }); // -2 % of the 10 000 start of day
  assert.match(guardAllows(b, 'AAA', now, DEFAULT_GUARD).reason, /perte du jour/);
  const c = base();
  c.positions.push({ id: 1, symbol: 'AAA' });
  assert.match(guardAllows(c, 'AAA', now, DEFAULT_GUARD).reason, /position déjà ouverte/);
  assert.equal(guardAllows(c, 'BBB', now, DEFAULT_GUARD).ok, true); // another pair is free
});

test('closed trades of a previous day do not count against today\'s cap', () => {
  const acc = acct();
  for (let i = 0; i < 5; i++) acc.history.push({ closeTime: T0 - DAY + i * 60, pnl: 10, symbol: 'AAA' });
  assert.equal(guardAllows(acc, 'AAA', T0 + 900, DEFAULT_GUARD).ok, true);
});

test('a stop too close to size (or a broken order) is reported as skipped instead of throwing', () => {
  const acc = acct(); const st = createAutoState();
  const ev = stepAuto(acc, st, 'AAA', [trade({ stopPrice: 100 })], T0 + 900, opts());
  assert.equal(ev[0].type, 'skipped');
  assert.match(ev[0].reason, /taille nulle/);
});

test('tradeKey is stable per pair, strategy and entry time', () => {
  assert.equal(tradeKey('AAA', trade()), `AAA|bot-fvg|${T0 + 900}`);
});

test('the bot\'s viability filter: a stop tighter than 3x the spread is never traded', () => {
  const acc = acct(); acc.spreads = { AAA: 0.4 }; const st = createAutoState();
  const ev = stepAuto(acc, st, 'AAA', [trade({ stopPrice: 99.5 })], T0 + 900, opts()); // stop 0.5 < 3 x 0.4
  assert.equal(ev[0].type, 'skipped');
  assert.equal(acc.positions.length, 0);
  const ok = stepAuto(acct(), createAutoState(), 'AAA', [trade({ stopPrice: 98 })], T0 + 900, opts()); // no spread on this account: viable
  assert.equal(ok[0].type, 'opened');
  const acc2 = acct(); acc2.spreads = { AAA: 0.4 };
  assert.equal(stepAuto(acc2, createAutoState(), 'AAA', [trade({ stopPrice: 98 })], T0 + 900, opts())[0].type, 'opened'); // stop 2 >= 1.2
});
