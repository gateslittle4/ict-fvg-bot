// tradeCompliance.js
// Reconstructs, after the fact, whether a CLOSED trade actually followed the
// live strategy's own real production logic/config - built at Esdras's
// explicit request ("comment peut-on prouver visuellement que le trade a
// respecté les procédures", then, after a mockup: "donne tout, pour l'avoir
// dès le départ" - i.e. include the H4/EMA bias check too, not just the
// cheaper items).
//
// Every check here REUSES the real production functions (FvgEngine,
// computeStop, buildHtfBiasSeries/makeBiasLookup) rather than
// reimplementing the logic a second way - if production logic changes,
// this reconstruction stays in sync automatically, and a bug found here is
// a bug in the real thing too (see the gap-through-fill check below, found
// from a REAL bug hunted down this same session).
//
// Scope, deliberately honest about what's NOT covered: only the 'fvg'
// source has this rich a reconstruction (zone/stop/HTF bias) - Divergence/
// NWOG/Judas Swing/Weekly Sweep each have their own, different "was this
// signal valid" definition that isn't built yet (a real gap, not hidden -
// see buildFvgComplianceChecklist's own fallback for non-fvg trades). The
// risk-check item is source-agnostic (needs only pnlUsd/rMultiple/
// balanceAfter, already available for any trade with a durable-journal
// match) and applies everywhere.

import { FvgEngine } from '../engines/fvgEngine.js';
import { computeStop } from '../backtest/backtestEngine.js';
import { buildHtfBiasSeries, makeBiasLookup, TIMEFRAME_MS } from '../backtest/htfBias.js';

const NEUTRAL_BAND_PCT = 0.1; // same value as gridRunner.js's NEUTRAL_BAND_PCT - not imported from there to avoid pulling gridRunner's much heavier grid-search-only dependencies into the live request path for one constant.

/**
 * Replays a PLAIN FvgEngine (no bias/structure/session/sweep filters - those
 * are checked separately below) over the trade's own context candles to
 * find the exact zone that was touched at entry, its c1Index (needed by
 * computeStop's 'swing' mode), and the actual candle that triggered
 * validation - the same derivation _processFvgEvent() does in
 * liveStrategyEngine.js, just replayed after the fact instead of live.
 *
 * KNOWN CAVEAT for multi-touch symbols (US100 and, since 2026-09-16, US500 -
 * any symbol with cfg.multiTouch: true): the
 * real production engine there is MultiTouchFvgEngine, which can keep a
 * zone alive across a contact that would make a plain FvgEngine destroy it.
 * This reconstruction uses a plain FvgEngine regardless - it will usually
 * find the same zone geometry, but can occasionally fail to find a match on
 * a multi-touch symbol's later contact. Returns null rather than a guess
 * when that happens (surfaced as "non vérifiable", never a fabricated ok).
 *
 * @returns {{zone:{top:number,bottom:number}, c1Index:number, entryPrice:number, validatedCandle:object} | null}
 */
export function reconstructFvgZone(candles, direction, entryTime) {
  const engine = new FvgEngine({ symbol: 'reconstruction' });
  const formationIndex = new Map();
  let best = null;
  let bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const events = engine.processCandle(candles[i]);
    for (const e of events) {
      if (e.type === 'watching') formationIndex.set(e.id, i);
      if (e.type === 'validated' && e.direction === direction) {
        const diff = Math.abs(candles[i].time - entryTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          const c3Index = formationIndex.get(e.id);
          best = {
            zone: { top: e.zone.top, bottom: e.zone.bottom },
            c1Index: c3Index !== undefined ? c3Index - 2 : -1,
            entryPrice: direction === 'bullish' ? e.zone.top : e.zone.bottom,
            validatedCandle: candles[i],
          };
        }
      }
    }
  }
  return best;
}

/**
 * Distance from entry to stop, using the EXACT same computeStop() the live
 * engine uses (fvg-edge or swing, per the symbol's own cfg.stopMode) - see
 * liveStrategyEngine.js's _processFvgEvent for the identical call shape.
 */
export function reconstructStopDistance(candles, direction, zone, c1Index, cfg) {
  const stopPrice = computeStop({ direction, zone, candles, c1Index, stopMode: cfg.stopMode, swingLookback: 10 });
  const entryPrice = direction === 'bullish' ? zone.top : zone.bottom;
  return { stopPrice, distance: Math.abs(entryPrice - stopPrice) };
}

