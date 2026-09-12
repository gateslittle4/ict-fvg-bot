// accountRegistry.js
// Owns every AccountRuntime this process manages (2026-09, multi-account
// rollout - see HANDOFF.md "Multi-compte"). Phase 1 builds exactly ONE
// account (id: 'default') from the global CONFIG - identical behavior to
// the old store.js singleton, just moved behind this registry so every
// consumer (server.js, the data sources) already goes through the
// multi-account-capable path before any second account ever exists. Phase 2
// will read CONFIG.accounts (ACCOUNTS_JSON) here instead and build one
// AccountRuntime per entry.

import { AccountRuntime } from './accountRuntime.js';
import { CONFIG } from './config.js';
import { DEFAULT_SPREADS } from './backtest/transactionCosts.js';

const accounts = new Map([['default', new AccountRuntime({ id: 'default', label: 'default', config: CONFIG, spreads: DEFAULT_SPREADS })]]);

export function getAccount(id) {
  return accounts.get(id);
}

export function listAccounts() {
  return [...accounts.values()];
}

// Phase 1 convenience: every current consumer only ever deals with the one
// account that exists today. Once CONFIG.accounts supports more than one
// entry, callers should switch to getAccount(id)/listAccounts() instead.
export function getDefaultAccount() {
  return accounts.get('default');
}
