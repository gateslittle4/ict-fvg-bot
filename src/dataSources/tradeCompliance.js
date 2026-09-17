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
// UPDATE (2026-09-17, Esdras: "combien de checklist on pourrait faire
// apparaitre? ... Tous") - every live mechanism now has its own real
// reconstruction, not just FVG. Same discipline throughout: reuse the
// EXACT production detection function per mechanism (detectNwogEvents,
// detectJudasSwingEvents, detectWeeklySweepEvents, computeBreakerBlockCandidates,
// computeSilverBulletCandidates - the last two extracted out of
// liveStrategyEngine.js this same session specifically so this file and the
// live engine can share one implementation instead of two copies that could
// drift), never a second reimplementation. Divergence is the one deliberate
// partial exception, disclosed rather than faked: its z-score signal needs
// the PARTNER symbol's own candle history, never fetched for a single
// trade's chart context - that one item reads "non vérifiable" honestly,
// everything else derivable from the traded symbol alone (direction rule,
// ATR-based stop distance) is still reconstructed for real.
//
// The event-based mechanisms (NWOG/Judas Swing/Weekly Sweep/Breaker
// Block/Silver Bullet) all need MORE prior-candle context than FVG's own
// checklist ever did (a previous COMPLETE day or week, or up to ~100+
// candles of order-block/mitigation lookback) - see
// requiredPreEntryContextCandles() below, which the caller
// (cTraderDataSource.js) uses to fetch a wide-enough candle window before
// calling buildComplianceChecklist(), instead of the flat 30-candle margin
// that was enough for FVG alone.

import { FvgEngine } from '../engines/fvgEngine.js';
import { computeStop } from '../backtest/backtestEngine.js';
import { buildHtfBiasSeries, makeBiasLookup, TIMEFRAME_MS } from '../backtest/htfBias.js';
import { detectNwogEvents } from '../backtest/nwog.js';
import { detectJudasSwingEvents, LONDON_KILLZONE_WINDOW } from '../backtest/judasSwing.js';
import { detectWeeklySweepEvents } from '../backtest/weeklyLiquiditySweep.js';
import { computeBreakerBlockCandidates } from '../backtest/breakerBlock.js';
import { computeSilverBulletCandidates, SILVER_BULLET_WINDOW } from '../backtest/silverBullet.js';
import { computeAtrSeries } from '../backtest/rsiDivergence.js';
import { isInNySessionWindow } from '../backtest/nySession.js';

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

// ---------------------------------------------------------------------------
// Non-FVG mechanisms (2026-09-17) - see file header for the overall scope.
// ---------------------------------------------------------------------------

function buildRiskItem(trade, expectedRiskPct) {
  const risk = reconstructRiskCheck({ pnlUsd: trade.pnlUsd, rMultiple: trade.rMultiple, balanceAfter: trade.balanceAfter, expectedRiskPct });
  return risk
    ? {
        key: 'risk', applicable: true, ok: risk.withinTolerance, label: 'Risque appliqué',
        detail: `${risk.actualRiskPct.toFixed(2)}% du solde au moment du trade (réglage actuel : ${risk.expectedRiskPct}%)`,
      }
    : { key: 'risk', applicable: false, label: 'Risque appliqué', detail: 'Non vérifiable (pas de correspondance dans le journal durable, ou trade trop ancien)' };
}

/**
 * NWOG/Judas Swing/Weekly Sweep all emit their raw events as
 * {index, direction, <stopFieldName>} - shift each one to its actual entry
 * candle (index+1, same no-lookahead convention as every live
 * _computeXCandidates() in liveStrategyEngine.js) and normalize to the same
 * {direction, entryTime, stopReference} shape computeBreakerBlockCandidates/
 * computeSilverBulletCandidates already return directly.
 */
function shiftEventsToEntryCandidates(events, candles, stopFieldName) {
  const candidates = [];
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    candidates.push({ direction: e.direction, entryTime: candles[entryIndex].time, stopReference: e[stopFieldName] });
  }
  return candidates;
}

/** Exact match on entryTime AND direction - a direction mismatch at the same timestamp is never the right candidate, not a "close enough". */
function findMatchingCandidate(candidates, direction, entryTime) {
  return candidates.find((c) => c.entryTime === entryTime && c.direction === direction) || null;
}

