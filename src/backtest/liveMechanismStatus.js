// liveMechanismStatus.js
// "Je veux le suivre de façon live" (2026-09-17, Esdras, sur la page
// graphique) - même esprit que liveFvgFilterStatus.js (voisin, FVG
// uniquement) mais pour les 6 autres mécanismes: NWOG, Judas Swing, Weekly
// Sweep, Breaker Block, Silver Bullet, Divergence.
//
// Contrairement à FVG (une zone qui reste "watching" pendant des heures,
// avec 4 critères qui peuvent chacun être vrai/faux indépendamment), la
// PLUPART des autres mécanismes se déclenchent sur UNE SEULE bougie
// (mèche + reclaim) - il n'y a rien à observer "se construire" avant
// l'entrée. Deux familles honnêtement différentes, pas une checklist
// uniforme forcée sur tout :
//   - NWOG / Judas Swing / Weekly Sweep / Divergence : statut simple
//     (aucun signal actif / signal actif, entrée déjà ouverte ou imminente),
//     plus les niveaux de référence actuels (PDH/PDL, PWH/PWL, z-score) à
//     titre informatif - utile même sans signal actif.
//   - Breaker Block / Silver Bullet : une vraie machine à états à
//     plusieurs phases (voir runBreakerBlockStateMachine()/
//     runSilverBulletStateMachine() dans leurs modules respectifs) - un
//     vrai suivi de progression, comme FVG.
//
// Même discipline que partout ailleurs dans ce projet : réutilise les
// VRAIES fonctions de détection de production (detectNwogEvents,
// detectJudasSwingEvents, detectWeeklySweepEvents,
// runBreakerBlockStateMachine, runSilverBulletStateMachine,
// computeZScoreSeries), jamais une réimplémentation séparée.

import { detectNwogEvents } from './nwog.js';
import { detectJudasSwingEvents, LONDON_KILLZONE_WINDOW } from './judasSwing.js';
import { detectWeekBoundaryIndices, detectWeeklySweepEvents } from './weeklyLiquiditySweep.js';
import { runBreakerBlockStateMachine } from './breakerBlock.js';
import { runSilverBulletStateMachine, SILVER_BULLET_WINDOW } from './silverBullet.js';
import { resampleCandles } from './htfBias.js';
import { isInNySessionWindow } from './nySession.js';
import { computeZScoreSeries, alignByTime } from './correlation.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 6.5 * DAY_MS; // "this week's signal" tolerance - a bit under 7 days so a stale event from last week's own reopen never gets reported as still current

function fmtDirection(direction) { return direction === 'bullish' ? 'acheteur' : 'vendeur'; }

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @param {string[]} [opts.longOnlySymbols] - CONFIG.nwog.longOnlySymbols
 * @param {string} [opts.symbol]
 * @returns {{key:string, label:string, items:Array}}
 */
export function nwogLiveStatus(candles, { longOnlySymbols = [], symbol } = {}) {
  const events = detectNwogEvents(candles);
  const now = candles.length ? candles[candles.length - 1].time : 0;
  const last = events[events.length - 1];
  const recent = last && now - candles[last.index].time <= RECENT_WINDOW_MS;

  if (!recent) {
    return {
      key: 'nwog', label: 'NWOG (gap de réouverture)',
      items: [{ key: 'signal', applicable: true, ok: false, label: 'Gap de réouverture de semaine', detail: "Aucun gap significatif détecté pour l'instant cette semaine — en attente de la prochaine réouverture (dimanche soir, heure de New York)" }],
    };
  }

  const filtered = longOnlySymbols.includes(symbol) && last.direction === 'bearish';
  const entryIndex = last.index + 1;
  const alreadyOpened = entryIndex < candles.length - 1; // strictly before the LAST candle - the very last candle is "just opened now"
  return {
    key: 'nwog', label: 'NWOG (gap de réouverture)',
    items: [{
      key: 'signal', applicable: true, ok: !filtered, label: 'Gap de réouverture de semaine',
      detail: filtered
        ? `Gap ${fmtDirection(last.direction)} détecté à la réouverture, mais filtré (règle achat-seul sur ce symbole) — aucun trade`
        : `Gap ${fmtDirection(last.direction)} détecté à la réouverture — ${alreadyOpened ? 'trade déjà ouvert' : 'entrée à la prochaine bougie'}`,
    }],
  };
}

