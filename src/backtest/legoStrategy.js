// legoStrategy.js
// "Lego de stratégies" (2026-09-19, roadmap n° 3): build your own strategy from blocks in the
// Labo instead of asking for code. A RECIPE is
//   a trigger      - one of the Labo's mechanisms (its entries and stops),
//   + filters      - a session window, weekdays, a direction, a higher-timeframe bias, the
//                    market-structure filter, the liquidity-sweep confluence,
//   + an exit      - optionally another R:R,
//   + the bot's guardrails - optionally the same daily rules the live bot applies.
// and it is judged exactly like every other strategy of the Labo (same costs, same
// train/test split, same statistics), next to the bare trigger so the effect of the
// blocks is visible.
//
// HONEST LIMITS (also written on the page):
//  - Filters are applied to the trades AFTER the trigger has produced them, at the entry
//    candle. A trade removed by a filter does not free the slot for the next signal the
//    way an in-engine filter would (the live FVG filters ARE in-engine, see
//    liveFvgRunner.js) - so a filtered recipe can differ a little from the same rules
//    coded into the engine.
//  - Another R:R replaces the trigger's own exit: fine for fixed-R:R mechanisms (most of
//    them), a different strategy altogether for trend-followers or level-to-level ones.
//  - Every recipe tried is one more chance of finding a flattering result by luck; the
//    page counts them.

import { LAB_STRATEGIES, listLabStrategies } from './labRegistry.js';
import { buildMultiTouchFilterPredicate } from './fvgMultiTouch.js';
import { HTF_TIMEFRAMES, EMA_PERIODS } from './gridRunner.js';
import { applyTransactionCosts } from './labRunner.js';
import { applyGuardrailsToDay, normalizeGuardrails } from './labAnalytics.js';
import { ImportError } from './m1Import.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HOLD_CANDLES = 480; // the M15 timeout convention used by every strategy here

const numberIn = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ImportError(`${name} : valeur invalide (entre ${min} et ${max}).`);
  return n;
};