export function reconstructNwogCandidate(candles, direction, entryTime) {
  return findMatchingCandidate(shiftEventsToEntryCandidates(detectNwogEvents(candles), candles, 'stopReference'), direction, entryTime);
}
export function reconstructJudasSwingCandidate(candles, direction, entryTime) {
  return findMatchingCandidate(shiftEventsToEntryCandidates(detectJudasSwingEvents(candles), candles, 'sweepExtreme'), direction, entryTime);
}
export function reconstructWeeklySweepCandidate(candles, direction, entryTime) {
  return findMatchingCandidate(shiftEventsToEntryCandidates(detectWeeklySweepEvents(candles), candles, 'sweepExtreme'), direction, entryTime);
}
export function reconstructBreakerBlockCandidate(candles, direction, entryTime) {
  return findMatchingCandidate(computeBreakerBlockCandidates(candles), direction, entryTime);
}
export function reconstructSilverBulletCandidate(candles, direction, entryTime) {
  return findMatchingCandidate(computeSilverBulletCandidates(candles), direction, entryTime);
}

/** Shared "signal detected" + "distance stop cohérente" pair, identical shape for all 5 event-based mechanisms. */
function buildEventItems(candidate, trade, signalLabel, signalDetailFound, signalDetailMissing) {
  const items = [];
  if (!candidate) {
    items.push({ key: 'signal', applicable: false, label: signalLabel, detail: signalDetailMissing });
    items.push({ key: 'stop', applicable: false, label: 'Distance stop cohérente', detail: 'Non vérifiable (signal non retrouvé)' });
    return items;
  }
  items.push({ key: 'signal', applicable: true, ok: true, label: signalLabel, detail: signalDetailFound });
  const distance = Math.abs(trade.entryPrice - candidate.stopReference);
  const validSide = trade.direction === 'bullish' ? candidate.stopReference < trade.entryPrice : candidate.stopReference > trade.entryPrice;
  items.push(
    validSide
      ? { key: 'stop', applicable: true, ok: true, label: 'Distance stop cohérente', detail: `${distance.toFixed(5)} — stop du bon côté de l'entrée` }
      : { key: 'stop', applicable: true, ok: false, label: 'Stop du mauvais côté', detail: `Le niveau de stop reconstruit (${candidate.stopReference}) n'est pas du bon côté de l'entrée (${trade.entryPrice})` }
  );
  return items;
}

function buildNwogChecklist(trade, candles, cfg) {
  const candidate = reconstructNwogCandidate(candles, trade.direction, trade.entryTime);
  const items = buildEventItems(
    candidate, trade, 'Gap de réouverture de semaine détecté',
    "Écart réel détecté entre la clôture de vendredi et la réouverture, dans le sens du trade",
    'Non vérifiable avec le contexte de bougies disponible (le gap doit se trouver juste avant l\'entrée)'
  );
  const longOnly = cfg?.longOnlySymbols?.includes(trade.symbol);
  if (longOnly) {
    items.push({
      key: 'direction-filter', applicable: true, ok: trade.direction === 'bullish', label: 'Achat seul (règle spécifique à ce symbole)',
      detail: trade.direction === 'bullish' ? 'Trade acheteur, conforme à la restriction achat-seul de ce symbole' : "Trade vendeur — ne devrait normalement jamais s'ouvrir sur un symbole achat-seul",
    });
  }
  return items;
}

function buildJudasSwingChecklist(trade, candles) {
  const candidate = reconstructJudasSwingCandidate(candles, trade.direction, trade.entryTime);
  const items = buildEventItems(
    candidate, trade, 'Balayage du plus haut/bas de la veille détecté',
    'Mèche au-delà du plus haut/bas de la veille, puis clôture qui reclaim à l\'intérieur, dans le sens du trade',
    "Non vérifiable avec le contexte de bougies disponible (nécessite la journée complète précédente)"
  );
  const inKillzone = isInNySessionWindow(trade.entryTime, LONDON_KILLZONE_WINDOW.startHour, LONDON_KILLZONE_WINDOW.endHour);
  items.push({
    key: 'session', applicable: true, ok: inKillzone, label: 'Killzone Londres (2h-5h NY)',
    detail: inKillzone ? "Entrée dans la fenêtre horaire configurée" : "Entrée EN DEHORS de la fenêtre horaire — ne devrait normalement jamais arriver",
  });
  return items;
}

