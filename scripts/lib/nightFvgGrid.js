// nightFvgGrid.js - la grille des règles FVG M15 de la recherche de nuit (familles A et B), partagée par l'exploration, la sélection,
// la validation et le final (une seule définition). Voir data/backtest-input/preregistration-nuit-2026-09-26.md.
import fs from 'node:fs';
import { HOUR, spreadAt, swapCost } from './nightLab.js';

const MODEL = JSON.parse(fs.readFileSync(new URL('../../data/backtest-input/night-eye-model.json', import.meta.url), 'utf8'));
/** Score du modèle de ses choix (logistique ajustée sur ses 180 opportunités de 2025). */
export const modelScore = (f) => MODEL.w[0] + MODEL.features.reduce((s, k, q) => s + MODEL.w[q + 1] * (f[k] - MODEL.mu[k]) / MODEL.sd[k], 0);

export const WINDOWS = {
  'âge 5-12, 3h-11h': { ageMin: 5, ageMax: 12, fromMin: 180, toMin: 660, exitMin: 660 },
  'âge 5-24, 3h-11h': { ageMin: 5, ageMax: 24, fromMin: 180, toMin: 660, exitMin: 660 },
  'âge 0-4 (frais), 3h-11h': { ageMin: 0, ageMax: 4, fromMin: 180, toMin: 660, exitMin: 660 },
  'âge 5-24, 8h-12h': { ageMin: 5, ageMax: 24, fromMin: 480, toMin: 720, exitMin: 720 },
  'âge 5-12, 9h30-11h': { ageMin: 5, ageMax: 12, fromMin: 570, toMin: 660, exitMin: 660 },
  'âge 5-12, 3h-9h30': { ageMin: 5, ageMax: 12, fromMin: 180, toMin: 570, exitMin: 660 },
};
export const FILTERS = {
  aucun: { fam: 'B', f: null },
  'tendance 20 j': { fam: 'A', f: (f) => f.trend20 > 0 },
  '4 h en faveur': { fam: 'A', f: (f) => f.r4h > 0 },
  'tendance 20 j + 4 h': { fam: 'A', f: (f) => f.trend20 > 0 && f.r4h > 0 },
  'tendance 20 j + 4 h + veille prise': { fam: 'A', f: (f) => f.trend20 > 0 && f.r4h > 0 && f.sweepPrevDay === 1 },
  'modèle de ses choix (tiers haut)': { fam: 'A', f: (f) => modelScore(f) > MODEL.threshold },
  'achats seulement': { fam: 'B', f: (f) => f.long === 1 },
  'achats + tendance 20 j': { fam: 'B', f: (f) => f.long === 1 && f.trend20 > 0 },
};
export const MGMT = {
  'marché, stop 1 ATR, 3R': { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 3 },
  'marché, stop 1 ATR, 2R': { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 2 },
  'marché, stop 1 ATR, 3R, 4 h max': { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 3, hold: 4 * HOUR },
  'limite au bord, stop 1 ATR, 3R': { entry: 'limit', stop: { type: 'atr', k: 1 }, rr: 3 },
  'marché, stop derrière la zone, 3R': { entry: 'market', stop: { type: 'zone' }, rr: 3 },
  'marché, stop 0,5 ATR, 4R': { entry: 'market', stop: { type: 'atr', k: 0.5 }, rr: 4 },
};

/** Paramètres complets de ruleTrades pour une variante (spreadMult : 1 = coûts du projet, 2 = test de résistance). */
export function paramsFor(sym, window, filter, mgmt, { spreadMult = 1 } = {}) {
  const W = WINDOWS[window], F = FILTERS[filter], M = MGMT[mgmt];
  if (!W || !F || !M) throw new Error(`variante inconnue : ${window} / ${filter} / ${mgmt}`);
  return { ...M, filter: F.f, exit: M.hold ? { type: 'hold', ms: M.hold } : { type: 'ny', min: W.exitMin }, spreadAt: (p) => spreadAt(sym, p, spreadMult), swap: swapCost(sym) };
}
