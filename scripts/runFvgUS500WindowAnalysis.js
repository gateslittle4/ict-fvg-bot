#!/usr/bin/env node
// runFvgUS500WindowAnalysis.js
// Usage: node scripts/runFvgUS500WindowAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12), right after deploying US100's 8h-12h window to
// production: "US500 n'a jamais été testé sur 8h-12h? Sinon teste-le."
// Confirmed: every window comparison this session (fvg-multi-touch-window-
// weekday-analysis.md, the FTMO account simulations, the residual-window
// check, the forward-test comparison) was US100-only. US500's production
// config has NEVER had multi-touch (CONFIG.fvg.perSymbol.US500.multiTouch
// is unset) - so this tests the SAME single-touch mechanism actually live
// for US500 today, only varying the session window, matching what's really
// deployed rather than a hypothetical multi-touch version nobody has
// validated for this symbol.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runOneConfig } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOL = 'US500';
const BASE_CFG = CONFIG.fvg.perSymbol.US500;
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;

const WINDOWS = [
  { key: '08h-12h', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } } },
  { key: '10h-11h (production actuelle)', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } } },
  { key: 'toute la journée (pas de fenêtre)', cfg: { ...BASE_CFG, sessionEnabled: false } },
];

function fmtNum(x, d = 2) { return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—'; }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgUS500WindowAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  const train = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const test = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  const md = [];
  md.push('# US500 — fenêtre horaire (8h-12h vs 10h-11h vs journée entière), moteur single-touch PRODUCTION');
  md.push('');
  md.push(
    "Question directe d'Esdras (2026-09-12) juste après le déploiement de la fenêtre 8h-12h sur US100 : " +
      '"US500 n\'a jamais été testé sur 8h-12h ? Sinon teste-le." Contrairement à US100, US500 n\'a jamais eu de ' +
      "multi-contact validé (`CONFIG.fvg.perSymbol.US500.multiTouch` n'existe pas) - donc ce test reprend le moteur " +
      "single-touch RÉELLEMENT en production pour US500 aujourd'hui (config verbatim, seule la fenêtre change), pas " +
      "une version hypothétique jamais validée."
  );
  md.push('');
  md.push('| Fenêtre | Trades train | Espérance train (R) | Trades test | Espérance test (R) | R total test | Drawdown max test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|');

  const results = {};
  for (const w of WINDOWS) {
    const trainR = runOneConfig(train, SYMBOL, SPREAD, w.cfg);
    const testR = runOneConfig(test, SYMBOL, SPREAD, w.cfg);
    results[w.key] = { trainR, testR };
    const v = verdict(trainR.summaryNet.expectancyR, testR.summaryNet.expectancyR, trainR.summaryNet.totalSignals, testR.summaryNet.totalSignals);
    md.push(
      `| ${w.key} | ${trainR.summaryNet.totalSignals} | ${fmtNum(trainR.summaryNet.expectancyR)} | ${testR.summaryNet.totalSignals} | ` +
        `${fmtNum(testR.summaryNet.expectancyR)} | ${fmtNum(testR.summaryNet.finalEquityR)} | ${fmtNum(testR.summaryNet.maxDrawdownR)} | ${v} |`
    );
    console.error(`[${w.key}] train n=${trainR.summaryNet.totalSignals} exp=${fmtNum(trainR.summaryNet.expectancyR)} | test n=${testR.summaryNet.totalSignals} exp=${fmtNum(testR.summaryNet.expectancyR)}`);
  }
  md.push('');

  const current = results['10h-11h (production actuelle)'];
  const wide = results['08h-12h'];
  const currentExp = current.testR.summaryNet.expectancyR;
  const wideExp = wide.testR.summaryNet.expectancyR;
  const better = wideExp !== null && currentExp !== null && wideExp > currentExp;
  md.push(
    `**Verdict pour US500** : ${better ? '8h-12h a une meilleure espérance test' : '10h-11h reste meilleur ou équivalent en espérance test'} ` +
      `(${fmtNum(wideExp)}R vs ${fmtNum(currentExp)}R). ` +
      `${wide.testR.summaryNet.totalSignals < MIN_TRADES_FOR_VERDICT || current.testR.summaryNet.totalSignals < MIN_TRADES_FOR_VERDICT
        ? "⚠️ Au moins un des deux échantillons test est trop petit (<10 trades) pour un verdict fiable."
        : ''}`
  );

  const outMd = path.join(dir, 'fvg-us500-window-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
