// accountRegistry.js
// Owns every AccountRuntime this process manages (2026-09, multi-account
// rollout - see HANDOFF.md "Multi-compte"). Builds one AccountRuntime per
// entry in CONFIG.accounts (see config.js's ACCOUNTS_JSON/resolveAccounts())
// - today that is exactly ONE entry (id: 'default') unless ACCOUNTS_JSON is
// explicitly set, so this stays behaviorally identical to the old store.js
// singleton until Esdras actually adds a second account.

import { AccountRuntime } from './accountRuntime.js';
import { CONFIG } from './config.js';
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';
import { getPropFirmProgram } from './propFirms/index.js';

// Strategy config (which symbols, FVG/Divergence/NWOG/Judas Swing/pyramid
// rules) is shared across every account by design (see the plan in
// HANDOFF.md: "chaque prop firm a son propre risque/drawdown", not sa propre
// stratégie) - only the account-specific bits below vary per entry.
// Exported for direct unit testing (see test/accountRegistry.test.js) -
// this is where phase.dailyLossLimitPct: null (CTI) gets safely handled
// instead of leaking into GuardrailEngine, worth a real regression test
// given the bug it replaced.
export function buildEffectiveConfig(accountConfig) {
  const program = accountConfig.propFirmProgramId ? getPropFirmProgram(accountConfig.propFirmProgramId) : null;
  const phase = program ? program.phases[accountConfig.phaseIndex ?? 0] : null;
  if (accountConfig.propFirmProgramId && !program) {
    console.error(`[accountRegistry] account "${accountConfig.id}" references unknown propFirmProgramId "${accountConfig.propFirmProgramId}" - ignoring it (no target/drawdown tracking for this account).`);
  }

  const guardrails = phase
    ? {
        ...accountConfig.guardrails, // maxTradesPerDay/cooldownMinutesAfterLoss/dayBoundaryHourUTC still come from here
        // The prop firm's OWN number wins over accountConfig.guardrails'
        // default for daily loss - it's what actually decides whether the
        // challenge itself survives, unlike the generic 2% default that
        // only ever applied because it happened to already be stricter.
        // BUT: phase.dailyLossLimitPct can be null (2026-09-13, CTI's
        // 1-Step - confirmed "no daily loss limit" on their own page) -
        // unlike maxDrawdownPct/maxDrawdownType, GuardrailEngine has NO
        // "null disables this check" convention for dailyLossLimitPct
        // (its constructor default is a real number, 2, and the block
        // check is a bare >= comparison - passing null through would
        // coerce to >= 0 and block trading almost immediately, a real bug
        // caught before it shipped, not a hypothetical one). So when the
        // firm imposes no daily cap, fall back to the account's OWN
        // generic guardrail default instead of forwarding null - "the
        // bot's own daily protection stays active regardless of which
        // firm is being tested" is the same philosophy already applied
        // throughout this project's research scripts, just enforced here
        // in the live path too.
        dailyLossLimitPct: typeof phase.dailyLossLimitPct === 'number' ? phase.dailyLossLimitPct : accountConfig.guardrails?.dailyLossLimitPct,
        targetPct: phase.targetPct,
        maxDrawdownPct: phase.maxDrawdownPct,
        maxDrawdownType: phase.maxDrawdownType,
      }
    : accountConfig.guardrails;

  return {
    symbols: CONFIG.symbols,
    fvg: CONFIG.fvg,
    divergence: CONFIG.divergence,
    nwog: CONFIG.nwog,
    judasSwing: CONFIG.judasSwing,
    pyramid: CONFIG.pyramid,
    guardrails,
    risk: { riskPctPerTrade: accountConfig.riskPctPerTrade },
  };
}

const accounts = new Map(
  CONFIG.accounts.map((accountConfig) => [
    accountConfig.id,
    new AccountRuntime({
      id: accountConfig.id,
      label: accountConfig.label,
      accountMode: accountConfig.accountMode,
      platform: accountConfig.platform,
      propFirmProgramId: accountConfig.propFirmProgramId,
      phaseIndex: accountConfig.phaseIndex,
      config: buildEffectiveConfig(accountConfig),
      spreads: DEFAULT_SPREADS,
    }),
  ])
);

// Adds ONE account after module init - used by server.js's boot sequence
// for accounts loaded from Supabase (see supabaseAccountStore.js), which
// can't be known at import time the way CONFIG.accounts (env-var-derived)
// already is. Same buildEffectiveConfig() as every static account, so a
// Supabase-stored account is indistinguishable from an ACCOUNTS_JSON one
// once registered. Overwrites silently if the id already exists (re-running
// boot after a restart re-registers the same ids) - not an error case.
export function registerAccount(accountConfig) {
  accounts.set(
    accountConfig.id,
    new AccountRuntime({
      id: accountConfig.id,
      label: accountConfig.label,
      accountMode: accountConfig.accountMode,
      platform: accountConfig.platform,
      propFirmProgramId: accountConfig.propFirmProgramId,
      phaseIndex: accountConfig.phaseIndex,
      config: buildEffectiveConfig(accountConfig),
      spreads: DEFAULT_SPREADS,
    })
  );
}

export function getAccount(id) {
  return accounts.get(id);
}

export function listAccounts() {
  return [...accounts.values()];
}

// Phase 1 convenience, still used by every current consumer (server.js, the
// data sources) since only one account exists by default. Once ACCOUNTS_JSON
// carries more than one entry, new code should switch to
// getAccount(id)/listAccounts() instead - see server.js's per-account routes.
export function getDefaultAccount() {
  return accounts.get(CONFIG.accounts[0].id);
}