/** @param {Array} candles */
export function judasSwingLiveStatus(candles) {
  const now = candles.length ? candles[candles.length - 1].time : 0;
  const daily = resampleCandles(candles, DAY_MS);
  const dailyByKey = new Map(daily.map((d) => [Math.floor(d.time / DAY_MS), d]));
  const prevDay = dailyByKey.get(Math.floor(now / DAY_MS) - 1);

  const items = [];
  items.push({
    key: 'levels', applicable: !!prevDay, ok: true, label: 'Plus haut/bas de la veille (PDH/PDL)',
    detail: prevDay ? `PDH ${prevDay.high} · PDL ${prevDay.low}` : 'Non calculable (pas encore une journée complète de bougies)',
  });

  const inKillzone = isInNySessionWindow(now, LONDON_KILLZONE_WINDOW.startHour, LONDON_KILLZONE_WINDOW.endHour);
  const events = detectJudasSwingEvents(candles);
  const last = events[events.length - 1];
  const recent = last && now - candles[last.index].time < DAY_MS;

  if (recent) {
    const entryIndex = last.index + 1;
    const alreadyOpened = entryIndex < candles.length - 1;
    items.push({
      key: 'signal', applicable: true, ok: true, label: 'Balayage + reclaim',
      detail: `Signal ${fmtDirection(last.direction)} détecté aujourd'hui dans la killzone — ${alreadyOpened ? 'trade déjà ouvert' : 'entrée à la prochaine bougie'}`,
    });
  } else {
    items.push({
      key: 'signal', applicable: true, ok: false, label: 'Balayage + reclaim',
      detail: inKillzone ? 'Dans la killzone (2h-5h NY) — en attente d\'un balayage du plus haut/bas de la veille' : `Hors killzone — prochaine fenêtre ${LONDON_KILLZONE_WINDOW.startHour}h-${LONDON_KILLZONE_WINDOW.endHour}h (heure NY)`,
    });
  }
  return { key: 'judaswing', label: 'Judas Swing (killzone Londres)', items };
}

/** @param {Array} candles */
export function weeklySweepLiveStatus(candles) {
  const now = candles.length ? candles[candles.length - 1].time : 0;
  const boundaries = detectWeekBoundaryIndices(candles);
  const lastBoundary = boundaries[boundaries.length - 1];
  const items = [];

  if (lastBoundary !== undefined) {
    let pwh = -Infinity, pwl = Infinity;
    const prevBoundary = boundaries[boundaries.length - 2] ?? 0;
    for (let i = prevBoundary; i < lastBoundary; i++) {
      if (candles[i].high > pwh) pwh = candles[i].high;
      if (candles[i].low < pwl) pwl = candles[i].low;
    }
    items.push({ key: 'levels', applicable: true, ok: true, label: 'Plus haut/bas de la semaine précédente (PWH/PWL)', detail: `PWH ${pwh} · PWL ${pwl}` });
  } else {
    items.push({ key: 'levels', applicable: false, label: 'Plus haut/bas de la semaine précédente (PWH/PWL)', detail: 'Non calculable (pas encore une semaine complète de bougies)' });
  }

  const events = detectWeeklySweepEvents(candles);
  const last = events[events.length - 1];
  const recent = last && now - candles[last.index].time <= RECENT_WINDOW_MS;
  if (recent) {
    const entryIndex = last.index + 1;
    const alreadyOpened = entryIndex < candles.length - 1;
    items.push({
      key: 'signal', applicable: true, ok: true, label: 'Balayage + reclaim',
      detail: `Signal ${fmtDirection(last.direction)} détecté cette semaine — ${alreadyOpened ? 'trade déjà ouvert' : 'entrée à la prochaine bougie'}`,
    });
  } else {
    items.push({ key: 'signal', applicable: true, ok: false, label: 'Balayage + reclaim', detail: "En attente d'un balayage du plus haut/bas de la semaine précédente" });
  }
  return { key: 'weeklysweep', label: 'Weekly Sweep', items };
}

