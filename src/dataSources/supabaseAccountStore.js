// supabaseAccountStore.js
// Lets Esdras add a new prop-firm account (its broker/Match-Trader
// credentials, risk mode, propFirmProgramId) THROUGH THE DASHBOARD instead
// of editing ACCOUNTS_JSON and redeploying (2026-09-13, at her explicit
// request: "un moyen de mettre les codes dans le site à la main, sans
// redéployer? Car ici, je vais être obligé de mettre le brokerId, donc
// redéployer" - the CTI Match-Trader brokerId being the immediate trigger).
//
// Same table/project as supabaseTradeLog.js (public.bot_accounts in the
// "Chfproject" Supabase project) - bot_-prefixed, RLS enabled with NO anon/
// authenticated policies, only reachable with the service_role key used
// here server-side. This table matters MORE than bot_trade_events on that
// front: it holds live broker credentials (cTrader tokens, Match-Trader
// email/password/brokerId), not just trade outcomes.
//
// Deliberately opt-in and additive, same philosophy as every other Supabase
// integration in this project (createTradeLogClient(), keepAlive.js):
// createAccountStoreClient() returns null when SUPABASE_URL/
// SUPABASE_SERVICE_KEY are unset, and the bot keeps working with exactly
// its static ACCOUNTS_JSON accounts, same as before this file existed.
//
// A row here is normalized through config.js's normalizeAccountEntry() -
// the SAME function ACCOUNTS_JSON entries go through - so a Supabase-stored
// account is shaped identically to a static one by the time
// accountRegistry.js sees it (no second, drifting normalization path).

import { createClient } from '@supabase/supabase-js';

const TABLE = 'bot_accounts';

/**
 * @param {{url?: string, serviceKey?: string}} [env]
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function createAccountStoreClient({ url, serviceKey } = {}) {
  const supabaseUrl = url ?? process.env.SUPABASE_URL;
  const key = serviceKey ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}

/** DB row -> the raw shape normalizeAccountEntry() expects (same shape an
 * ACCOUNTS_JSON array entry has). */
function rowToRawAccountEntry(row) {
  return {
    id: row.id,
    label: row.label,
    accountMode: row.account_mode,
    platform: row.platform,
    riskPctPerTrade: row.risk_pct_per_trade ?? undefined,
    propFirmProgramId: row.prop_firm_program_id,
    phaseIndex: row.phase_index,
    guardrails: row.guardrails || undefined,
    broker: row.broker || {},
    matchTrader: row.match_trader || {},
  };
}

/**
 * Every account stored in Supabase, in the raw shape normalizeAccountEntry()
 * consumes - caller (server.js's boot sequence) normalizes and registers
 * each one, same as it already does for CONFIG.accounts.
 * @returns {Promise<Array<object>>} empty array if not configured, the
 *   table doesn't exist yet, or the query fails (logged, never thrown - a
 *   Supabase hiccup must never block the static accounts from booting).
 */
export async function fetchDynamicAccounts(client = createAccountStoreClient()) {
  if (!client) return [];
  const { data, error } = await client.from(TABLE).select('*').order('created_at', { ascending: true });
  if (error) {
    console.error('[supabaseAccountStore] fetchDynamicAccounts failed (continuing with static accounts only):', error.message);
    return [];
  }
  return (data || []).map(rowToRawAccountEntry);
}

/**
 * Upserts one account row (by id). `raw` is the SAME shape an ACCOUNTS_JSON
 * entry has ({id, label, accountMode, platform, riskPctPerTrade,
 * propFirmProgramId, phaseIndex, guardrails, broker, matchTrader}) - the
 * admin endpoint that calls this passes through exactly what it received
 * from the dashboard form, no reshaping.
 * @returns {Promise<{ok: true}|{ok: false, error: string}>}
 */
export async function saveDynamicAccount(raw, client = createAccountStoreClient()) {
  if (!client) return { ok: false, error: 'Supabase not configured (SUPABASE_URL/SUPABASE_SERVICE_KEY unset)' };
  if (!raw.id) return { ok: false, error: 'id is required' };
  const row = {
    id: raw.id,
    label: raw.label || raw.id,
    account_mode: raw.accountMode || 'challenge',
    platform: raw.platform || null,
    risk_pct_per_trade: typeof raw.riskPctPerTrade === 'number' ? raw.riskPctPerTrade : null,
    prop_firm_program_id: raw.propFirmProgramId || null,
    phase_index: Number.isInteger(raw.phaseIndex) ? raw.phaseIndex : 0,
    guardrails: raw.guardrails || null,
    broker: raw.broker || {},
    match_trader: raw.matchTrader || {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from(TABLE).upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Lists accounts for the dashboard's "Comptes" page WITHOUT leaking secrets
 * back into the browser - every credential field is reduced to a boolean
 * "is it set" instead of its real value, same spirit as never echoing a
 * password back after it's been saved.
 */
export async function listDynamicAccountsRedacted(client = createAccountStoreClient()) {
  if (!client) return [];
  const { data, error } = await client.from(TABLE).select('*').order('created_at', { ascending: true });
  if (error) {
    console.error('[supabaseAccountStore] listDynamicAccountsRedacted failed:', error.message);
    return [];
  }
  return (data || []).map((row) => ({
    id: row.id,
    label: row.label,
    accountMode: row.account_mode,
    platform: row.platform,
    riskPctPerTrade: row.risk_pct_per_trade,
    propFirmProgramId: row.prop_firm_program_id,
    phaseIndex: row.phase_index,
    hasBrokerCreds: Boolean(row.broker?.clientId && row.broker?.clientSecret && row.broker?.accessToken),
    hasMatchTraderCreds: Boolean(row.match_trader?.email && row.match_trader?.password && row.match_trader?.brokerId && row.match_trader?.platformUrl),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** @returns {Promise<{ok: true}|{ok: false, error: string}>} */
export async function deleteDynamicAccount(id, client = createAccountStoreClient()) {
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { error } = await client.from(TABLE).delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