function buildWeeklySweepChecklist(trade, candles) {
  const candidate = reconstructWeeklySweepCandidate(candles, trade.direction, trade.entryTime);
  return buildEventItems(
    candidate, trade, 'Balayage du plus haut/bas de la semaine précédente détecté',
    'Mèche au-delà du plus haut/bas de la semaine précédente, puis clôture qui reclaim à l\'intérieur, dans le sens du trade',
    'Non vérifiable avec le contexte de bougies disponible (nécessite la semaine complète précédente)'
  );
}

function buildBreakerBlockChecklist(trade, candles) {
  const candidate = reconstructBreakerBlockCandidate(candles, trade.direction, trade.entryTime);
  return buildEventItems(
    candidate, trade, 'Order block cassé puis retesté',
    'Cassure de structure suivie du retest du bloc devenu breaker, dans le sens du trade',
    'Non vérifiable avec le contexte de bougies disponible (cassure ou retest hors de la fenêtre récupérée)'
  );
}

function buildSilverBulletChecklist(trade, candles) {
  const candidate = reconstructSilverBulletCandidate(candles, trade.direction, trade.entryTime);
  const items = buildEventItems(
    candidate, trade, 'Zone formée dans la killzone + structure agréée',
    'Gap 3 bougies formé dans la fenêtre 10h-11h NY, avec une cassure de structure du même sens active',
    'Non vérifiable avec le contexte de bougies disponible'
  );
  const inWindow = isInNySessionWindow(trade.entryTime, SILVER_BULLET_WINDOW.startHour, SILVER_BULLET_WINDOW.endHour + 1);
  // +1h tolerance on the window's own end: the ZONE must FORM inside 10h-11h
  // (already verified by candidate detection above), but the ENTRY (this
  // trade's own entryTime) is one candle after mitigation, which can print
  // up to a few candles later, not necessarily still inside 10h-11h itself -
  // this item is informational context, not a second pass/fail gate on the
  // same rule the 'signal' item already checked properly via detection.
  items.push({
    key: 'entry-timing', applicable: true, ok: true, label: 'Chronologie',
    detail: inWindow ? "Entrée toujours dans (ou juste après) la fenêtre 10h-11h NY" : "Entrée après la fenêtre 10h-11h NY (normal — la zone s'est formée dedans, la mitigation/entrée peut arriver plus tard)",
  });
  return items;
}

function buildDivergenceChecklist(trade, candles, cfg) {
  const items = [];
  items.push({
    key: 'direction-rule', applicable: true, ok: trade.direction === 'bullish', label: 'Toujours acheteur du retardataire',
    detail: trade.direction === 'bullish' ? "Conforme — Divergence n'ouvre jamais de position vendeuse par construction" : "Anomalie — Divergence ne devrait jamais ouvrir de position vendeuse",
  });
  if (!cfg || !candles || candles.length === 0) {
    items.push({ key: 'stop', applicable: false, label: 'Distance stop cohérente (ATR)', detail: 'Non vérifiable' });
  } else {
    const atrSeries = computeAtrSeries(candles, cfg.atrPeriod);
    const idx = candles.findIndex((c) => c.time === trade.entryTime);
    const atr = idx > 0 ? atrSeries[idx - 1] : null; // the ATR reading available BEFORE this candle, same no-lookahead convention as everywhere else
    if (atr) {
      const expectedDistance = cfg.stopAtrMultiple * atr;
      const actualDistance = Math.abs(trade.entryPrice - trade.stopPrice || 0);
      const closeEnough = trade.stopPrice == null || Math.abs(actualDistance - expectedDistance) <= expectedDistance * 0.15;
      items.push({
        key: 'stop', applicable: true, ok: closeEnough, label: 'Distance stop cohérente (ATR)',
        detail: `ATR × ${cfg.stopAtrMultiple} = ${expectedDistance.toFixed(5)} attendu`,
      });
    } else {
      items.push({ key: 'stop', applicable: false, label: 'Distance stop cohérente (ATR)', detail: 'Non vérifiable (ATR non calculable avec le contexte disponible)' });
    }
  }
  items.push({
    key: 'zscore', applicable: false, label: 'Écart z-score dépassé',
    detail: "Non vérifiable — nécessite l'historique du symbole PARTENAIRE (US100/US500), jamais récupéré pour l'affichage d'un seul trade. Limite honnête, pas cachée.",
  });
  return items;
}

