#!/usr/bin/env node
// runFvgXauusdWindowAnalysis.js
// Usage: node scripts/runFvgXauusdWindowAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12), after the US500 window check: "teste XAUUSD aussi
// sur 8h-12h." XAUUSD's production window is NOT the Silver Bullet 10h-11h
// used by US100/US500 - it's the London-NY overlap 7h-10h
// (LONDON_NY_OVERLAP_WINDOW in config.js), the one instrument that already
// uses a different window than the other two. XAUUSD also has no validated
// multi-touch (CONFIG.fvg.perSymbol.XAUUSD.multiTouch is unset) and uses
// stopMode 'swing' instead of 'fvg-edge' - this tests the REAL production
// single-touch engine, config verbatim except the session window, against
// its actual current window (7h-10h) rather than the 10h-11h baseline used
// for US100/US500.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runOneConfig } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOL = 'XAUUSD';
const BASE_CFG = CONFIG.fvg.perSymbol.XAUUSD;
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;

const WINDOWS = [
  { key: '08h-12h', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } } },
  { key: '07h-10h (production actuelle)', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 7, endHour: 10 } } },
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
  if (!dir) { console.error('Usage: node scripts/runFvgXauusdWindowAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  const train = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const test = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  const md = [];
  md.push('# XAUUSD — fenêtre horaire (8h-12h vs 7h-10h vs journée entière), moteur single-touch PRODUCTION');
  md.push('');
  md.push(
    "Question directe d'Esdras (2026-09-12), après la vérification US500 : \"teste XAUUSD aussi sur 8h-12h.\" " +
      "XAUUSD tourne sur 7h-10h (London-NY overlap) en production, PAS 10h-11h comme US100/US500 - c'est sa vraie " +
      "fenêtre de référence ici, pas un choix arbitraire pour la comparaison. Pas de multi-contact validé sur " +
      "XAUUSD non plus - moteur single-touch réel, config verbatim (stop `swing`, RR=4), seule la fenêtre change."
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

  const current = results['07h-10h (production actuelle)'];
  const wide = results['08h-12h'];
  const currentExp = current.testR.summaryNet.expectancyR;
  const wideExp = wide.testR.summaryNet.expectancyR;
  const better = wideExp !== null && currentExp !== null && wideExp > currentExp;
  md.push(
    `**Verdict pour XAUUSD** : ${better ? '8h-12h a une meilleure espérance test' : '7h-10h reste meilleur ou équivalent en espérance test'} ` +
      `(${fmtNum(wideExp)}R vs ${fmtNum(currentExp)}R). ` +
      `${wide.testR.summaryNet.totalSignals < MIN_TRADES_FOR_VERDICT || current.testR.summaryNet.totalSignals < MIN_TRADES_FOR_VERDICT
        ? "⚠️ Au moins un des deux échantillons test est trop petit (<10 trades) pour un verdict fiable."
        : ''}`
  );

  const outMd = path.join(dir, 'fvg-xauusd-window-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
