// strategySwitches.js - interrupteurs des stratégies A (orb5) et B (noise), modifiables sans redéploiement (2026-09-24, Esdras : « mets un
// endroit où je peux désactiver les stratégies A et B »). État en mémoire, persisté dans la table Supabase `bot_settings`
// (clé 'strategy_switches', service role seulement). Désactiver une stratégie bloque ses NOUVELLES entrées ; ses sorties continuent,
// pour qu'une position déjà ouverte soit fermée normalement (15:59, contrôles de B, stop/objectif du broker).
const KEY = 'strategy_switches';
export const STRATEGY_SWITCH_IDS = ['orb5', 'noise'];
const DEFAULTS = Object.freeze({ orb5: true, noise: true });
let state = { ...DEFAULTS };

const clean = (value) => Object.fromEntries(STRATEGY_SWITCH_IDS.filter((id) => typeof value?.[id] === 'boolean').map((id) => [id, value[id]]));

export function getStrategySwitches() { return { ...state }; }
export function isStrategyEnabled(id) { return state[id] !== false; }
export function resetStrategySwitchesForTests() { state = { ...DEFAULTS }; }

/** Lit l'état sauvegardé (au démarrage). Sans client ou en cas d'erreur : l'état courant (tout actif par défaut). */
export async function loadStrategySwitches(client) {
  if (!client) return getStrategySwitches();
  try {
    const { data, error } = await client.from('bot_settings').select('value').eq('key', KEY).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.value) state = { ...DEFAULTS, ...clean(data.value) };
  } catch (err) {
    console.warn(`[strategy-switches] lecture impossible (non bloquant, état courant gardé) : ${err.message}`);
  }
  return getStrategySwitches();
}

/** Change un ou plusieurs interrupteurs ({ orb5?: bool, noise?: bool }) et le sauvegarde. */
export async function setStrategySwitches(client, patch) {
  const changes = clean(patch);
  if (!Object.keys(changes).length) return { ok: false, error: 'attendu : { orb5: true|false } et/ou { noise: true|false }', switches: getStrategySwitches() };
  state = { ...state, ...changes };
  let persisted = false;
  if (client) {
    const { error } = await client.from('bot_settings').upsert({ key: KEY, value: state, updated_at: new Date().toISOString() });
    if (error) console.warn(`[strategy-switches] sauvegarde impossible (appliqué en mémoire seulement) : ${error.message}`);
    else persisted = true;
  }
  console.log(`[strategy-switches] ${JSON.stringify(state)}${persisted ? '' : ' (non sauvegardé)'}`);
  return { ok: true, persisted, switches: getStrategySwitches() };
}
