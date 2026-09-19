// liveFvgRunner.js
// "Ma stratégie live" (2026-09-19, Esdras: "tu me codes ma propre stratégie qui est
// live ... tous les statistiques possibles ... plusieurs options de combinaison").
// The strategy the bot really trades - the filtered FVG per symbol in
// CONFIG.fvg.perSymbol (HTF bias + market structure + NY session + liquidity sweep,
// "multi-touch" zones, a fixed R:R) - run over the historical data with EXACTLY the
// engine construction LiveStrategyEngine._buildFvgEngine() uses, so what the page
// analyses is what the bot does, not a look-alike.
//
// A "variant" is the live config with a few things changed (one filter switched
// off, another R:R, another session window...), which is how the page offers
// combinations: every variant runs through the same code path and is judged the
// same way, so they can be compared like for like.

import { CONFIG } from '../config.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from './fvgMultiTouch.js';
import { buildFilteredEngine, HTF_TIMEFRAMES, EMA_PERIODS, STOP_MODES } from './gridRunner.js';
import { runBacktest } from './backtestEngine.js';
import { applyTransactionCosts } from './labRunner.js';
import { ImportError } from './m1Import.js';

export const MAX_VARIANTS_PER_RUN = 8;

/** Symbols the bot really runs the FVG mechanism on (a symbol without a config has no "live strategy" to analyse). */
export function liveFvgSymbols() {
  return Object.keys(CONFIG.fvg.perSymbol);
}

export function liveFvgConfig(symbol) {
  return CONFIG.fvg.perSymbol[symbol] ?? null;
}

const RAW = { variant: 'baseline', structureEnabled: false, sessionEnabled: false, liquiditySweepEnabled: false, multiTouch: false };

/** Ready-made combinations, each described as "the live config, except for...". */
export const LIVE_VARIANTS = [
  { id: 'live', group: 'Référence', label: 'Configuration live (telle que le bot la trade)', overrides: {} },
  { id: 'raw', group: 'Référence', label: 'FVG brut : aucun filtre', overrides: RAW },
  { id: 'no-htf', group: 'Sans un filtre', label: 'Sans le biais de la timeframe supérieure', overrides: { variant: 'baseline' } },
  { id: 'no-structure', group: 'Sans un filtre', label: 'Sans le filtre de structure (BOS)', overrides: { structureEnabled: false } },
  { id: 'no-session', group: 'Sans un filtre', label: 'Sans le filtre de session (toute la journée)', overrides: { sessionEnabled: false } },
  { id: 'no-sweep', group: 'Sans un filtre', label: 'Sans la confluence de balayage de liquidité', overrides: { liquiditySweepEnabled: false } },
  { id: 'single-touch', group: 'Zones', label: 'Contact unique (au lieu de multi-contact)', overrides: { multiTouch: false } },
  { id: 'multi-touch', group: 'Zones', label: 'Multi-contact (même si le live est en contact unique)', overrides: { multiTouch: true } },
  { id: 'rr-2', group: 'Objectif', label: 'Objectif 1:2', overrides: { rrMultiple: 2 } },
  { id: 'rr-3', group: 'Objectif', label: 'Objectif 1:3', overrides: { rrMultiple: 3 } },
  { id: 'rr-4', group: 'Objectif', label: 'Objectif 1:4', overrides: { rrMultiple: 4 } },
  { id: 'rr-5', group: 'Objectif', label: 'Objectif 1:5', overrides: { rrMultiple: 5 } },
  { id: 'rr-6', group: 'Objectif', label: 'Objectif 1:6', overrides: { rrMultiple: 6 } },
  { id: 'stop-fvg', group: 'Stop', label: 'Stop au bord de la zone FVG', overrides: { stopMode: 'fvg-edge' } },
  { id: 'stop-swing', group: 'Stop', label: 'Stop au dernier swing', overrides: { stopMode: 'swing' } },
  { id: 'win-8-12', group: 'Fenêtre', label: 'Session 8h–12h (New York)', overrides: { sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } } },
  { id: 'win-10-11', group: 'Fenêtre', label: 'Session 10h–11h (Silver Bullet)', overrides: { sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } } },
  { id: 'win-7-10', group: 'Fenêtre', label: 'Session 7h–10h (chevauchement Londres–New York)', overrides: { sessionEnabled: true, sessionWindow: { startHour: 7, endHour: 10 } } },
];

