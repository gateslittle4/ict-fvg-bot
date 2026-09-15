// liveFvgFilterStatus.js
// "Pourquoi on n'a pas encore de trade" (2026-09-15, Esdras, en creusant
// pourquoi US100/US500/XAUUSD n'ont encore jamais tradé cette session-ci) -
// pour chaque zone FVG actuellement 'watching', évalue chacun des 4 filtres
// que la stratégie réelle applique (biais HTF, structure, fenêtre de
// session, sweep de liquidité) EN CE MOMENT, un par un, plutôt que le seul
// ✓/✗ combiné que le moteur live calcule - c'est exactement ce qui manque
// pour répondre à "elle est bonne pourquoi ça ne valide pas".
//
// Même discipline que tradeCompliance.js (voisin, pour un trade CLOS après
// coup) : réutilise les VRAIES fonctions de production (buildHtfBiasSeries,
// buildStructureBiasSeries, isInNySessionWindow, buildLiquiditySweepEvents -
// les mêmes lookups que buildFilteredEngine()/buildMultiTouchFilterPredicate()
// consomment réellement en live), jamais une réimplémentation séparée qui
// pourrait diverger. Contrairement à tradeCompliance.js qui évalue "au
// moment de l'entrée" (figé, passé), ceci évalue "maintenant" (mobile,
// se rafraîchit à chaque bougie) - c'est la seule vraie différence.

import { buildHtfBiasSeries, makeBiasLookup } from './htfBias.js';
import { buildStructureBiasSeries, makeStructureBiasLookup } from './marketStructure.js';
import { isInNySessionWindow } from './nySession.js';
import { buildLiquiditySweepEvents, makeSweepLookup } from './liquiditySweep.js';
import { STRUCTURE_LOOKBACK, SWEEP_LOOKBACK, SWEEP_WINDOW_CANDLES } from './gridRunner.js';
import { computeHtfBiasAtEntry, BIAS_LABEL } from '../dataSources/tradeCompliance.js';

const TIMEFRAME_DURATION_MS_M15 = 15 * 60 * 1000; // sweepWindowCandles is expressed in M15 candles by gridRunner.js's own convention (same one buildFilteredEngine/buildMultiTouchFilterPredicate use) - correct for the real strategy symbols (US100/US500/XAUUSD/EURUSD/GER40 all run M15), not meant to generalize to a non-M15 symbol.

/**
 * @param {object} opts
 * @param {Array} opts.candles - the symbol's own retained M15 history (same one chartOverlays.js already has, no extra fetch)
 * @param {Array|null} opts.h1Candles - real H1 candles ending at/after `atTime`, only needed when cfg.variant isn't 'baseline'; null/empty degrades that one item to "non vérifiable"
 * @param {object} opts.cfg - CONFIG.fvg.perSymbol[symbol]
 * @param {'bullish'|'bearish'} opts.direction - the pending zone's own direction
 * @param {number} opts.atTime - usually "now" (the latest candle's time) - evaluate every filter as of this instant
 * @returns {Array<{key: string, applicable: boolean, ok?: boolean, label: string, detail: string}>}
 */
export function evaluateLiveFilters({ candles, h1Candles, cfg, direction, atTime }) {
  const items = [];

  // Biais haute unité de temps
  const variant = cfg.variant;
  if (!variant || variant === 'baseline') {
    items.push({ key: 'bias', applicable: false, label: 'Biais haute unité de temps', detail: "Non applicable — pas de filtre de biais configuré pour ce symbole" });
  } else if (!h1Candles || h1Candles.length === 0) {
    items.push({ key: 'bias', applicable: false, label: `Biais ${variant.replace('_', '/')}`, detail: 'Non vérifiable (historique H1 non récupéré)' });
  } else {
    const bias = computeHtfBiasAtEntry(h1Candles, variant, atTime);
    const matches = bias === direction;
    items.push({
      key: 'bias', applicable: true, ok: matches, label: `Biais ${variant.replace('_', '/')}`,
      detail: `${BIAS_LABEL[bias] || 'Inconnu'} en ce moment — ${matches ? 'conforme' : 'ne correspond pas'} au sens de la zone`,
    });
  }

  // Structure de marché
  if (cfg.structureEnabled) {
    const structureLookup = makeStructureBiasLookup(buildStructureBiasSeries(candles, { lookback: STRUCTURE_LOOKBACK }));
    const structBias = structureLookup(atTime);
    const matches = structBias === direction;
    items.push({
      key: 'structure', applicable: true, ok: matches, label: 'Structure de marché',
      detail: `${BIAS_LABEL[structBias] || 'Neutre'} en ce moment — ${matches ? 'conforme' : 'ne correspond pas'} au sens de la zone`,
    });
  } else {
    items.push({ key: 'structure', applicable: false, label: 'Structure de marché', detail: 'Non applicable — pas configuré pour ce symbole' });
  }

  // Fenêtre de session
  if (cfg.sessionEnabled) {
    const window = cfg.sessionWindow || {};
    const ok = isInNySessionWindow(atTime, window.startHour, window.endHour);
    items.push({
      key: 'session', applicable: true, ok, label: 'Fenêtre de session',
      detail: ok ? `Dans la fenêtre (${window.startHour}h–${window.endHour}h, heure NY)` : `Hors fenêtre — attend ${window.startHour}h–${window.endHour}h (heure NY)`,
    });
  } else {
    items.push({ key: 'session', applicable: false, label: 'Fenêtre de session', detail: 'Non applicable — pas de fenêtre configurée pour ce symbole' });
  }

  // Sweep de liquidité
  if (cfg.liquiditySweepEnabled) {
    const sweepLookup = makeSweepLookup(
      buildLiquiditySweepEvents(candles, { lookback: SWEEP_LOOKBACK }),
      { windowMs: SWEEP_WINDOW_CANDLES * TIMEFRAME_DURATION_MS_M15 }
    );
    const ok = sweepLookup(atTime, direction);
    items.push({
      key: 'sweep', applicable: true, ok, label: 'Sweep de liquidité récent',
      detail: ok ? 'Un sweep récent confirme le sens de la zone' : "Pas encore de sweep récent dans le bon sens",
    });
  } else {
    items.push({ key: 'sweep', applicable: false, label: 'Sweep de liquidité', detail: 'Non applicable — pas configuré pour ce symbole' });
  }

  return items;
}

// Kept in sync with tradeCompliance.js's requiredH1LookbackCandles() - same
// export, just re-exported here so callers of THIS file don't need to know
// the H1 fetch actually lives in that neighboring module. Not re-implemented.
export { requiredH1LookbackCandles } from '../dataSources/tradeCompliance.js';
