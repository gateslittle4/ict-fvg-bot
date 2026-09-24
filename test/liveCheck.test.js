import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLiveAndReplay, summarizeCheck, mergeCandles } from '../scripts/lib/liveCheck.js';

const H = 3600000, T0 = Date.UTC(2026, 8, 23, 14, 30);
const L = (o) => ({ symbol: 'US100', source: 'cbdr', direction: 'bullish', entryTime: T0, exitTime: T0 + H, rMultiple: 3.29, ...o });
const R = (o) => ({ symbol: 'US100', source: 'cbdr', direction: 'bullish', entryTime: T0, exitTime: T0 + H, r: 2.93, ...o });
const opts = { replayedSymbols: ['US100', 'US500'] };

test('liveCheck: same pair, strategy, side and entry within 20 min -> identical; otherwise one row on each side', () => {
  const rows = matchLiveAndReplay([L({ entryTime: T0 + 60000 }), L({ source: 'divergence', symbol: 'US500', entryTime: T0 + 6 * H })],
    [R(), R({ source: 'divergence', symbol: 'US500', entryTime: T0 + 30 * 60000, r: -1 })], opts);
  assert.deepEqual(rows.map((r) => r.status), ['identique', 'rejeu seulement', 'réel seulement']);
  assert.equal(rows[0].liveR, 3.29); assert.equal(rows[0].replayR, 2.93);
});

test('liveCheck: pairs outside the replay and unlabelled trades are out of scope, never counted as a mismatch; A/B are compared like the rest', () => {
  const rows = matchLiveAndReplay([L({ symbol: 'GER40', source: 'silverbullet' }), L({ source: null })], [], opts);
  assert.deepEqual(rows.map((r) => r.status), ['hors rejeu', 'hors rejeu']);
  const s = summarizeCheck(rows);
  assert.equal(s.outOfScope, 2); assert.equal(s.liveR, 0);
  const ab = matchLiveAndReplay([L({ source: 'orb5', rMultiple: 4.46 })], [R({ source: 'orb5', r: 4.2 })], opts);
  assert.deepEqual(ab.map((r) => r.status), ['identique']);
});

test('liveCheck: a replay-only trade while A/B held the pair in real life is explained in the note', () => {
  const rows = matchLiveAndReplay([L({ source: 'orb5', entryTime: T0 - H, exitTime: T0 + 5 * H })], [R({ source: 'silverbullet', entryTime: T0 + H })], opts);
  const only = rows.find((r) => r.status === 'rejeu seulement');
  assert.match(only.note, /tenue par orb5/);
});

test('liveCheck: summary totals R on the common scope and flags live trades without a known R', () => {
  const s = summarizeCheck(matchLiveAndReplay([L(), L({ source: 'nwog', entryTime: T0 + 5 * H, rMultiple: null })], [R()], opts));
  assert.equal(s.identical, 1); assert.equal(s.liveOnly, 1); assert.equal(s.liveRMissing, 1);
  assert.ok(Math.abs(s.liveR - 3.29) < 1e-9); assert.ok(Math.abs(s.replayR - 2.93) < 1e-9);
});

test('liveCheck: mergeCandles keeps one candle per time, newest wins, sorted', () => {
  const m = mergeCandles([{ time: 2, close: 1 }, { time: 1, close: 1 }], [{ time: 2, close: 9 }, { time: 3, close: 3 }]);
  assert.deepEqual(m.map((c) => [c.time, c.close]), [[1, 1], [2, 9], [3, 3]]);
});
