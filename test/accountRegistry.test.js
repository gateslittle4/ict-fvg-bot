import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveConfig } from '../src/accountRegistry.js';

// Regression test for a real bug caught before it shipped (2026-09-13,
// while adding CTI's 1-Step program, which has NO daily loss limit): a
// prop-firm phase with dailyLossLimitPct: null used to be forwarded
// straight into GuardrailEngine, which has no "null disables this check"
// convention for that field (unlike maxDrawdownPct) - its bare `dailyLossPct
// >= this.dailyLossLimitPct` check would coerce null to 0 and block trading
// almost immediately. buildEffectiveConfig() must fall back to the
// account's own generic guardrail default instead.
test('buildEffectiveConfig: a propFirm phase with no daily loss limit falls back to the account\'s own guardrail default, never forwards null', () => {
  const effective = buildEffectiveConfig({
    id: 'test-cti',
    propFirmProgramId: 'cti-1step',
    phaseIndex: 0,
    guardrails: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, dayBoundaryHourUTC: 0 },
    riskPctPerTrade: 0.5,
  });
  assert.equal(effective.guardrails.dailyLossLimitPct, 2); // the account's own default, NOT null
  assert.notEqual(effective.guardrails.dailyLossLimitPct, null);
  // Sanity: the firm's OTHER numbers (which ARE real numbers) still win, so
  // this isn't accidentally ignoring the whole phase override.
  assert.equal(effective.guardrails.maxDrawdownPct, 5);
  assert.equal(effective.guardrails.targetPct, 8);
});

test('buildEffectiveConfig: a propFirm phase WITH a real daily loss limit still overrides the account default (unaffected by the null fallback)', () => {
  const effective = buildEffectiveConfig({
    id: 'test-ftmo',
    propFirmProgramId: 'ftmo-1step',
    phaseIndex: 0,
    guardrails: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 99, dayBoundaryHourUTC: 0 },
    riskPctPerTrade: 0.5,
  });
  assert.equal(effective.guardrails.dailyLossLimitPct, 3); // FTMO's own 3%, not the account's 99 placeholder
});

test('buildEffectiveConfig: no propFirmProgramId means the account\'s own guardrails pass through untouched', () => {
  const guardrails = { maxTradesPerDay: 5, cooldownMinutesAfterLoss: 15, dailyLossLimitPct: 1.5, dayBoundaryHourUTC: 0 };
  const effective = buildEffectiveConfig({ id: 'test-plain', propFirmProgramId: null, guardrails, riskPctPerTrade: 0.3 });
  assert.deepEqual(effective.guardrails, guardrails);
});
