#!/usr/bin/env node
// runCbdrForwardTestAnalysis.js
// Usage: node scripts/runCbdrForwardTestAnalysis.js <real-data-dir>
//
// Forward-test of CBDR standalone on REAL cTrader-exported candles
// (data/real-data-2026-02-to-09/, 2026-02-10 -> 2026-09-16), never used to
// choose ANY parameter of cbdr.js (CBDR_WINDOW, STANDARD_DEVIATIONS,
// RR_MULTIPLE, MAX_HOLDING_CANDLES - all published/standard values fixed
// BEFORE this script ran, same discipline as every other mechanism in this
// project). A genuine out-of-sample check, distinct from the 2019-2025
// historical CSVs' train/test split already done in
// data/backtest-input/cbdr-strategy-analysis.md. Same next step Esdras took
// for Silver Bullet before that mechanism went live (see
// runSilverBulletForwardTestAnalysis.js, this script's direct template) -
// Esdras: "On le teste sérieusement avant. Comme les autres [paires]" -
// same rigor, same real data, before considering CBDR for real capital.
//
// SCOPE NOTE, stated honestly rather than silently worked around: CBDR's
// historical train/test held on 4 instruments (US100, EURUSD, GBPUSD,
// GER40 - see cbdr-strategy-analysis.md). The real-cTrader-export data
// this script needs (data/real-data-2026-02-to-09/, data/real-data-2026-09-17/)
// only has US100/US500/EURUSD/GER40/XAUUSD - NO GBPUSD file exists in this
// repo. This script therefore forward-tests 3 of the 4 held instruments
// (US100, EURUSD, GER40); GBPUSD stays unverified on real data until a
// GBPUSD export exists (same "don't invent it" discipline as everywhere
// else in this project).
//
// Same time-zone conversion as runSilverBulletForwardTestAnalysis.js's own
// header explains in full: the exported CSVs are genuine UTC, but CBDR's
// own NY-hour window (14:00-20:00, via computeAsianRanges()/isInNySessionWindow)
// assumes the fixed-EST-as-UTC convention every historical CSV and the live
// bot itself use - converted here the same way _toEngineCandle() does live.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { runCbdrBacktest, CBDR_WINDOW, STANDARD_DEVIATIONS, RR_MULTIPLE, MAX_HOLDING_CANDLES } from '../src/backtest/cbdr.js';

const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runCbdrForwardTestAnalysis.js <real-data-dir>');
    process.exit(1);
  }

  // SCOPE NOTE (honest, not silently skipped): unlike
  // runSilverBulletForwardTestAnalysis.js, this script does NOT attempt a
  // production-overlap reconstruction (which of these CBDR trades happen
  // during a time window an already-live mechanism would also be in a real
  // position for). The live combo has grown to 7 mechanisms across
  // different symbol subsets since that template was written, and mirroring
  // it here from scratch risks a subtly stale reconstruction (config.js
  // drifts independently of this script) - reporting a WRONG "redundancy"
  // number would be worse than reporting none. CBDR's own standalone
  // forward-test result below is the decision-relevant number either way:
  // does the published mechanism, on real never-touched data, still show
  // the same train->test signature the historical split found.
  const symbols = ['US100', 'EURUSD', 'GER40'];
  const available = symbols.filter((s) => fs.existsSync(path.join(dir, `${s}.csv`)));
  const missing = symbols.filter((s) => !fs.existsSync(path.join(dir, `${s}.csv`)));

  const md = [];
  md.push('# Forward-test CBDR autonome — vraies données cTrader');
  md.push('');
  md.push(
    `⚠ Quelques mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce ` +
      `projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Ces données ` +
      `n'ont JAMAIS servi à choisir un paramètre de CBDR (fenêtre ${CBDR_WINDOW.startHour}h-${CBDR_WINDOW.endHour}h NY, ` +
      `${STANDARD_DEVIATIONS} écarts-types, RR 1:${RR_MULTIPLE}, timeout ${MAX_HOLDING_CANDLES} bougies) - valeurs publiées, ` +
      `fixées et validées sur les CSV historiques 2019-2025 avant que ce dossier n'existe. Conversion fuseau horaire ` +
      `appliquée (voir en-tête du script) : les bougies exportées sont en UTC réel, converties en "heure moteur" ` +
      `(UTC-5 fixe) avant tout calcul de fenêtre de session, exactement comme le fait le bot live lui-même.`
  );
  md.push('');
  if (missing.length > 0) {
    md.push(
      `⚠ **GBPUSD absent** : CBDR tenait aussi sur GBPUSD dans le découpage historique (cbdr-strategy-analysis.md), ` +
        `mais aucun export cTrader réel de GBPUSD n'existe dans ce dépôt (\`${dir}/GBPUSD.csv\` manquant) - ` +
        `non vérifié sur données réelles ici plutôt que deviné. Symboles testés : ${available.join(', ')}.`
    );
    md.push('');
  }
  md.push('| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) |');
  md.push('|---|---|---|---|---|---|---|---|---|');

  const results = [];
  for (const symbol of available) {
    const { candles: rawCandles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const candles = toEngineTime(rawCandles);

    const trades = withCosts(runCbdrBacktest(candles), symbol);
    const summary = summarizeTrades(trades);
    results.push({ symbol, summary });

    md.push(
      `| ${symbol} | ${summary.totalSignals} | ${summary.wins ?? '—'} | ${summary.losses ?? '—'} | ${summary.timeouts ?? '—'} | ` +
        `${fmtPct(summary.winRate)} | ${fmtNum(summary.finalEquityR)} | ${fmtNum(summary.profitFactor)} | ${fmtNum(summary.expectancyR)} |`
    );
    console.error(`[${symbol}] n=${summary.totalSignals} wr=${fmtPct(summary.winRate)} totalR=${fmtNum(summary.finalEquityR)} exp=${fmtNum(summary.expectancyR, 4)}`);
  }

  md.push('');
  const held = results.filter((r) => r.summary.expectancyR !== null && r.summary.expectancyR > 0);
  md.push(
    `**Bilan** : ${held.length}/${available.length} instrument(s) testé(s) montrent une espérance positive sur ce ` +
      `fenêtre réelle jamais vue par le réglage de CBDR (${held.map((r) => r.symbol).join(', ') || 'aucun'}). ` +
      `Ceci confirme ou infirme uniquement le signal LUI-MÊME - ni recommandation ni rejet pour du capital réel n'est ` +
      `automatique à partir de ce seul résultat, à lire avec Esdras avant toute décision de mise en production.`
  );

  const outMd = path.join(dir, 'cbdr-forward-test.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
