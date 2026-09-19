import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

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

// 2026-09-19: HaitiForex is the first program with a dailyGainCapUsd field
// (a program-level property, not per-phase like targetPct/maxDrawdownPct) -
// confirm it gets forwarded into effective guardrails, and that every OTHER
// program's account still gets `null` (GuardrailEngine's own "disabled"
// default), not `undefined` leaking through unexamined.
test('buildEffectiveConfig: forwards a propFirm\'s dailyGainCapUsd (HaitiForex) into guardrails', () => {
  const effective = buildEffectiveConfig({
    id: 'test-haitiforex',
    propFirmProgramId: 'haitiforex-100k',
    phaseIndex: 0,
    guardrails: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, dayBoundaryHourUTC: 0 },
    riskPctPerTrade: 0.5,
  });
  assert.equal(effective.guardrails.dailyGainCapUsd, 2200);
});

test('buildEffectiveConfig: a propFirm program with no dailyGainCapUsd (every firm except HaitiForex) forwards null, not undefined', () => {
  const effective = buildEffectiveConfig({
    id: 'test-ftmo-gain-cap',
    propFirmProgramId: 'ftmo-1step',
    phaseIndex: 0,
    guardrails: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 99, dayBoundaryHourUTC: 0 },
    riskPctPerTrade: 0.5,
  });
  assert.equal(effective.guardrails.dailyGainCapUsd, null);
});

test('buildEffectiveConfig: no propFirmProgramId means the account\'s own guardrails pass through untouched', () => {
  const guardrails = { maxTradesPerDay: 5, cooldownMinutesAfterLoss: 15, dailyLossLimitPct: 1.5, dayBoundaryHourUTC: 0 };
  const effective = buildEffectiveConfig({ id: 'test-plain', propFirmProgramId: null, guardrails, riskPctPerTrade: 0.3 });
  assert.deepEqual(effective.guardrails, guardrails);
});

// Regression test for a real bug caught 2026-09-17 while wiring Silver
// Bullet live: weeklySweep/breakerBlock were added to config.js and
// accountRuntime.js ("LIVE, auto-executed") but never forwarded here -
// AccountRuntime reads config.weeklySweep/config.breakerBlock directly, and
// an omitted key is `undefined`, which LiveStrategyEngine's constructor
// silently defaults back to null (disabled). Both mechanisms were inert in
// production the entire time despite being documented as live. Every
// live-mechanism config block must be forwarded, checked explicitly by name
// so a future mechanism added to config.js but forgotten here fails loudly.
test('buildEffectiveConfig: forwards every live-mechanism config block from CONFIG (nwog/judasSwing/weeklySweep/breakerBlock/silverBullet/cbdr/pyramid), none silently dropped', () => {
  const effective = buildEffectiveConfig({ id: 'test-plain', propFirmProgramId: null, guardrails: {}, riskPctPerTrade: 0.3 });
  assert.equal(effective.nwog, CONFIG.nwog);
  assert.equal(effective.judasSwing, CONFIG.judasSwing);
  assert.equal(effective.weeklySweep, CONFIG.weeklySweep);
  assert.equal(effective.breakerBlock, CONFIG.breakerBlock);
  assert.equal(effective.silverBullet, CONFIG.silverBullet);
  // 2026-09-18: added alongside CBDR going live (US100 only) - same
  // regression class, guarded here from the start this time.
  assert.equal(effective.cbdr, CONFIG.cbdr);
  assert.equal(effective.pyramid, CONFIG.pyramid);
});

// --- DISABLED_ACCOUNT_IDS -------------------------------------------------
// 2026-09-16: added so an account can be taken out of service without
// rewriting ACCOUNTS_JSON, which holds live broker credentials. First real
// use was the cti-freetrial Match-Trader account, whose login is answered by
// a Cloudflare challenge on every boot so it never actually connects.
// Exercised through a real CONFIG re-import per case (the filter runs at
// module load), with the env var restored afterwards.
async function accountIdsWith(disabledValue) {
  const before = process.env.DISABLED_ACCOUNT_IDS;
  const previousAccounts = process.env.ACCOUNTS_JSON;
  process.env.ACCOUNTS_JSON = JSON.stringify([
    { id: 'default', platform: 'mock' },
    { id: 'cti-freetrial', platform: 'mock' },
  ]);
  if (disabledValue === undefined) delete process.env.DISABLED_ACCOUNT_IDS;
  else process.env.DISABLED_ACCOUNT_IDS = disabledValue;
  try {
    // cache-bust so the module-level resolution re-runs against this env
    const { CONFIG } = await import(`../src/config.js?disabled=${encodeURIComponent(String(disabledValue))}`);
    return CONFIG.accounts.map((a) => a.id);
  } finally {
    if (before === undefined) delete process.env.DISABLED_ACCOUNT_IDS;
    else process.env.DISABLED_ACCOUNT_IDS = before;
    if (previousAccounts === undefined) delete process.env.ACCOUNTS_JSON;
    else process.env.ACCOUNTS_JSON = previousAccounts;
  }
}

test('DISABLED_ACCOUNT_IDS: unset keeps every account', async () => {
  assert.deepEqual(await accountIdsWith(undefined), ['default', 'cti-freetrial']);
});

test('DISABLED_ACCOUNT_IDS: removes exactly the named account', async () => {
  assert.deepEqual(await accountIdsWith('cti-freetrial'), ['default']);
});

test('DISABLED_ACCOUNT_IDS: tolerates spacing and empty entries', async () => {
  assert.deepEqual(await accountIdsWith(' cti-freetrial , '), ['default']);
});

test('DISABLED_ACCOUNT_IDS: an unknown id is a harmless no-op, not an error', async () => {
  assert.deepEqual(await accountIdsWith('does-not-exist'), ['default', 'cti-freetrial']);
});

// A bot with zero accounts boots into a state where nothing trades and every
// dashboard route 404s - that reads as a crash, not a config choice.
test('DISABLED_ACCOUNT_IDS: refuses to disable the last account, keeping all of them', async () => {
  assert.deepEqual(await accountIdsWith('default,cti-freetrial'), ['default', 'cti-freetrial']);
});

// The Supabase path specifically: accounts can also arrive from
// fetchDynamicAccounts() at boot, long after config.js loaded. The first
// attempt at disabling cti-freetrial only filtered CONFIG.accounts and so
// did nothing at all - the account lives in Supabase. isAccountDisabled() is
// exported precisely so server.js's boot can apply the same rule there.
test('isAccountDisabled: matches the ids listed in DISABLED_ACCOUNT_IDS', async () => {
  const { isAccountDisabled } = await import('../src/config.js');
  const before = process.env.DISABLED_ACCOUNT_IDS;
  try {
    process.env.DISABLED_ACCOUNT_IDS = 'cti-freetrial, other-one ';
    assert.equal(isAccountDisabled('cti-freetrial'), true);
    assert.equal(isAccountDisabled('other-one'), true);
    assert.equal(isAccountDisabled('default'), false);

    delete process.env.DISABLED_ACCOUNT_IDS;
    assert.equal(isAccountDisabled('cti-freetrial'), false); // unset disables nothing

    process.env.DISABLED_ACCOUNT_IDS = '';
    assert.equal(isAccountDisabled('cti-freetrial'), false);
  } finally {
    if (before === undefined) delete process.env.DISABLED_ACCOUNT_IDS;
    else process.env.DISABLED_ACCOUNT_IDS = before;
  }
});
