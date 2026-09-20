// researchMemory.js
// Structured, queryable research log (2026-09-20, Esdras: après avoir comparé
// ce projet au brainstorm "plateforme de recherche quantitative" d'un ami -
// la seule idée de ce document qui valait la peine d'être reprise ici sans
// tout reconstruire). HANDOFF.md reste le journal chronologique de référence
// (toujours la source de vérité pour le détail complet) - ce fichier en est
// un INDEX structuré, pour répondre vite à "est-ce qu'on a déjà testé ça ?"
// sans relire des milliers de lignes, et pour que l'assistant IA du
// dashboard (chatAssistant.js) puisse le citer.
//
// Chaque entrée décrit UNE hypothèse ou UNE correction méthodologique déjà
// traitée dans ce projet - jamais une hypothèse non testée ("wishlist"), et
// jamais une prédiction sur l'avenir. `status` distingue :
//   - 'live'               : mécanisme actuellement actif dans le bot réel
//   - 'validated-research' : edge confirmé train+test, pas (encore) câblé live
//   - 'rejected'           : testé, ne tient pas, ne pas retester tel quel
//   - 'methodology-fix'    : pas une stratégie - une correction de biais/bug
//     de mesure qui a changé la fiabilité d'autres résultats
//   - 'inconclusive'       : signal trop faible/échantillon trop court pour trancher
//
// Peuplé au démarrage (2026-09-20) avec les entrées les plus significatives
// et les plus récentes de HANDOFF.md - PAS un remplissage exhaustif des ~22
// mécanismes du Labo ni de tout l'historique HaitiForex/FTMO. Les entrées
// suivantes s'ajoutent au fil des sessions (voir `addEntry` plus bas) plutôt
// que d'essayer de tout rétro-remplir d'un coup.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RESEARCH_MEMORY_PATH = path.join(__dirname, '..', '..', 'data', 'research-memory.json');

const VALID_STATUSES = ['live', 'validated-research', 'rejected', 'methodology-fix', 'inconclusive'];

/** @param {object} entry @returns {string[]} validation errors, empty if the entry is well-formed */
export function validateEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['entry must be an object'];
  for (const field of ['id', 'title', 'date', 'status', 'summary']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) errors.push(`missing/empty required field: ${field}`);
  }
  if (entry.status && !VALID_STATUSES.includes(entry.status)) {
    errors.push(`status "${entry.status}" not one of ${VALID_STATUSES.join(', ')}`);
  }
  if (entry.date && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push('date must be YYYY-MM-DD');
  if (entry.markets !== undefined && !Array.isArray(entry.markets)) errors.push('markets must be an array when present');
  if (entry.files !== undefined && !Array.isArray(entry.files)) errors.push('files must be an array when present');
  return errors;
}

/** @returns {Array<object>} the raw list on disk - throws if the file is missing/malformed rather than silently returning []. */
export function loadResearchMemory(filePath = RESEARCH_MEMORY_PATH) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${filePath} must contain a JSON array`);
  return raw;
}

/**
 * @param {Array<object>} entries
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.market] - matches if `markets` includes it (case-insensitive)
 * @param {string} [filters.text] - matches against title/summary/knownWeaknesses (case-insensitive substring)
 * @returns {Array<object>} entries matching ALL given filters, most recent `date` first
 */
export function queryResearchMemory(entries, { status, market, text } = {}) {
  const marketLower = market ? market.toLowerCase() : null;
  const textLower = text ? text.toLowerCase() : null;
  return entries
    .filter((e) => !status || e.status === status)
    .filter((e) => !marketLower || (e.markets || []).some((m) => m.toLowerCase() === marketLower))
    .filter((e) => {
      if (!textLower) return true;
      const haystack = `${e.title} ${e.summary} ${e.knownWeaknesses || ''}`.toLowerCase();
      return haystack.includes(textLower);
    })
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Appends one validated entry and writes the file back - the only mutating
 * function here (everything else is a pure read/query). Throws on a
 * duplicate id or an invalid entry rather than silently overwriting/
 * corrupting history.
 */
export function addEntry(entry, filePath = RESEARCH_MEMORY_PATH) {
  const errors = validateEntry(entry);
  if (errors.length > 0) throw new Error(`invalid research-memory entry: ${errors.join('; ')}`);
  const entries = loadResearchMemory(filePath);
  if (entries.some((e) => e.id === entry.id)) throw new Error(`duplicate research-memory id: "${entry.id}"`);
  entries.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + '\n');
  return entries;
}