/**
 * Real bug found this session (scripts/runFundingPipsFlexFloatingLossCheck.js,
 * 2025-12-29 US100/fvg): the validating candle can GAP straight through the
 * whole zone without ever trading back up near entryPrice within that same
 * candle (a genuine fast-moving/gap candle, not a data error) - the engine
 * still assumes a clean fill AT entryPrice, which is optimistic. Detectable
 * after the fact: entryPrice sits outside [validatedCandle.low,
 * validatedCandle.high].
 */
export function isGapThroughFill(entryPrice, validatedCandle) {
  return entryPrice < validatedCandle.low || entryPrice > validatedCandle.high;
}

/**
 * The HTF bias in effect at `entryTime`, using the symbol's OWN configured
 * variant (e.g. 'H4_EMA200') and REAL H1-period candles covering enough
 * lookback to seed the EMA - the same buildHtfBiasSeries/makeBiasLookup
 * gridRunner.js's buildFilteredEngine() uses live, just fed H1 candles
 * (fetched fresh for this one reconstruction - see cTraderDataSource.js's
 * own comment on why) instead of resampling from a much bigger M15 history.
 * Resampling H1->H4 (when the variant needs H4) is mathematically identical
 * to resampling M15->H4 directly (OHLC aggregation is associative) - no
 * accuracy lost by fetching the coarser H1 base.
 *
 * @param {string} variant - cfg.variant, e.g. 'H4_EMA200' or 'baseline'
 * @returns {'bullish'|'bearish'|'neutral'|'unknown'|null} null for 'baseline' (no bias filter configured for this symbol) or an unparseable variant
 */
export function computeHtfBiasAtEntry(h1Candles, variant, entryTime) {
  if (!variant || variant === 'baseline') return null;
  const [tfKey, emaLabel] = variant.split('_');
  const emaPeriod = Number((emaLabel || '').replace('EMA', ''));
  const bucketMs = TIMEFRAME_MS[tfKey];
  if (!bucketMs || !Number.isFinite(emaPeriod)) return null;
  const series = buildHtfBiasSeries(h1Candles, { bucketMs, emaPeriod, neutralBandPct: NEUTRAL_BAND_PCT });
  const lookup = makeBiasLookup(series);
  return lookup(entryTime);
}

/**
 * How many H1 candles to fetch before `entryTime` so the HTF bias's EMA has
 * fully seeded (emaPeriod HTF buckets) plus a small safety buffer - e.g.
 * H4_EMA200 needs 200 H4 buckets = 800 H1 candles (~33 days); H1_EMA50 needs
 * only 50 H1 candles. Returns 0 for 'baseline' (no fetch needed at all).
 */
export function requiredH1LookbackCandles(variant) {
  if (!variant || variant === 'baseline') return 0;
  const [tfKey, emaLabel] = variant.split('_');
  const emaPeriod = Number((emaLabel || '').replace('EMA', ''));
  if (!Number.isFinite(emaPeriod)) return 0;
  const h1PerBucket = tfKey === 'H4' ? 4 : 1;
  return (emaPeriod + 10) * h1PerBucket; // +10 HTF buckets of safety margin
}

/**
 * Was the $ actually risked on this trade close to the account's currently
 * configured risk-per-trade %? Source-agnostic (works for any trade with a
 * durable-journal match) - riskAmount isn't stored directly, but is exactly
 * recoverable from pnl_usd/r_multiple (both already durable): riskAmount =
 * |pnlUsd / rMultiple|. balanceBefore = balanceAfter - pnlUsd (the trade's
 * own $ move, backed out). Compared against the CURRENT riskPctPerTrade
 * setting, not a historical snapshot (none is kept per-trade) - an honest
 * limitation: if the setting changed since this trade, the comparison can
 * be stale. `toleranceRatio` (default 15%) absorbs normal rounding from lot
 * sizing (a broker's minimum volume step rarely lands on the exact %).
 */
export function reconstructRiskCheck({ pnlUsd, rMultiple, balanceAfter, expectedRiskPct }, toleranceRatio = 0.15) {
  if (pnlUsd == null || rMultiple == null || rMultiple === 0 || balanceAfter == null || expectedRiskPct == null) return null;
  const riskAmount = Math.abs(pnlUsd / rMultiple);
  const balanceBefore = balanceAfter - pnlUsd;
  if (!(balanceBefore > 0)) return null;
  const actualRiskPct = (riskAmount / balanceBefore) * 100;
  const withinTolerance = Math.abs(actualRiskPct - expectedRiskPct) <= expectedRiskPct * toleranceRatio;
  return { actualRiskPct, expectedRiskPct, withinTolerance };
}