/** @param {Array} candles */
export function breakerBlockLiveStatus(candles) {
  const { phase, detail } = runBreakerBlockStateMachine(candles);
  const items = [];
  if (phase === 'idle') {
    items.push({ key: 'signal', applicable: true, ok: false, label: 'Order block', detail: "Aucune cassure de structure active — en attente d'un BOS" });
  } else if (phase === 'watchBreak') {
    items.push({ key: 'signal', applicable: true, ok: false, label: 'Order block trouvé', detail: `Cassure de structure ${fmtDirection(detail.obDirection)} détectée, order block [${detail.zoneLow.toFixed(2)} - ${detail.zoneHigh.toFixed(2)}] — en attente d'une cassure du bloc` });
  } else if (phase === 'watchRetest') {
    items.push({ key: 'signal', applicable: true, ok: false, label: 'Bloc cassé, en attente du retest', detail: `Devenu breaker ${fmtDirection(detail.breakerDirection)} — en attente d'un retest du niveau ${detail.mid.toFixed(2)}` });
  } else {
    items.push({ key: 'signal', applicable: true, ok: true, label: 'Retest confirmé', detail: `Retest du breaker ${fmtDirection(detail.direction)} confirmé — entrée à la prochaine bougie` });
  }
  return { key: 'breakerblock', label: 'Breaker Block', items };
}

/** @param {Array} candles */
export function silverBulletLiveStatus(candles) {
  const now = candles.length ? candles[candles.length - 1].time : 0;
  const inWindow = isInNySessionWindow(now, SILVER_BULLET_WINDOW.startHour, SILVER_BULLET_WINDOW.endHour);
  const { phase, detail } = runSilverBulletStateMachine(candles);
  const items = [];
  if (phase === 'pendingEntry') {
    items.push({ key: 'signal', applicable: true, ok: true, label: 'Zone mitigée', detail: `Zone ${fmtDirection(detail.direction)} retouchée — entrée à la prochaine bougie` });
  } else if (phase === 'active') {
    const zones = detail.map((f) => `${fmtDirection(f.direction)} [${f.zone.bottom.toFixed(2)} - ${f.zone.top.toFixed(2)}]`).join(', ');
    items.push({ key: 'signal', applicable: true, ok: false, label: 'Zone(s) active(s), en attente de mitigation', detail: zones });
  } else {
    items.push({
      key: 'signal', applicable: true, ok: false, label: 'Zone formée dans la killzone + structure',
      detail: inWindow ? "Dans la fenêtre 10h-11h NY — en attente d'une cassure de structure avec gap formé dedans" : 'Hors fenêtre 10h-11h NY — aucune zone active',
    });
  }
  return { key: 'silverbullet', label: 'Silver Bullet', items };
}

/**
 * The only mechanism needing BOTH symbols of the pair (US100/US500) - the
 * caller is responsible for passing whichever history belongs to `symbol`
 * as `ownCandles` and the partner's as `partnerCandles` (both already
 * retained in memory for every live symbol, no extra broker fetch needed -
 * see cTraderDataSource.js's own call site).
 * @param {string} symbol - the symbol THIS status is being shown for
 * @param {Array} ownCandles
 * @param {Array} partnerCandles
 * @param {object} cfg - CONFIG.divergence
 */
export function divergenceLiveStatus(symbol, ownCandles, partnerCandles, cfg) {
  const [symA] = cfg.pair;
  const isA = symbol === symA;
  const h1Own = resampleCandles(ownCandles, 60 * 60 * 1000);
  const h1Partner = resampleCandles(partnerCandles, 60 * 60 * 1000);
  const { alignedA, alignedB } = alignByTime(isA ? h1Own : h1Partner, isA ? h1Partner : h1Own);
  const n = alignedA.length;
  if (n <= cfg.lookback + 1) {
    return { key: 'divergence', label: 'Divergence (paire)', items: [{ key: 'zscore', applicable: false, label: 'Écart z-score', detail: "Pas assez d'historique H1 aligné pour calculer le z-score" }] };
  }
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, cfg.lookback);
  const lastZ = z[n - 1];
  if (lastZ === null) {
    return { key: 'divergence', label: 'Divergence (paire)', items: [{ key: 'zscore', applicable: false, label: 'Écart z-score', detail: 'Non calculable en ce moment' }] };
  }
  const extended = Math.abs(lastZ) >= cfg.zThreshold;
  const laggardIsB = lastZ >= cfg.zThreshold;
  const laggardSymbol = extended ? (laggardIsB ? cfg.pair[1] : cfg.pair[0]) : null;
  return {
    key: 'divergence', label: 'Divergence (paire)',
    items: [{
      key: 'zscore', applicable: true, ok: extended, label: 'Écart z-score',
      detail: extended
        ? `z=${lastZ.toFixed(2)} (seuil ${cfg.zThreshold}) — écart étendu, ${laggardSymbol} est le retardataire (achat au prochain H1 si pas déjà fait)`
        : `z=${lastZ.toFixed(2)} (seuil ${cfg.zThreshold}) — pas d'écart assez large en ce moment`,
    }],
  };
}
