import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

// 2026-09-21: GER40 retired from live execution (negative in every period and cost scenario of the M1 backtest, see research-memory `ger40-retired`).
// Guard against it silently coming back through a merge: re-adding it needs the pre-registered criterion written in config.js.
test('GER40 is not a live symbol; live symbols are US100/US500/XAUUSD (2026-09-23 combo: FVG US100/XAUUSD + Divergence)', () => {
  assert.equal(CONFIG.symbols.includes('GER40'), false);
  assert.deepEqual([...CONFIG.symbols].sort(), ['US100', 'US500', 'XAUUSD']);
});
