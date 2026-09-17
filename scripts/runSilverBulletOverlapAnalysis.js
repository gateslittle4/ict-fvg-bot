#!/usr/bin/env node
// runSilverBulletOverlapAnalysis.js
// Usage: node scripts/runSilverBulletOverlapAnalysis.js <dir-with-csvs>
//
// Esdras's question after the Silver Bullet standalone research
// (data/backtest-input/silver-bullet-strategy-analysis.md): "doit-on
// l'intégrer si les pairs fonctionnent déjà de 8h à 12h?" — i.e. would
// adding Silver Bullet as a parallel live mechanism on US100/US500/GER40
// genuinely diversify risk, or would it mostly re-trade moves the
// mechanisms ALREADY LIVE on those symbols already capture (correlated
// exposure, not real diversification)?
//
// This reconstructs each symbol's REAL current production trade set (not a
// simplified stand-in) using the exact same code paths as the live bot:
//   - US100: the FVG grid (buildFilteredEngine/MultiTouchFvgEngine, per
//     config.js's own `fvg.perSymbol.US100`) + NWOG (long-only, per
//     config.js's `nwog` block).
//   - US500: the FVG grid (config.js's `fvg.perSymbol.US500` — NOTE its
//     session window is SILVER_BULLET_WINDOW itself, 10:00-11:00 NY, not
//     the wider 8-12h window some might assume every symbol uses) + Weekly
//     Liquidity Sweep (config.js's `weeklySweep` block).
//   - GER40: NOT in the FVG grid at all — it runs NWOG (bidirectional here,
//     unlike US100) + Weekly Liquidity Sweep + Breaker Block (config.js's
//     `nwog`/`weeklySweep`/`breakerBlock` blocks).
// Then compares Silver Bullet standalone's trades against that combined
// production set: for each Silver Bullet trade, does its holding period
// [entryTime, exitTime] overlap a production trade's holding period on the
// same symbol? Same-direction overlap = doubling exposure to the same
// move; opposite-direction overlap = two live mechanisms fighting each
// other on the same symbol at the same time. Both are the "redundant, not
// diversifying" outcome this analysis is meant to catch.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { buildFilteredEngine, NY_AM_SESSION } from '../src/backtest/gridRunner.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { runNwogBacktest } from '../src/backtest/nwog.js';
import { runWeeklySweepBacktest } from '../src/backtest/weeklyLiquiditySweep.js';
import { runBreakerBlockBacktest } from '../src/backtest/breakerBlock.js';
import { SILVER_BULLET_WINDOW as PROD_SILVER_BULLET_WINDOW } from '../src/backtest/silverBullet.js';
import { runSilverBulletBacktest } from '../src/backtest/silverBullet.js';

// Copied verbatim from config.js's fvg.perSymbol - NOT re-derived, so a
// future change to the real production config silently goes stale here
// rather than silently mismatching. Cross-checked against config.js at
// the time this script was written (2026-09-17).
const FVG_PROD_CONFIG = {
  US100: {
    variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 5,
    structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 },
    liquiditySweepEnabled: true, multiTouch: true,
  },
  US500: {
    variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 5,
    structureEnabled: true, sessionEnabled: true, sessionWindow: PROD_SILVER_BULLET_WINDOW,
    liquiditySweepEnabled: true, multiTouch: true,
  },
};

function buildFvgEngine(candles, symbol, cfg) {
  if (cfg.multiTouch) {
    const checkFilters = buildMultiTouchFilterPredicate(candles, symbol, cfg);
    return new MultiTouchFvgEngine({ symbol, checkFilters });
  }
  return buildFilteredEngine(candles, symbol, cfg).engine;
}

function tag(trades, mechanism) {
  return trades.map((t) => ({ ...t, mechanism }));
}

