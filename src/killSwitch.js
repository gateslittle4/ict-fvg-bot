// killSwitch.js - filet de sécurité EN DIRECT (2026-09-24, Esdras : « oui », après « peut-être si on en découvre la cause, on pourrait
// les éviter »). Règle pré-enregistrée et validée : data/backtest-input/preregistration-kill-switch-2026-09-24.md (évaluation 1) et
// kill-switch-study.md : une jambe (stratégie + paire) est ARRÊTÉE dès que sa baisse (recul du R cumulé depuis son plus haut, compté
// depuis le 01/01/2023) dépasse 1,5 × sa pire baisse 2010-2022.
// - Point de départ : data/kill-switch-seed.json (runKillSwitchStudy.js --seed : le rejeu fidèle jusqu'à la fin des données, 21/09/2026).
// - Ensuite : les vrais trades clôturés du journal Supabase (bot_trade_events, r_multiple) entrés après `seedTime`.
// - Arrêter une jambe bloque ses NOUVELLES entrées réelles ; une position déjà ouverte se ferme normalement.
// - Esdras peut forcer une jambe (page Comptes, `bot_settings` clé 'kill_switch_overrides') : réactivée -> la mesure repart de ce moment
//   (elle peut être arrêtée de nouveau si elle perd encore 1,5 × sa référence) ; arrêtée à la main -> bloquée quoi qu'il arrive.
// Jambes sans référence (B en % du nominal, Silver Bullet GER40, Judas Swing EURUSD...) : jamais bloquées par cette règle.
import fs from 'node:fs';

const OVERRIDES_KEY = 'kill_switch_overrides';
const SEED_FILE = new URL('../data/kill-switch-seed.json', import.meta.url);

export const legKey = (source, symbol) => `${source} ${symbol}`;

/**
 * État de chaque jambe, pur.
 * @param {{ seedTime: string, legs: Object<string, {reference, limit, cumR, peakR, stoppedAt}> }} seed
 * @param {Array<{source, symbol, rMultiple, entryTime}>} liveTrades - trades réels clôturés (entryTime en ms UTC)
 * @param {Object<string, {enabled: boolean, at: string}>} [overrides]
 * @returns {Object<string, {reference, limit, cumR, peakR, drawdownR, stoppedAt, stoppedBy, allowed, override}>}
 */
export function computeKillSwitchState(seed, liveTrades, overrides = {}) {
  const seedMs = Date.parse(seed.seedTime);
  const out = {};
  for (const [key, s] of Object.entries(seed.legs)) {
    const ov = overrides[key] ?? null;
    const ovMs = ov ? Date.parse(ov.at) : null;
    let cum = s.cumR, peak = s.peakR, stoppedAt = s.stoppedAt ? Date.parse(s.stoppedAt) : null;
    // Réactivée à la main : la mesure repart à la réactivation (baisse 0), seuls les trades suivants comptent.
    const reenabled = ov?.enabled === true && Number.isFinite(ovMs);
    if (reenabled) { stoppedAt = null; peak = cum; }
    const from = reenabled ? Math.max(seedMs, ovMs) : seedMs;
    const trades = liveTrades.filter((t) => legKey(t.source, t.symbol) === key && Number.isFinite(t.rMultiple) && t.entryTime > from).sort((a, b) => a.entryTime - b.entryTime);
    for (const t of trades) {
      if (stoppedAt !== null) break;
      cum += t.rMultiple; peak = Math.max(peak, cum);
      if (s.reference > 0 && peak - cum > s.limit) stoppedAt = t.entryTime;
    }
    const manualStop = ov?.enabled === false;
    out[key] = {
      reference: s.reference, limit: s.limit, cumR: +cum.toFixed(2), peakR: +peak.toFixed(2), drawdownR: +(peak - cum).toFixed(2),
      stoppedAt: manualStop ? ov.at : stoppedAt !== null ? new Date(stoppedAt).toISOString() : null,
      stoppedBy: manualStop ? 'manuel' : stoppedAt !== null ? 'règle' : null,
      allowed: !manualStop && stoppedAt === null,
      override: ov,
    };
  }
  return out;
}

let seed = null;
let overrides = {};
let state = {};

function loadSeed() {
  if (!seed) seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  return seed;
}

export function getKillSwitchState() { return { seedTime: loadSeed().seedTime, legs: state }; }

/** Une jambe sans référence n'est jamais bloquée par cette règle. */
export function isLegAllowed(source, symbol) {
  const s = state[legKey(source, symbol)];
  return s ? s.allowed : true;
}

/** Recalcule l'état depuis le journal réel (au démarrage, puis après chaque trade clôturé). Non bloquant en cas d'erreur. */
export async function refreshKillSwitch(client) {
  const sd = loadSeed();
  let trades = [];
  if (client) {
    try {
      const [{ data, error }, ov] = await Promise.all([
        client.from('bot_trade_events').select('source, symbol, r_multiple, entry_time').gt('entry_time', sd.seedTime),
        client.from('bot_settings').select('value').eq('key', OVERRIDES_KEY).maybeSingle(),
      ]);
      if (error) throw new Error(error.message);
      if (ov.error) throw new Error(ov.error.message);
      trades = (data || []).map((r) => ({ source: r.source, symbol: r.symbol, rMultiple: r.r_multiple == null ? null : Number(r.r_multiple), entryTime: Date.parse(r.entry_time) }));
      overrides = ov.data?.value ?? {};
    } catch (err) {
      console.warn(`[kill-switch] lecture du journal impossible (état précédent gardé) : ${err.message}`);
      if (Object.keys(state).length) return getKillSwitchState();
    }
  }
  const before = state;
  state = computeKillSwitchState(sd, trades, overrides);
  for (const [k, s] of Object.entries(state)) {
    if (!s.allowed && before[k]?.allowed !== false) console.log(`[kill-switch] ${k} ARRÊTÉE (${s.stoppedBy}, ${s.stoppedAt}) : baisse ${s.drawdownR} R, limite ${s.limit} R`);
  }
  return getKillSwitchState();
}

/** Force une jambe (enabled true = réactivée, false = arrêtée à la main, null = retour à la règle automatique) et le sauvegarde. */
export async function setKillSwitchOverride(client, key, enabled) {
  const sd = loadSeed();
  if (!sd.legs[key]) return { ok: false, error: `jambe inconnue « ${key} » (connues : ${Object.keys(sd.legs).join(', ')})` };
  if (![true, false, null].includes(enabled)) return { ok: false, error: 'attendu : { leg, enabled: true | false | null }' };
  const next = { ...overrides };
  if (enabled === null) delete next[key]; else next[key] = { enabled, at: new Date().toISOString() };
  if (client) {
    const { error } = await client.from('bot_settings').upsert({ key: OVERRIDES_KEY, value: next, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: `sauvegarde impossible : ${error.message}` };
  }
  overrides = next;
  console.log(`[kill-switch] ${key} : ${enabled === null ? 'règle automatique' : enabled ? 'réactivée à la main' : 'arrêtée à la main'}`);
  return { ok: true, ...(await refreshKillSwitch(client)) };
}

export function resetKillSwitchForTests() { seed = null; overrides = {}; state = {}; }
