import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geminiSignals } from '../scripts/lib/geminiFvg.js';
import { geminiBuysOnFine } from '../scripts/lib/geminiIntrabar.js';

// Contrôle : avec D = M15 la fonction doit reproduire EXACTEMENT les achats de geminiSignals, sur de vraies bougies.
test('geminiBuysOnFine avec D = M15 reproduit geminiSignals (achats) sur 30 000 vraies bougies US100', () => {
  const rows = fs.readFileSync('data/backtest-input/US100.csv', 'utf8').trim().split('\n').slice(1, 30001).map((l) => l.split(',').map(Number));
  const m15 = rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] }));
  const ref = geminiSignals(m15).filter((s) => s.dir === 'bullish');
  const fine = m15.map((c, i) => ({ ...c, row: i }));
  const got = geminiBuysOnFine(m15, fine);
  assert.ok(ref.length > 100, `assez de signaux de référence (${ref.length})`);
  assert.equal(got.length, ref.length);
  for (let i = 0; i < ref.length; i++) {
    assert.equal(got[i].row, ref[i].entryIndex);
    assert.equal(got[i].entryPrice, ref[i].entryPrice);
    assert.ok(Math.abs(got[i].stopPrice - ref[i].stopPrice) < 1e-9);
    assert.equal(got[i].targetPrice, ref[i].targetPrice);
  }
});
