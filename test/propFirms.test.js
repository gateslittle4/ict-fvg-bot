import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROP_FIRM_PROGRAMS, getPropFirmProgram, listPropFirmPrograms } from '../src/propFirms/index.js';
import { FTMO_1STEP, FTMO_2STEP } from '../src/propFirms/ftmo.js';
import { FUNDINGPIPS_2STEP_STANDARD, FUNDINGPIPS_1STEP_FLEX, FUNDINGPIPS_ZERO } from '../src/propFirms/fundingPips.js';
import { GOATFUNDEDTRADER_1STEP } from '../src/propFirms/goatFundedTrader.js';

test('every registered program is keyed by its own id and has at least one phase', () => {
  for (const [key, program] of Object.entries(PROP_FIRM_PROGRAMS)) {
    assert.equal(program.id, key);
    assert.ok(Array.isArray(program.phases) && program.phases.length > 0, `${key} must have at least one phase`);
    for (const phase of program.phases) {
      assert.equal(typeof phase.dailyLossLimitPct, 'number');
      assert.equal(typeof phase.maxDrawdownPct, 'number');
      assert.ok(['static', 'trailing-eod', 'trailing-locks-at-start-balance'].includes(phase.maxDrawdownType));
    }
  }
});

test('getPropFirmProgram/listPropFirmPrograms match the same registry', () => {
  assert.equal(getPropFirmProgram('ftmo-1step'), FTMO_1STEP);
  assert.equal(getPropFirmProgram('does-not-exist'), null);
  assert.equal(listPropFirmPrograms().length, Object.keys(PROP_FIRM_PROGRAMS).length);
});

// A handful of "does the number match the sourced comparison table" checks -
// data/backtest-input/prop-firm-1step-comparison.md is the source of truth;
// these exist to catch a future accidental drift, not to re-derive the rules.
test('FTMO 1-Step: single phase, +10% target, 10% trailing end-of-day drawdown', () => {
  assert.equal(FTMO_1STEP.phases.length, 1);
  assert.equal(FTMO_1STEP.phases[0].targetPct, 10);
  assert.equal(FTMO_1STEP.phases[0].maxDrawdownType, 'trailing-eod');
  assert.equal(FTMO_1STEP.phases[0].maxDrawdownPct, 10);
  assert.equal(FTMO_1STEP.timeLimitDays, null);
});

test('FTMO 2-Step: two phases, +10% then +5%, static 10% drawdown both phases', () => {
  assert.equal(FTMO_2STEP.phases.length, 2);
  assert.equal(FTMO_2STEP.phases[0].targetPct, 10);
  assert.equal(FTMO_2STEP.phases[1].targetPct, 5);
  assert.ok(FTMO_2STEP.phases.every((p) => p.maxDrawdownType === 'static' && p.maxDrawdownPct === 10));
});

test('FundingPips 2-Step Standard: two phases, +8% then +5%, min 3 trading days each', () => {
  assert.equal(FUNDINGPIPS_2STEP_STANDARD.phases.length, 2);
  assert.equal(FUNDINGPIPS_2STEP_STANDARD.phases[0].targetPct, 8);
  assert.equal(FUNDINGPIPS_2STEP_STANDARD.phases[1].targetPct, 5);
  assert.ok(FUNDINGPIPS_2STEP_STANDARD.phases.every((p) => p.minTradingDays === 3));
});

test('FundingPips 1-Step Flex: single phase, +12% target, 12% static drawdown, no min days', () => {
  assert.equal(FUNDINGPIPS_1STEP_FLEX.phases.length, 1);
  assert.equal(FUNDINGPIPS_1STEP_FLEX.phases[0].targetPct, 12);
  assert.equal(FUNDINGPIPS_1STEP_FLEX.phases[0].maxDrawdownPct, 12);
  assert.equal(FUNDINGPIPS_1STEP_FLEX.phases[0].minTradingDays, null);
});

test('FundingPips Zero: no profit target, 5% drawdown, and the 1% max-open-risk rule', () => {
  assert.equal(FUNDINGPIPS_ZERO.phases[0].targetPct, null);
  assert.equal(FUNDINGPIPS_ZERO.phases[0].maxDrawdownPct, 5);
  assert.equal(FUNDINGPIPS_ZERO.maxOpenRiskPct, 1);
});

test('GoatFundedTrader 1-Step: tightest drawdown (6% static) among the 5 programs in the sourced comparison table', () => {
  assert.equal(GOATFUNDEDTRADER_1STEP.phases[0].maxDrawdownPct, 6);
  // FundingPips Zero (5%) was researched separately and isn't part of that
  // comparison table, so it's excluded here on purpose - see fundingPips.js.
  const comparedPrograms = [FTMO_1STEP, FTMO_2STEP, FUNDINGPIPS_2STEP_STANDARD, FUNDINGPIPS_1STEP_FLEX, GOATFUNDEDTRADER_1STEP];
  const maxDrawdowns = comparedPrograms.flatMap((p) => p.phases.map((ph) => ph.maxDrawdownPct));
  assert.equal(Math.min(...maxDrawdowns), 6);
});