/** Validates what the browser sends; throws ImportError (-> HTTP 400). */
export function normalizeRecipe(raw = {}) {
  if (!LAB_STRATEGIES[raw.trigger]) throw new ImportError(`Déclencheur inconnu: "${raw.trigger}"`);
  const recipe = { trigger: raw.trigger, session: null, weekdays: null, direction: 'both', bias: 'baseline', structure: false, sweep: false, rr: null, guardrails: null };
  if (raw.session) {
    const startHour = numberIn(raw.session.startHour, 'Début de fenêtre', 0, 23.75);
    const endHour = numberIn(raw.session.endHour, 'Fin de fenêtre', 0.25, 24);
    if (endHour <= startHour) throw new ImportError('La fin de la fenêtre doit être après son début.');
    recipe.session = { startHour, endHour };
  }
  if (raw.weekdays !== undefined && raw.weekdays !== null) {
    if (!Array.isArray(raw.weekdays) || raw.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ImportError('Jours de la semaine invalides.');
    const days = [...new Set(raw.weekdays)];
    if (days.length === 0) throw new ImportError('Coche au moins un jour de la semaine.');
    recipe.weekdays = days.length === 7 ? null : days;
  }
  if (raw.direction !== undefined && raw.direction !== 'both') {
    if (raw.direction !== 'bullish' && raw.direction !== 'bearish') throw new ImportError('Sens inconnu.');
    recipe.direction = raw.direction;
  }
  if (raw.bias !== undefined && raw.bias !== 'baseline') {
    const [tf, ema] = String(raw.bias).split('_EMA');
    if (!HTF_TIMEFRAMES.some((t) => t.key === tf) || !EMA_PERIODS.includes(Number(ema))) throw new ImportError('Biais HTF inconnu (ex. H4_EMA200).');
    recipe.bias = String(raw.bias);
  }
  recipe.structure = raw.structure === true || raw.structure === 'true';
  recipe.sweep = raw.sweep === true || raw.sweep === 'true';
  if (raw.rr !== undefined && raw.rr !== null && raw.rr !== '') recipe.rr = numberIn(raw.rr, 'Objectif (R:R)', 0.5, 10);
  if (raw.guardrails) recipe.guardrails = normalizeGuardrails(raw.guardrails);
  return recipe;
}

/** A short French sentence describing a recipe, for labels and the "ideas graveyard". */
export function describeRecipe(r) {
  const trigger = listLabStrategies().find((s) => s.id === r.trigger)?.label ?? r.trigger;
  const parts = [trigger];
  if (r.session) parts.push(`session ${r.session.startHour}h–${r.session.endHour}h`);
  if (r.weekdays) parts.push(`jours ${r.weekdays.map((d) => ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][d]).join('/')}`);
  if (r.direction !== 'both') parts.push(r.direction === 'bullish' ? 'achats seulement' : 'ventes seulement');
  if (r.bias !== 'baseline') parts.push(`biais ${r.bias.replace('_EMA', ' EMA ')}`);
  if (r.structure) parts.push('structure');
  if (r.sweep) parts.push('balayage de liquidité');
  if (r.rr !== null) parts.push(`objectif 1:${r.rr}`);
  if (r.guardrails) parts.push('garde-fous du bot');
  return parts.join(' + ');
}

/**
 * Replays a trade's exit with another R:R from the candles after its entry: same entry and
 * stop, target at rr x the stop distance, the stop wins a tie inside one candle (the
 * project's conservative convention), timeout after MAX_HOLD_CANDLES at the close.
 * @returns {object} the trade with exit fields and rMultiple replaced, or null if it cannot be replayed
 */
export function resimulateExit(candles, t, rr) {
  if (!(t.distance > 0) || !Number.isInteger(t.entryIndex)) return null;
  const bullish = t.direction === 'bullish';
  const target = bullish ? t.entryPrice + rr * t.distance : t.entryPrice - rr * t.distance;
  for (let i = t.entryIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const hitStop = bullish ? c.low <= t.stopPrice : c.high >= t.stopPrice;
    const hitTarget = bullish ? c.high >= target : c.low <= target;
    const timedOut = i - t.entryIndex >= MAX_HOLD_CANDLES;
    if (hitStop) return { ...t, targetPrice: target, exitIndex: i, exitTime: c.time, exitPrice: t.stopPrice, outcome: 'loss', rMultiple: -1 };
    if (hitTarget) return { ...t, targetPrice: target, exitIndex: i, exitTime: c.time, exitPrice: target, outcome: 'win', rMultiple: rr };
    if (timedOut) {
      const move = bullish ? c.close - t.entryPrice : t.entryPrice - c.close;
      return { ...t, targetPrice: target, exitIndex: i, exitTime: c.time, exitPrice: c.close, outcome: 'timeout', rMultiple: move / t.distance };
    }
  }
  return null; // the data ends before the trade resolves
}

/** The engine-time weekday (0 = Sunday) of a trade's entry, as the rest of the Labo reads it. */
const entryWeekday = (t) => new Date(t.entryTime).getUTCDay();

/**
 * Runs a recipe over a candle series.
 * @returns {{rawCount:number, afterFilters:number, droppedAsNonViable:number, guardrailSkipped:number, trades:Array}}
 *   trades in the compact shape src/shared/tradeStats.js reads
 */
export function runRecipe(candles, symbol, spread, recipe) {
  const raw = LAB_STRATEGIES[recipe.trigger].run(candles);

  // Filters that need the market (session, bias, structure, sweep) are the very builders the live
  // FVG filters use, evaluated at the entry candle.
  const marketFilter = recipe.session || recipe.bias !== 'baseline' || recipe.structure || recipe.sweep
    ? buildMultiTouchFilterPredicate(candles, symbol, {
      variant: recipe.bias,
      structureEnabled: recipe.structure,
      sessionEnabled: Boolean(recipe.session),
      sessionWindow: recipe.session ?? undefined,
      liquiditySweepEnabled: recipe.sweep,
    })
    : null;
  let kept = raw.filter((t) => {
    if (recipe.direction !== 'both' && t.direction !== recipe.direction) return false;
    if (recipe.weekdays && !recipe.weekdays.includes(entryWeekday(t))) return false;
    if (marketFilter && !marketFilter({ time: t.entryTime }, { direction: t.direction })) return false;
    return true;
  });
  const afterFilters = kept.length;

  if (recipe.rr !== null) kept = kept.map((t) => resimulateExit(candles, t, recipe.rr)).filter(Boolean);
  const costed = applyTransactionCosts(kept, symbol, spread);

  let final = costed;
  let guardrailSkipped = 0;
  if (recipe.guardrails) {
    // Per exit-day, like the challenge simulation, with the bot's real daily rules (risk = 1 % only scales the daily-loss gate).
    const byDay = new Map();
    for (const t of costed) {
      const d = Math.floor((t.exitTime ?? t.entryTime) / DAY_MS);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push({ src: t, entryTime: t.entryTime, exitTime: t.exitTime ?? t.entryTime, r: t.rMultiple });
    }
    final = [];
    for (const list of byDay.values()) for (const k of applyGuardrailsToDay(list, recipe.guardrails, 1)) final.push(k.src);
    guardrailSkipped = costed.length - final.length;
    final.sort((a, b) => a.entryTime - b.entryTime);
  }

  return {
    rawCount: raw.length,
    afterFilters,
    droppedAsNonViable: kept.length - costed.length,
    guardrailSkipped,
    trades: final.map((t) => ({
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      r: +t.rMultiple.toFixed(4),
      direction: t.direction,
      outcome: t.outcome,
      distance: +t.distance.toPrecision(6),
      entryPrice: +t.entryPrice.toPrecision(7),
      holdCandles: t.exitIndex - t.entryIndex,
    })),
  };
}