const num = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ImportError(`${name} : valeur invalide (entre ${min} et ${max}).`);
  return n;
};

/**
 * Validates a hand-built variant (the "construire la mienne" form). Only known
 * keys, only sane values - it ends up driving real engine constructors.
 * @returns {object} overrides
 */
export function normalizeCustomOverrides(raw = {}) {
  const o = {};
  if (raw.variant !== undefined) {
    if (raw.variant !== 'baseline') {
      const [tf, ema] = String(raw.variant).split('_EMA');
      if (!HTF_TIMEFRAMES.some((t) => t.key === tf) || !EMA_PERIODS.includes(Number(ema))) throw new ImportError('Biais HTF inconnu (ex. H4_EMA200, H1_EMA50 ou baseline).');
    }
    o.variant = String(raw.variant);
  }
  for (const flag of ['structureEnabled', 'sessionEnabled', 'liquiditySweepEnabled', 'multiTouch']) {
    if (raw[flag] !== undefined) o[flag] = raw[flag] === true || raw[flag] === 'true';
  }
  if (raw.rrMultiple !== undefined) o.rrMultiple = num(raw.rrMultiple, 'Objectif (R:R)', 0.5, 10);
  if (raw.stopMode !== undefined) {
    if (!STOP_MODES.includes(raw.stopMode)) throw new ImportError('Mode de stop inconnu.');
    o.stopMode = raw.stopMode;
  }
  if (raw.sessionWindow !== undefined) {
    const startHour = num(raw.sessionWindow.startHour, 'Début de fenêtre', 0, 23.75);
    const endHour = num(raw.sessionWindow.endHour, 'Fin de fenêtre', 0.25, 24);
    if (endHour <= startHour) throw new ImportError('La fin de la fenêtre doit être après son début.');
    o.sessionWindow = { startHour, endHour };
  }
  return o;
}

/** The effective config of a variant on a symbol (live config + overrides). */
export function resolveVariantConfig(symbol, overrides = {}) {
  const live = liveFvgConfig(symbol);
  if (!live) throw new ImportError(`${symbol} n'a pas de configuration FVG live : rien à analyser ici.`);
  return { ...live, ...overrides };
}

/** Same engine construction as LiveStrategyEngine._buildFvgEngine(). */
function buildEngine(candles, symbol, cfg) {
  if (cfg.multiTouch) {
    return new MultiTouchFvgEngine({ symbol, checkFilters: buildMultiTouchFilterPredicate(candles, symbol, cfg) });
  }
  return buildFilteredEngine(candles, symbol, cfg).engine;
}

/**
 * Runs one config over the candles and returns the net-of-costs trades in the
 * compact shape src/shared/tradeStats.js works on.
 */
export function runLiveFvg(candles, symbol, cfg, spread = null) {
  const raw = runBacktest({ candles, symbol, fvgEngine: buildEngine(candles, symbol, cfg), stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
  const net = applyTransactionCosts(raw, symbol, spread);
  return {
    rawCount: raw.length,
    droppedAsNonViable: raw.length - net.length,
    trades: net.map((t) => ({
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      r: +t.rMultiple.toFixed(4),
      direction: t.direction,
      outcome: t.outcome,
      // Rounded: a variants comparison ships thousands of trades to the browser.
      distance: +t.distance.toPrecision(6),
      entryPrice: +t.entryPrice.toPrecision(7),
      holdCandles: t.exitIndex - t.entryIndex,
    })),
  };
}

/** What the page shows about a config: the parts that define it, without engine internals. */
export function describeConfig(cfg) {
  return {
    bias: cfg.variant ?? 'baseline',
    structure: Boolean(cfg.structureEnabled),
    session: cfg.sessionEnabled ? cfg.sessionWindow ?? null : null,
    sweep: Boolean(cfg.liquiditySweepEnabled),
    multiTouch: Boolean(cfg.multiTouch),
    rr: cfg.rrMultiple,
    stopMode: cfg.stopMode,
  };
}
