import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROP_FIRM_PROGRAMS, getPropFirmProgram, listPropFirmPrograms } from '../src/propFirms/index.js';
import { FTMO_1STEP, FTMO_1STEP_FUNDED, FTMO_2STEP } from '../src/propFirms/ftmo.js';
import { FUNDINGPIPS_2STEP_STANDARD, FUNDINGPIPS_1STEP_FLEX, FUNDINGPIPS_ZERO } from '../src/propFirms/fundingPips.js';
import { GOATFUNDEDTRADER_1STEP, GOATFUNDEDTRADER_INSTANT_PREMIUM, GOATFUNDEDTRADER_INSTANT_HERO } from '../src/propFirms/goatFundedTrader.js';

// The 4th type here ('trailing-realtime-equity-never-resets', GoatFundedTrader
// Instant Premium only) is NOT one GuardrailEngine's _overallDrawdownFloor()
// recognizes - an unrecognized type fails OPEN there (never blocks live
// trading on a guess), so this program's overall drawdown is measured only by
// scripts/runGoatFundedTraderFloatingLossAnalysis.js today, not enforced live.
// Listed here so a real typo in any OTHER program's type still fails this test.
const KNOWN_DRAWDOWN_TYPES = ['static', 'trailing-eod', 'trailing-locks-at-start-balance', 'trailing-realtime-equity-never-resets'];

test('every registered program is keyed by its own id and has at least one phase', () => {
  for (const [key, program] of Object.entries(PROP_FIRM_PROGRAMS)) {
    assert.equal(program.id, key);
    assert.ok(Array.isArray(program.phases) && program.phases.length > 0, `${key} must have at least one phase`);
    for (const phase of program.phases) {
      assert.equal(typeof phase.dailyLossLimitPct, 'number');
      assert.equal(typeof phase.maxDrawdownPct, 'number');
      assert.ok(KNOWN_DRAWDOWN_TYPES.includes(phase.maxDrawdownType));
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

test('FTMO 1-Step Funded: same loss rules as the Challenge, but no profit target', () => {
  assert.notEqual(FTMO_1STEP_FUNDED.id, FTMO_1STEP.id);
  assert.equal(FTMO_1STEP_FUNDED.firm, FTMO_1STEP.firm); // groups under the same dashboard tab
  assert.equal(FTMO_1STEP_FUNDED.phases[0].targetPct, null);
  assert.equal(FTMO_1STEP_FUNDED.phases[0].dailyLossLimitPct, FTMO_1STEP.phases[0].dailyLossLimitPct);
  assert.equal(FTMO_1STEP_FUNDED.phases[0].maxDrawdownPct, FTMO_1STEP.phases[0].maxDrawdownPct);
  assert.equal(FTMO_1STEP_FUNDED.phases[0].maxDrawdownType, FTMO_1STEP.phases[0].maxDrawdownType);
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

test('GoatFundedTrader Instant Premium: instant-funded (no target), no consistency rule, and the floating-loss rule no other program has', () => {
  assert.equal(GOATFUNDEDTRADER_INSTANT_PREMIUM.phases[0].targetPct, null);
  assert.equal(GOATFUNDEDTRADER_INSTANT_PREMIUM.consistencyRule, null);
  assert.equal(GOATFUNDEDTRADER_INSTANT_PREMIUM.floatingLossRule.thresholdPct, 1);
  assert.equal(GOATFUNDEDTRADER_INSTANT_PREMIUM.floatingLossRule.thresholdPctLegacy, 1.5);
  assert.equal(GOATFUNDEDTRADER_INSTANT_PREMIUM.floatingLossRule.consequence, 'permanent-account-closure');
  // No program outside GoatFundedTrader's two instant-funded programs has a
  // floatingLossRule field at all.
  const others = Object.values(PROP_FIRM_PROGRAMS).filter(
    (p) => p.id !== GOATFUNDEDTRADER_INSTANT_PREMIUM.id && p.id !== GOATFUNDEDTRADER_INSTANT_HERO.id
  );
  assert.ok(others.every((p) => p.floatingLossRule === undefined));
});

test('GoatFundedTrader Instant HERO: a DIFFERENT instant program from Instant Premium, with a real (payout-only) 15% consistency rule', () => {
  assert.notEqual(GOATFUNDEDTRADER_INSTANT_HERO.id, GOATFUNDEDTRADER_INSTANT_PREMIUM.id);
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.phases[0].targetPct, null);
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.phases[0].maxDrawdownPct, 5); // tighter than Instant Premium's 6%
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.floatingLossRule.thresholdPct, 1);
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.consistencyRule.maxSharePct, 15);
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.consistencyRule.blocksPayoutOnly, true);
  assert.equal(GOATFUNDEDTRADER_INSTANT_HERO.profitSplit, 0.9); // better split than Instant Premium's 0.8
});
