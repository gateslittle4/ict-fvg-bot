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
function buildEffectiveConfig(accountConfig) {
  const program = accountConfig.propFirmProgramId ? getPropFirmProgram(accountConfig.propFirmProgramId) : null;
  const phase = program ? program.phases[accountConfig.phaseIndex ?? 0] : null;
  if (accountConfig.propFirmProgramId && !program) {
    console.error(`[accountRegistry] account "${accountConfig.id}" references unknown propFirmProgramId "${accountConfig.propFirmProgramId}" - ignoring it (no target/drawdown tracking for this account).`);
  }

  const guardrails = phase
    ? {
        ...accountConfig.guardrails, // maxTradesPerDay/cooldownMinutesAfterLoss/dayBoundaryHourUTC still come from here
        // The prop firm's OWN numbers win over accountConfig.guardrails'
        // defaults for daily loss - these are what actually decides whether
        // the challenge itself survives, unlike the generic 2% default that
        // only ever applied because it happened to already be stricter.
        dailyLossLimitPct: phase.dailyLossLimitPct,
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
