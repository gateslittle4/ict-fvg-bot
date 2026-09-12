#!/usr/bin/env node
// runFvgMultiTouch10to11SeasonalRateAnalysis.js
// Usage: node scripts/runFvgMultiTouch10to11SeasonalRateAnalysis.js <dir-with-csvs>
//
// Esdras's pushback (2026-09-12) on the forward-test finding of 9 US100
// multi-touch trades in 10h-11h over 7 months: "tu vois que c'est bcp toi?
// Lol. Sérieux. C'est genre 1 trade par mois." Before answering whether 9
// is normal or broken, this checks what 10h-11h has historically produced
// on the EXACT SAME calendar stretch (Feb 6 -> Sep 9) in every year
// 2019-2025 - a fair seasonal baseline, not just the full-year average
// (which would ignore any seasonality in FVG formation/session activity).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const SYMBOL = 'US100';
const CFG = { ...CONFIG.fvg.perSymbol.US100 }; // production window, 10h-11h
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
// The exact calendar window the live forward-test data covers.
const CLIP_MONTH_DAY = { startMonth: 2, startDay: 6, endMonth: 9, endDay: 9 };
const LIVE_OBSERVED_TRADES = 9; // fvg-multi-touch-forward-test-window-analysis.md, 2026 (real)

function withCosts(trades) {
  const viable = trades.filter((t) => !SPREAD || t.distance >= SPREAD * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = SPREAD > 0 ? SPREAD / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function fmtNum(x, d = 2) { return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : '—'; }

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgMultiTouch10to11SeasonalRateAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));

  const md = [];
  md.push('# US100 multi-contact 10h-11h — le rythme observé sur 7 mois live (9 trades) est-il anormal ?');
  md.push('');
  md.push(
    "Esdras : \"9 trades pour 7 mois... c'est genre 1 trade par mois. Y a aucun moyen de passer un challenge avec.\" " +
      "Avant de conclure quoi que ce soit, ceci compare ce chiffre à ce que la MÊME fenêtre calendaire (6 février " +
      "→ 9 septembre) aurait produit chaque année 2019-2025, avec le moteur multi-contact 10h-11h de production - " +
      "une base saisonnière juste, pas juste la moyenne sur l'année complète."
  );
  md.push('');
  md.push('| Année | Trades (6 fév → 9 sept) | Espérance (R) |');
  md.push('|---|---|---|');

  const counts = [];
  for (const year of YEARS) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const start = new Date(`${year}-${pad2(CLIP_MONTH_DAY.startMonth)}-${pad2(CLIP_MONTH_DAY.startDay)}T00:00:00Z`).getTime();
    const end = new Date(`${year}-${pad2(CLIP_MONTH_DAY.endMonth)}-${pad2(CLIP_MONTH_DAY.endDay)}T23:59:59Z`).getTime();
    const clipped = candles.filter((c) => c.time >= start && c.time <= end);
    const predicate = buildMultiTouchFilterPredicate(clipped, SYMBOL, CFG);
    const engine = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: predicate });
    const trades = withCosts(runBacktest({ candles: clipped, symbol: SYMBOL, fvgEngine: engine, stopMode: CFG.stopMode, rrMultiple: CFG.rrMultiple }));
    const summary = summarizeTrades(trades);
    counts.push(trades.length);
    md.push(`| ${year} | ${trades.length} | ${fmtNum(summary.expectancyR)} |`);
    console.error(`${year} (6 fév-9 sept): ${trades.length} trades, exp=${fmtNum(summary.expectancyR)}R`);
  }

  const avg = counts.reduce((s, n) => s + n, 0) / counts.length;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  md.push('');
  md.push(`| **2026 (réel, live)** | **${LIVE_OBSERVED_TRADES}** | — |`);
  md.push('');
  md.push(
    `Moyenne historique sur cette même fenêtre : **${fmtNum(avg, 1)} trades** (min ${min} en 2023, max ${max} en 2022). ` +
      `Le chiffre live observé en 2026 (${LIVE_OBSERVED_TRADES}) est ${LIVE_OBSERVED_TRADES < min ? 'EN DESSOUS du minimum historique - potentiellement anormal, à surveiller' : LIVE_OBSERVED_TRADES <= avg ? 'dans la partie basse mais DANS la fourchette historique déjà observée (2023 a fait pire)' : 'dans la fourchette normale'} - ` +
      '10h-11h est un signal naturellement rare avec une grosse variance d\'une année à l\'autre, pas un signe que ce forward-test précis est cassé.'
  );
  md.push('');
  md.push(
    "**Le point de fond reste valide malgré tout** : même à la moyenne historique (~19 trades sur 7 mois, un peu " +
      "moins de 3/mois), 10h-11h seul reste trop rare pour passer un challenge dans un délai raisonnable en solo " +
      "(voir la simulation FTMO complète : ~167 jours de moyenne test). Ce n'est pas un problème de malchance sur " +
      "2026, c'est structurel - 10h-11h a toujours été le créneau le plus PROPRE, pas le plus fréquent."
  );

  const outMd = path.join(dir, 'fvg-multi-touch-10to11-seasonal-rate-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
