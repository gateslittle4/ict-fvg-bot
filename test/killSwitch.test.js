import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeKillSwitchState, refreshKillSwitch, isLegAllowed, setKillSwitchOverride, resetKillSwitchForTests } from '../src/killSwitch.js';

const seed = {
  seedTime: '2026-09-21T03:43:00.000Z',
  legs: {
    'cbdr US100': { reference: 10, limit: 15, cumR: 5, peakR: 8, stoppedAt: null },
    'silverbullet US500': { reference: 24.32, limit: 36.48, cumR: -17.25, peakR: 20.12, stoppedAt: '2025-09-16T14:30:00.000Z' },
  },
};
const T = (d, source, symbol, r) => ({ source, symbol, rMultiple: r, entryTime: Date.parse(d) });

test('killSwitch: a leg is stopped as soon as its drawdown from the peak exceeds 1.5x its reference, live trades after the seed only', () => {
  const trades = [T('2026-09-20T10:00:00Z', 'cbdr', 'US100', -50), // before seedTime: already inside the seed, ignored
    T('2026-09-22T10:00:00Z', 'cbdr', 'US100', -5), T('2026-09-23T10:00:00Z', 'cbdr', 'US100', -8)];
  let s = computeKillSwitchState(seed, trades.slice(0, 2));
  assert.equal(s['cbdr US100'].allowed, true); assert.equal(s['cbdr US100'].drawdownR, 8); // 8 - 0 = 8 <= 15
  s = computeKillSwitchState(seed, trades);
  assert.equal(s['cbdr US100'].allowed, false); assert.equal(s['cbdr US100'].stoppedBy, 'règle'); // peak 8, cum 5 -> 0 -> -8 : baisse 16 > 15
  assert.equal(s['cbdr US100'].stoppedAt, '2026-09-23T10:00:00.000Z');
});

test('killSwitch: a leg the pre-registered rule stopped in the replay stays stopped, even after a live winner', () => {
  const s = computeKillSwitchState(seed, [T('2026-09-23T15:00:00Z', 'silverbullet', 'US500', 2.65)]);
  assert.equal(s['silverbullet US500'].allowed, false);
  assert.equal(s['silverbullet US500'].stoppedAt, '2025-09-16T14:30:00.000Z');
});

test('killSwitch: re-enabled by hand -> measured again from that moment (and can be stopped again); stopped by hand -> blocked', () => {
  const ov = { 'silverbullet US500': { enabled: true, at: '2026-09-25T00:00:00Z' }, 'cbdr US100': { enabled: false, at: '2026-09-25T00:00:00Z' } };
  let s = computeKillSwitchState(seed, [T('2026-09-23T15:00:00Z', 'silverbullet', 'US500', -30)], ov);
  assert.equal(s['silverbullet US500'].allowed, true); assert.equal(s['silverbullet US500'].drawdownR, 0); // trade before the re-enable ignored
  assert.equal(s['cbdr US100'].allowed, false); assert.equal(s['cbdr US100'].stoppedBy, 'manuel');
  s = computeKillSwitchState(seed, Array.from({ length: 37 }, (_, i) => T(`2026-09-${String(26 + Math.floor(i / 10)).padStart(2, '0')}T1${i % 10}:00:00Z`, 'silverbullet', 'US500', -1)), ov);
  assert.equal(s['silverbullet US500'].allowed, false); // 37 R lost after the re-enable > 36.48
});

test('killSwitch: legs without a reference (GER40, B, Judas EURUSD) are never blocked; the committed seed stops Silver Bullet US500 only', async () => {
  resetKillSwitchForTests();
  await refreshKillSwitch(null);
  assert.equal(isLegAllowed('silverbullet', 'US500'), false);
  assert.equal(isLegAllowed('silverbullet', 'US100'), true);
  assert.equal(isLegAllowed('silverbullet', 'GER40'), true);
  assert.equal(isLegAllowed('noise', 'US500'), true);
  const committed = JSON.parse(fs.readFileSync(new URL('../data/kill-switch-seed.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.entries(committed.legs).filter(([, l]) => l.stoppedAt).map(([k]) => k), ['silverbullet US500']);
  const r = await setKillSwitchOverride(null, 'silverbullet US500', true);
  assert.equal(r.ok, true); assert.equal(isLegAllowed('silverbullet', 'US500'), true);
  assert.equal((await setKillSwitchOverride(null, 'inconnue US100', true)).ok, false);
  resetKillSwitchForTests();
});

test('killSwitch wiring: a stopped leg never reaches the broker; another leg on the same pair still does', async () => {
  const { CTraderDataSource } = await import('../src/dataSources/cTraderDataSource.js');
  const { GuardrailEngine } = await import('../src/engines/guardrailEngine.js');
  const { getDefaultSpec } = await import('../src/engines/lotCalculator.js');
  resetKillSwitchForTests();
  await refreshKillSwitch(null); // committed seed: Silver Bullet US500 stopped
  const account = {
    balance: 10000, strategyEngine: { riskPctPerTrade: 0.3, openPositions: new Map(), getOpenPosition: () => null, clearBelievedPosition() {}, adoptExternalPosition: () => null },
    guardrail: new GuardrailEngine({}), lastCandleBySymbol: new Map([['US500', { close: 5000 }]]), setBalance() {}, recordOrderOutcome() {}, isAutoExecuteActive: () => true,
  };
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US500'] });
  ds._specFor = (s) => ({ ...getDefaultSpec(s), lotSize: 100, digits: 2, volumeVerified: true });
  ds._notify = () => {};
  const submitted = [];
  ds._submitOrder = async (o) => { submitted.push(o); return null; };
  const signal = (source) => ({ id: `${source}-1`, source, suggestedSide: 'sell', entryPrice: 5000, stopPrice: 5010, targetPrice: 4970 });
  await ds._handleAutoExecuteEntry('US500', 215, signal('silverbullet'));
  assert.equal(submitted.length, 0, 'Silver Bullet US500 is stopped: no order');
  await ds._handleAutoExecuteEntry('US500', 215, signal('weeklysweep'));
  assert.equal(submitted.length, 1, 'Weekly Sweep US500 is not stopped: order sent');
  resetKillSwitchForTests();
});