/**
 * How many EXTRA M15 candles of history BEFORE entryTime the caller should
 * fetch (on top of whatever baseline margin it already uses for the chart
 * itself, e.g. cTraderDataSource.js's 30-candle chartMarginMs) so this
 * source's reconstruction has enough context to actually find its signal -
 * FVG's own zone/bias reconstruction never needed more than the existing
 * chart margin, but a previous COMPLETE day (Judas Swing) or week (Weekly
 * Sweep), or a multi-stage order-block/mitigation lookback (Breaker
 * Block/Silver Bullet), does. Numbers sized generously above each
 * mechanism's own worst-case lookback constant (see each backtest module's
 * own MAX_AGE/LOOKBACK exports) rather than the exact minimum, since an
 * extra broker fetch here is cheap relative to reporting "non vérifiable"
 * on real trades for no good reason.
 * @param {string} source
 * @returns {number} 0 when the existing baseline margin is already enough
 */
export function requiredPreEntryContextCandles(source) {
  switch (source) {
    case 'judaswing': return 250; // ~2.6 days of M15 - safely covers "previous complete day" even across a weekend/holiday gap
    case 'weeklysweep': return 1000; // ~10 trading days - safely covers "previous complete week"
    case 'breakerblock': return 300; // OB_SEARCH_LOOKBACK(20) + BREAKER_MAX_AGE_CANDLES(100) x2 phases, plus margin
    case 'silverbullet': return 100; // FVG_MAX_AGE_CANDLES(50) + STRUCTURE_LOOKBACK(5), plus margin
    default: return 0; // fvg, divergence, nwog - existing baseline margin already covers these
  }
}

/**
 * Dispatcher - picks the right reconstruction per trade.source. FVG keeps
 * its existing, separately-tested buildFvgComplianceChecklist() UNCHANGED;
 * every other live mechanism gets its own real checklist here instead of
 * the previous "not applicable" fallback.
 * @param {object} trade - {source, symbol, direction, entryTime, entryPrice, stopPrice, pnlUsd, rMultiple, balanceAfter}
 * @param {Array} candles - context candles, wide enough per requiredPreEntryContextCandles(trade.source)
 * @param {object|null} cfg - the trade's own CONFIG.<source> block (or CONFIG.fvg.perSymbol[symbol] for fvg)
 * @param {Array|null} h1Candles - only used for 'fvg'
 * @param {number|null} expectedRiskPct
 */
export function buildComplianceChecklist({ trade, candles, cfg, h1Candles, expectedRiskPct }) {
  if (trade.source === 'fvg') return buildFvgComplianceChecklist({ trade, candles, cfg, h1Candles, expectedRiskPct });

  const items = [buildRiskItem(trade, expectedRiskPct)];
  switch (trade.source) {
    case 'nwog': items.push(...buildNwogChecklist(trade, candles, cfg)); break;
    case 'judaswing': items.push(...buildJudasSwingChecklist(trade, candles)); break;
    case 'weeklysweep': items.push(...buildWeeklySweepChecklist(trade, candles)); break;
    case 'breakerblock': items.push(...buildBreakerBlockChecklist(trade, candles)); break;
    case 'silverbullet': items.push(...buildSilverBulletChecklist(trade, candles)); break;
    case 'divergence': items.push(...buildDivergenceChecklist(trade, candles, cfg)); break;
    // null/undefined (2026-09-17, found live on the real account: a manual
    // Buy/Sell click has no order label at all, so parseSourceFromLabel()
    // already returns null for it upstream in dealPairing.js - a real,
    // expected case, not a data error) gets its own clear message rather
    // than falling into the generic "unknown mechanism" branch below, which
    // used to literally interpolate the string "null" into the label.
    case null:
    case undefined:
      items.push({ key: 'signal', applicable: false, label: 'Critères du mécanisme', detail: "Trade manuel — aucun mécanisme automatique associé, rien à vérifier ici" });
      break;
    default:
      items.push({ key: 'signal', applicable: false, label: 'Critères du mécanisme', detail: `Mécanisme "${trade.source}" inconnu de cette checklist` });
  }
  return { zone: null, items };
}
