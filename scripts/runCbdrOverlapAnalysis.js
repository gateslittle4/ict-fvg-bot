#!/usr/bin/env node
// runCbdrOverlapAnalysis.js
// Usage: node scripts/runCbdrOverlapAnalysis.js <dir-with-csvs>
//
// Esdras's question after CBDR/US100 was found the only candidate clearing
// all three validation layers (full historical depth, train/test, real
// forward-test - see HANDOFF.md): would adding CBDR to US100 genuinely
// diversify, or mostly lose to what's already live there? Verified first
// (src/liveStrategyEngine.js:536, `_blockReason`): `openPositions` is a
// Map keyed by SYMBOL, shared across every mechanism - at most ONE open
// position on US100 at a time, whichever signal arrives first. So CBDR
// wouldn't stack risk on top of what's live - it would compete for the same
// single slot as FVG/Divergence/NWOG/Silver Bullet, all four of which are
// live on US100 today (config.js).
//
// Unlike runSilverBulletOverlapAnalysis.js (its direct template), this
// script does NOT approximate "production" by concatenating each
// mechanism's independent standalone backtest (that template doesn't
// simulate real netting between its own reconstructed mechanisms, and has
// no Divergence at all - Divergence has no standalone backtest module,
// only the live-engine implementation in liveStrategyEngine.js and a
// bespoke duplicate inside runFtmo1StepAccountImpact.js's simulateYear).
// Instead this replays the REAL production logic via
// LiveStrategyEngine.warmUp()'s onEvent callback - the actual code path
// FVG/Divergence/NWOG/Silver Bullet run through live, real netting
// included - and reconstructs the true production trade list from the
// 'validated' (opened, blockedReason falsy) and 'closed' events it emits.
//
// A permissive guardrail stub is used deliberately: GuardrailEngine's
// limits (maxTradesPerDay, cooldowns, drawdown) are real-money ACCOUNT
// constraints, orthogonal to the question this script answers (do two
// SIGNALS overlap in time) - same omission the Silver Bullet template
// makes by never touching guardrails at all.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runCbdrBacktest } from '../src/backtest/cbdr.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';

// Copied verbatim from config.js (fvg.perSymbol.US100, divergence, nwog,
// silverBullet) - NOT re-derived, so a future change to the real production
// config silently goes stale here rather than silently mismatching. Cross-
// checked against config.js at the time this script was written
// (2026-09-18).
const FVG_PROD_CONFIG = {
  US100: {
    variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 5,
    structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 },
    liquiditySweepEnabled: true, multiTouch: true,
  },
};
const DIVERGENCE_PROD_CONFIG = {
  pair: ['US100', 'US500'],
  lookback: 100,
  zThreshold: 2,
  atrPeriod: 14,
  stopAtrMultiple: 1.5,
  rrMultiple: 3,
  maxHoldingM15Candles: 480,
};
const NWOG_PROD_CONFIG = {
  symbols: ['US100', 'GER40'],
  rrMultiple: 5,
  maxHoldingM15Candles: 480,
  longOnlySymbols: ['US100'],
};
const SILVER_BULLET_PROD_CONFIG = {
  symbols: ['US100', 'US500', 'GER40'],
  rrMultiple: 3,
  maxHoldingM15Candles: 480,
};

// Real-money account constraints are out of scope for a pure signal-overlap
// question (see header) - always allow, matching the Silver Bullet
// template's own omission of guardrails entirely.
const PERMISSIVE_GUARDRAIL = { canTakeNewTrade: () => true };

function fmtPct(n, total) { return total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '—'; }

