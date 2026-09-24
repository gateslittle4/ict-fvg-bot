// entryPolicy.js - les règles qui transforment un signal en ordre réel, écrites UNE fois et utilisées à la fois par le bot
// (cTraderDataSource.js) et par le rejeu fidèle (scripts/runLiveReplay.js) (2026-09-24, Esdras : « un seul moteur pour le backtest et le
// bot »). Pur : aucune dépendance au courtier, testé dans test/entryPolicy.test.js.
import { adjustMarketProtectionForSpread } from './marketProtection.js';
import { ORB_STRATEGY, NOISE_STRATEGY } from '../intradayMomentumEngine.js';

export { ORB_STRATEGY, NOISE_STRATEGY };
export const DAILY_RSI2_STRATEGY = 'rsi2-daily';
// Stratégies qui ouvrent ET ferment leur position réelle elles-mêmes (une seule position par paire, toutes stratégies confondues).
export const MANAGED_SOURCES = new Set([DAILY_RSI2_STRATEGY, ORB_STRATEGY, NOISE_STRATEGY]);

/**
 * Pourquoi une entrée (combo ou stratégie gérée) est refusée, ou null si elle peut passer à l'exécution.
 * - Une stratégie gérée (RSI(2), A, B) tient déjà une position réelle sur la paire : tout le monde attend, sauf RSI(2) contre sa propre
 *   position (son entrée arrive avant que le suivi ne soit posé).
 * - Filet de sécurité : la jambe (stratégie + paire) est arrêtée.
 * @param {{ source: string, heldBy?: string|null, legAllowed?: boolean }} p
 */
export function entryBlockReason({ source, heldBy = null, legAllowed = true }) {
  if (heldBy && !(source === DAILY_RSI2_STRATEGY && heldBy === DAILY_RSI2_STRATEGY)) {
    return heldBy === DAILY_RSI2_STRATEGY ? 'daily strategy already holds a position on this symbol' : `${heldBy} already holds a position on this symbol`;
  }
  if (!legAllowed) return 'kill switch: leg stopped (drawdown > 1.5x its worst 2010-2022 drawdown, or stopped by hand)';
  return null;
}

/**
 * A et B, avant de construire l'ordre : l'interrupteur, la place (stratégie gérée ou combo), le garde-fou partagé.
 * @returns {string|null} la raison du refus, ou null
 */
export function momentumEntryBlockReason({ strategyEnabled = true, heldBy = null, comboHolds = false, guardrailOk = true }) {
  if (!strategyEnabled) return 'stratégie désactivée (interrupteur, page Comptes)';
  if (heldBy) return `${heldBy} already holds a position on this symbol`;
  if (comboHolds) return 'the combo already holds a position on this symbol';
  if (!guardrailOk) return 'blocked by shared guardrail';
  return null;
}

/**
 * Le signal d'ordre de A ou B (config CONFIG.intradayMomentum), à partir de l'événement du moteur et du prix courant.
 * A : stop à l'extrême de la bougie de 5 min, objectif rr x R depuis le vrai prix d'entrée (ask pour un achat), refusé si R < minStopSpreads
 *     x spread. B : pas d'objectif, stop de secours à k écarts-types journaliers, taille calculée sur UN écart-type (sizingStopPrice).
 * Les deux : exposition plafonnée à maxLeverage x le solde (maxNotional, en monnaie du compte ; l'appelant le convertit en lots ou en unités).
 * @returns {{ signal?: object, maxNotional?: number, skip?: string }}
 */
export function momentumOrderSignal(ev, { bid, spread = 0, balance, cfg = {} }) {
  const buy = ev.side === 'buy';
  const fill = buy ? bid + spread : bid;
  const maxNotional = (cfg.maxLeverage ?? 4) * balance;
  if (ev.strategy === ORB_STRATEGY) {
    const R = buy ? fill - ev.stopPrice : ev.stopPrice - fill;
    if (!(R > 0) || R < (cfg.orb?.minStopSpreads ?? 3) * spread) return { skip: `stop too tight or crossed (R=${R}, spread=${spread})` };
    const rr = cfg.orb?.rrMultiple ?? 10;
    return { signal: { stopPrice: ev.stopPrice, targetPrice: buy ? fill + rr * R : fill - rr * R, distance: R }, maxNotional };
  }
  if (!(ev.vol14 > 0)) return { skip: 'no 14-session volatility yet' };
  const unit = ev.vol14 * bid; // un écart-type journalier, en prix
  const k = cfg.noise?.emergencyStopVolMultiple ?? 3;
  return { signal: { stopPrice: buy ? bid - k * unit : bid + k * unit, sizingStopPrice: buy ? bid - unit : bid + unit, targetPrice: null, distance: unit }, maxNotional };
}

/**
 * Stop et objectif réellement envoyés, et le stop sur lequel la taille est calculée.
 * Ordre au marché : stop élargi du spread et objectif rapproché (voir adjustMarketProtectionForSpread) ; ordre LIMIT (FVG) : inchangés.
 * B (sizingStopPrice) : la taille se calcule sur son unité de volatilité, pas sur son stop de secours lointain.
 */
export function orderProtection(signal, { spread, isLimit = false }) {
  const protection = isLimit
    ? { stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, spreadApplied: 0 }
    : adjustMarketProtectionForSpread({ side: signal.suggestedSide, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, spread });
  return { protection, sizingStopPrice: signal.sizingStopPrice ?? protection.stopPrice };
}

/** Plafonne une taille (en lots) à maxLots, au pas de volume du symbole ; le risque réel suit la même proportion. */
export function capLots(sizing, maxLots, spec = {}) {
  if (!(Number.isFinite(maxLots) && maxLots > 0 && sizing.lots > maxLots)) return sizing;
  const step = spec.volumeStep || 0.01;
  const capped = Math.max(spec.minVolume || step, Math.floor(maxLots / step) * step);
  return { ...sizing, actualRiskAmount: sizing.actualRiskAmount * (capped / sizing.lots), lots: Number(capped.toFixed(6)) };
}
