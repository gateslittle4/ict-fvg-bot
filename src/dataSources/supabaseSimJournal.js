// supabaseSimJournal.js - journal des backtests manuels du simulateur (2026-09-28, Esdras : « backtester comme dans Forex Tester »,
// pour que Claude puisse retrouver sa stratégie à partir de ses décisions). Une ligne par séance du simulateur, remplacée à chaque envoi
// (upsert sur la séance) : ordres envoyés, setups laissés, raisons cochées, dessins, gestion, résultats. Même projet Supabase et même
// règle que bot_trade_events : table préfixée bot_, RLS activée sans aucune politique (seule la clé service_role du serveur y accède).
//
//   create table public.bot_sim_journal (
//     session text primary key,
//     created_at timestamptz not null default now(),
//     updated_at timestamptz not null default now(),
//     blind boolean,
//     symbols text,
//     entries integer not null default 0,
//     payload jsonb not null
//   );
//   alter table public.bot_sim_journal enable row level security;

const TABLE = 'bot_sim_journal';
export const MAX_ENTRIES = 3000;

/** Checks the shape the simulator sends; returns the row to store or an error message. */
export function toJournalRow(body) {
  if (!body || typeof body !== 'object') return { error: 'corps manquant' };
  if (typeof body.session !== 'string' || !/^[\w-]{8,64}$/.test(body.session)) return { error: 'séance invalide' };
  if (!Array.isArray(body.entries)) return { error: 'entries manquant' };
  if (body.entries.length > MAX_ENTRIES) return { error: `plus de ${MAX_ENTRIES} entrées` };
  const symbols = Array.isArray(body.pairs) ? body.pairs.map((p) => String(p?.symbol ?? p?.id ?? '')).filter(Boolean).join(',').slice(0, 200) : null;
  return { row: { session: body.session, updated_at: new Date().toISOString(), blind: !!body.blind, symbols, entries: body.entries.length, payload: body } };
}

export async function saveSimJournal(client, body) {
  if (!client) return { ok: false, status: 503, error: 'Supabase non configuré sur le serveur' };
  const { row, error } = toJournalRow(body);
  if (error) return { ok: false, status: 400, error };
  const { error: dbError } = await client.from(TABLE).upsert(row, { onConflict: 'session' });
  if (dbError) return { ok: false, status: 502, error: dbError.message };
  return { ok: true, session: row.session, entries: row.entries };
}

export async function listSimJournals(client, { limit = 20 } = {}) {
  if (!client) return { ok: false, status: 503, error: 'Supabase non configuré sur le serveur' };
  const { data, error } = await client.from(TABLE).select('session, created_at, updated_at, blind, symbols, entries').order('updated_at', { ascending: false }).limit(Math.min(100, Math.max(1, limit)));
  if (error) return { ok: false, status: 502, error: error.message };
  return { ok: true, journals: data };
}