/** @returns {Array<{source, symbol, direction, entryTime, exitTime, outcome}>} every REAL production trade closed on `targetSymbol`, reconstructed by replaying the actual live engine */
function buildProductionTrades(candlesBySymbol, targetSymbol) {
  const engine = new LiveStrategyEngine({
    symbols: Object.keys(candlesBySymbol),
    fvgConfig: FVG_PROD_CONFIG,
    divergenceConfig: DIVERGENCE_PROD_CONFIG,
    nwogConfig: NWOG_PROD_CONFIG,
    silverBulletConfig: SILVER_BULLET_PROD_CONFIG,
    guardrail: PERMISSIVE_GUARDRAIL,
    spreads: {}, // spread viability is also out of scope here - pure timing overlap, not net-of-cost edge
  });

  const trades = [];
  const pendingOpen = new Map(); // symbol -> { source, direction, entryTime }

  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.symbol !== targetSymbol) return;
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, { source: signal.source, direction: signal.direction, entryTime: candle.time });
      } else if (signal.type === 'closed') {
        const open = pendingOpen.get(signal.symbol);
        pendingOpen.delete(signal.symbol);
        if (!open) return; // defensive - shouldn't happen given netting guarantees at most one open position per symbol
        trades.push({ source: signal.source, symbol: signal.symbol, direction: signal.direction, entryTime: open.entryTime, exitTime: signal.exitTime, outcome: signal.outcome });
      }
    },
  });

  return trades;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runCbdrOverlapAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const { candles: us100Candles } = loadCandlesFromCsv(path.join(dir, 'US100.csv'));
  const { candles: us500Candles } = loadCandlesFromCsv(path.join(dir, 'US500.csv'));

  const cbdrTrades = runCbdrBacktest(us100Candles);
  // Order matters: LiveStrategyEngine.warmUp() processes symbols in object-
  // key insertion order, and a Divergence pair's FIRST-processed leg sees an
  // empty partner history at that point, so it silently never fires ANY of
  // its own divergence candidates for the rest of this replay (see
  // _warmUpOneSymbol's own header comment - documented pre-existing quirk of
  // the real production warm-up path, not something this script
  // introduces). US500 must go first so that when US100's own turn comes,
  // US500's history is already complete and US100's local
  // divergenceCandidates computation correctly includes its own leg
  // (verified empirically below - see HANDOFF.md for the before/after).
  const prodTrades = buildProductionTrades({ US500: us500Candles, US100: us100Candles }, 'US100');

  let overlapAny = 0, overlapSame = 0, overlapOpposite = 0;
  const byMechanismOverlap = new Map();
  const byMechanismCount = new Map();
  for (const p of prodTrades) byMechanismCount.set(p.source, (byMechanismCount.get(p.source) || 0) + 1);

  for (const cd of cbdrTrades) {
    const overlapping = prodTrades.filter((p) => cd.entryTime <= p.exitTime && p.entryTime <= cd.exitTime);
    if (overlapping.length > 0) {
      overlapAny++;
      const sameDir = overlapping.some((p) => p.direction === cd.direction);
      const oppDir = overlapping.some((p) => p.direction !== cd.direction);
      if (sameDir) overlapSame++;
      if (oppDir) overlapOpposite++;
      for (const p of overlapping) byMechanismOverlap.set(p.source, (byMechanismOverlap.get(p.source) || 0) + 1);
    }
  }
  const noOverlap = cbdrTrades.length - overlapAny;

  console.error(`Production trades on US100 reconstructed: ${prodTrades.length} (${JSON.stringify(Object.fromEntries(byMechanismCount))})`);
  console.error(`CBDR standalone trades on US100: ${cbdrTrades.length}`);
  console.error(`Overlap: any=${overlapAny} (${fmtPct(overlapAny, cbdrTrades.length)}) sameDir=${overlapSame} oppDir=${overlapOpposite} none=${noOverlap}`);
  console.error(`Overlap by production mechanism: ${JSON.stringify(Object.fromEntries(byMechanismOverlap))}`);

  const md = [];
  md.push('# CBDR autonome (US100) vs mécanismes déjà en production — analyse de chevauchement');
  md.push('');
  md.push(
    "Question d'Esdras : ajouter CBDR comme 5e mécanisme sur US100 ajoute-t-il une vraie diversification, ou re-trade-t-il " +
      "des mouvements déjà capturés par ce qui tourne en production sur ce même symbole (FVG, Divergence, NWOG, Silver " +
      "Bullet — les 4 mécanismes live sur US100 aujourd'hui, voir config.js) ? Contrairement à l'analyse équivalente faite " +
      "pour Silver Bullet (`silver-bullet-overlap-analysis.md`), qui approxime la production en concaténant chaque " +
      "mécanisme calculé indépendamment (sans simuler le vrai netting, et sans Divergence — aucun module de backtest " +
      "autonome n'existe pour elle), cette analyse rejoue la VRAIE logique de production via `LiveStrategyEngine.warmUp()` " +
      "— le même chemin de code que le bot live emprunte réellement, netting réel inclus (`openPositions` est une Map par " +
      "symbole, partagée entre tous les mécanismes — voir `src/liveStrategyEngine.js:536` — une seule position ouverte à " +
      "la fois sur US100, premier signal arrivé bloque les autres). Chevauchement MÊME sens = double exposition au même " +
      "mouvement ; sens OPPOSÉ = deux mécanismes qui se contredisent en même temps. Historique complet disponible " +
      "(pas de split train/test ici — ce n'est pas un test d'edge, c'est un test de corrélation temporelle)."
  );
  md.push('');
  md.push(`Trades production reconstruits sur US100 (netting réel) : **${prodTrades.length}** — ${Object.entries(Object.fromEntries(byMechanismCount)).map(([k, v]) => `${k}: ${v}`).join(', ')}.`);
  md.push('');
  md.push('| Trades CBDR | Chevauchement (tout) | Même sens (double exposition) | Sens opposé (contradiction) | Aucun chevauchement |');
  md.push('|---|---|---|---|---|');
  md.push(
    `| ${cbdrTrades.length} | ${overlapAny} (${fmtPct(overlapAny, cbdrTrades.length)}) | ${overlapSame} (${fmtPct(overlapSame, cbdrTrades.length)}) | ` +
      `${overlapOpposite} (${fmtPct(overlapOpposite, cbdrTrades.length)}) | ${noOverlap} (${fmtPct(noOverlap, cbdrTrades.length)}) |`
  );
  md.push('');
  md.push('Chevauchement par mécanisme déjà en production (un trade CBDR peut chevaucher plusieurs mécanismes à la fois, les compteurs ne s\'additionnent donc pas forcément au total ci-dessus) :');
  md.push('');
  md.push('| Mécanisme | Trades CBDR qui le chevauchent |');
  md.push('|---|---|');
  for (const [mech, count] of [...byMechanismOverlap.entries()].sort((a, b) => b[1] - a[1])) {
    md.push(`| ${mech} | ${count} |`);
  }

  const outMd = path.join(dir, 'cbdr-us100-overlap-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