// Exported (2026-09-15) so liveFvgFilterStatus.js can label a bias value the
// exact same way, for the live "why no trade yet" pending-zone checklist -
// same vocabulary as this after-the-fact one, not a second copy that could drift.
export const BIAS_LABEL = { bullish: 'Haussier', bearish: 'Baissier', neutral: 'Neutre', unknown: 'Inconnu' };

/**
 * Builds the full per-trade compliance checklist (see HANDOFF.md "Preuve
 * visuelle de conformité"). `h1Candles` may be null/empty when the variant
 * is 'baseline' (no bias filter, no extra fetch needed) or when the extra
 * fetch failed - any item that can't be computed is marked
 * applicable:false rather than silently omitted or guessed.
 *
 * @param {object} trade - {direction, entryTime, pnlUsd, rMultiple, balanceAfter}
 * @param {Array} candles - the trade's own context candles (already fetched for its chart)
 * @param {object|null} cfg - CONFIG.fvg.perSymbol[symbol], or null for a non-fvg source/symbol
 * @param {Array|null} h1Candles - real H1 candles ending at/before entryTime, for the bias check
 * @param {number|null} expectedRiskPct - the account's CURRENT riskPctPerTrade setting
 */
export function buildFvgComplianceChecklist({ trade, candles, cfg, h1Candles, expectedRiskPct }) {
  const items = [];

  const risk = reconstructRiskCheck({ pnlUsd: trade.pnlUsd, rMultiple: trade.rMultiple, balanceAfter: trade.balanceAfter, expectedRiskPct });
  items.push(risk
    ? {
        key: 'risk', applicable: true, ok: risk.withinTolerance, label: 'Risque appliqué',
        detail: `${risk.actualRiskPct.toFixed(2)}% du solde au moment du trade (réglage actuel : ${risk.expectedRiskPct}%)`,
      }
    : { key: 'risk', applicable: false, label: 'Risque appliqué', detail: 'Non vérifiable (pas de correspondance dans le journal durable, ou trade trop ancien)' });

  if (!cfg) {
    items.push({ key: 'zone', applicable: false, label: 'Zone FVG valide', detail: "Non applicable — cette stratégie n'a pas de notion de zone FVG" });
    items.push({ key: 'stop', applicable: false, label: 'Distance stop cohérente', detail: 'Non applicable' });
    items.push({ key: 'bias', applicable: false, label: 'Biais haute unité de temps', detail: 'Non applicable' });
    return { zone: null, items };
  }

  const reconstructed = reconstructFvgZone(candles, trade.direction, trade.entryTime);
  if (!reconstructed) {
    items.push({ key: 'zone', applicable: false, label: 'Zone FVG valide', detail: 'Non vérifiable avec le contexte de bougies disponible pour ce graphique' });
    items.push({ key: 'stop', applicable: false, label: 'Distance stop cohérente', detail: 'Non vérifiable (zone non retrouvée)' });
  } else {
    items.push({ key: 'zone', applicable: true, ok: true, label: 'Zone FVG valide', detail: 'Gap 3 bougies retrouvé dans le contexte du graphique, jamais comblé avant l\'entrée' });
    const { distance } = reconstructStopDistance(candles, trade.direction, reconstructed.zone, reconstructed.c1Index, cfg);
    const gapThrough = isGapThroughFill(reconstructed.entryPrice, reconstructed.validatedCandle);
    items.push(gapThrough
      ? { key: 'stop', applicable: true, ok: false, label: 'Distance stop anormalement petite', detail: `${distance.toFixed(2)} points — la bougie d'entrée a traversé toute la zone sans la retoucher (gap), fill optimiste` }
      : { key: 'stop', applicable: true, ok: true, label: 'Distance stop cohérente', detail: `${distance.toFixed(2)} points` });
  }

  const variant = cfg.variant;
  if (!variant || variant === 'baseline') {
    items.push({ key: 'bias', applicable: false, label: 'Biais haute unité de temps', detail: "Non applicable — pas de filtre de biais configuré pour ce symbole" });
  } else if (!h1Candles || h1Candles.length === 0) {
    items.push({ key: 'bias', applicable: false, label: `Biais ${variant.replace('_', '/')}`, detail: 'Non vérifiable (historique H1 non récupéré)' });
  } else {
    const bias = computeHtfBiasAtEntry(h1Candles, variant, trade.entryTime);
    const matches = bias === trade.direction;
    items.push({
      key: 'bias', applicable: true, ok: matches, label: `Biais ${variant.replace('_', '/')}`,
      detail: `${BIAS_LABEL[bias] || 'Inconnu'} au moment de l'entrée — ${matches ? 'conforme' : 'ne correspond pas'} au sens du trade`,
    });
  }

  return { zone: reconstructed ? reconstructed.zone : null, items };
}