/** @returns {Array} every LIVE production trade for `symbol`, tagged by mechanism */
function buildProductionTrades(candles, symbol) {
  const trades = [];
  if (symbol === 'US100') {
    const engine = buildFvgEngine(candles, symbol, FVG_PROD_CONFIG.US100);
    trades.push(...tag(runBacktest({ candles, symbol, fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 5 }), 'FVG'));
    trades.push(...tag(runNwogBacktest(candles, { rrMultiple: 5 }).filter((t) => t.direction === 'bullish'), 'NWOG'));
  } else if (symbol === 'US500') {
    const engine = buildFvgEngine(candles, symbol, FVG_PROD_CONFIG.US500);
    trades.push(...tag(runBacktest({ candles, symbol, fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 5 }), 'FVG'));
    trades.push(...tag(runWeeklySweepBacktest(candles, { rrMultiple: 5 }), 'WeeklySweep'));
  } else if (symbol === 'GER40') {
    trades.push(...tag(runNwogBacktest(candles, { rrMultiple: 5 }), 'NWOG'));
    trades.push(...tag(runWeeklySweepBacktest(candles, { rrMultiple: 5 }), 'WeeklySweep'));
    trades.push(...tag(runBreakerBlockBacktest(candles, { rrMultiple: 5 }), 'BreakerBlock'));
  }
  return trades;
}

function fmtPct(n, total) { return total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '—'; }

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runSilverBulletOverlapAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Silver Bullet autonome vs mécanismes déjà en production — analyse de chevauchement');
  md.push('');
  md.push(
    "Question d'Esdras : intégrer Silver Bullet autonome sur US100/US500/GER40 ajoute-t-il une vraie diversification, " +
      "ou re-trade-t-il des mouvements déjà capturés par ce qui tourne en production sur ces mêmes symboles ? " +
      "Reconstruit les VRAIS mécanismes en production (FVG+NWOG sur US100, FVG+Weekly Sweep sur US500, " +
      "NWOG+Weekly Sweep+Breaker Block sur GER40 — GER40 n'est PAS dans la grille FVG), puis compare, pour chaque " +
      "trade Silver Bullet, si sa période de détention chevauche celle d'un trade déjà pris en production sur le " +
      "même symbole. Chevauchement MÊME sens = double exposition au même mouvement ; chevauchement sens OPPOSÉ = " +
      "deux mécanismes qui se contredisent en même temps. Historique complet disponible par symbole (pas de split " +
      "train/test ici — ce n'est pas un test d'edge, c'est un test de corrélation)."
  );
  md.push('');
  md.push('| Symbole | Trades Silver Bullet | Chevauchement (tout) | Même sens (double exposition) | Sens opposé (contradiction) | Aucun chevauchement |');
  md.push('|---|---|---|---|---|---|');

  for (const symbol of ['US100', 'US500', 'GER40']) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const sbTrades = runSilverBulletBacktest(candles);
    const prodTrades = buildProductionTrades(candles, symbol);

    let overlapAny = 0, overlapSame = 0, overlapOpposite = 0;
    const byMechanismOverlap = new Map();

    for (const sb of sbTrades) {
      const overlapping = prodTrades.filter((p) => sb.entryTime <= p.exitTime && p.entryTime <= sb.exitTime);
      if (overlapping.length > 0) {
        overlapAny++;
        const sameDir = overlapping.some((p) => p.direction === sb.direction);
        const oppDir = overlapping.some((p) => p.direction !== sb.direction);
        if (sameDir) overlapSame++;
        if (oppDir) overlapOpposite++;
        for (const p of overlapping) {
          byMechanismOverlap.set(p.mechanism, (byMechanismOverlap.get(p.mechanism) || 0) + 1);
        }
      }
    }
    const noOverlap = sbTrades.length - overlapAny;

    md.push(
      `| ${symbol} | ${sbTrades.length} | ${overlapAny} (${fmtPct(overlapAny, sbTrades.length)}) | ` +
        `${overlapSame} (${fmtPct(overlapSame, sbTrades.length)}) | ${overlapOpposite} (${fmtPct(overlapOpposite, sbTrades.length)}) | ` +
        `${noOverlap} (${fmtPct(noOverlap, sbTrades.length)}) |`
    );
    console.error(`[${symbol}] SB=${sbTrades.length} prod=${prodTrades.length} overlapAny=${overlapAny} (${fmtPct(overlapAny, sbTrades.length)}) sameDir=${overlapSame} oppDir=${overlapOpposite}`);
    console.error(`  overlap by production mechanism: ${JSON.stringify(Object.fromEntries(byMechanismOverlap))}`);
  }

  const outMd = path.join(dir, 'silver-bullet-overlap-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
