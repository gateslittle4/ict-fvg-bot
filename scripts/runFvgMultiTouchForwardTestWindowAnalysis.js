#!/usr/bin/env node
// runFvgMultiTouchForwardTestWindowAnalysis.js
// Usage: node scripts/runFvgMultiTouchForwardTestWindowAnalysis.js <forward-test-dir>
//
// Esdras's explicit follow-up (2026-09-12): "maintenant tu as accès aux
// données de 7 mois live, dis-moi 8h-12h vs 10h-11h, lequel aurait été
// meilleur ?" - using data/forward-test-2026/US100.csv, REAL candles
// exported live from the cTrader account (2026-02-05 -> 2026-09-09, see
// that directory's own results.md), not the 2019-2025 historical CSVs used
// everywhere else in this project. This period has NEVER been used to
// choose any parameter (session window included) - a genuine out-of-sample
// check, not a third split of the same historical data.
//
// Same US100 multi-contact config as every other window comparison this
// session (MultiTouchFvgEngine, RR=5, H4_EMA200 bias, structure+sweep
// enabled, stop fvg-edge) - only sessionWindow changes between runs. No
// train/test split here: the entire 7 months IS the out-of-sample period,
// so it is reported as one continuous window per session-window variant.
//
// ⚠ Sample size warning up front, not buried at the bottom: this is ~7
// months of REAL candles, not 7 YEARS. The already-published single-touch
// forward-test (results.md) found only 3 net US100 trades in this window -
// multi-touch takes more (a rejected touch doesn't kill the zone), but this
// is still nowhere near enough trades for a statistically meaningful
// verdict either way. Read as "what actually happened", not "proof of
// which window is better".
//
// ⚠ TIME-ZONE FIX (2026-09-17, found while forward-testing Silver Bullet -
// see HANDOFF.md): this script originally fed the exported CSV straight
// into isInNySessionWindow() without converting it first. getHistoricalCandles()
// (src/dataSources/cTraderDataSource.js) exports candles in GENUINE UTC (see
// that file's own comment on _trendbarToCandle: "Do NOT feed this straight
// into the strategy engine — see _toEngineCandle()"), but isInNySessionWindow
// (used here by buildMultiTouchFilterPredicate's session-window check)
// assumes the historical CSVs' fixed-EST-as-UTC convention (nySession.js's
// own header: ".time is always exactly 5h BEHIND true UTC"). The live bot
// itself converts real UTC candles via _toEngineCandle() before ever
// handing them to the strategy engine - this script now applies the SAME
// conversion before backtesting, so 8h-12h/10h-11h are evaluated against
// the correct real NY hour. The ORIGINAL (buggy) run of this script is
// still referenced from HANDOFF.md's "8h-12h n'est-il pas un meilleur
// compromis ?" section - re-run after this fix to see whether its
// conclusion changes.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { CONFIG } from '../src/config.js';

const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOL = 'US100';
const BASE_CFG = CONFIG.fvg.perSymbol.US100;
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;

const WINDOWS = [
  { key: '08h-12h', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } } },
  { key: '10h-11h (production)', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } } },
  { key: 'toute la journée', cfg: { ...BASE_CFG, sessionEnabled: false } },
];

function withCosts(trades) {
  const viable = trades.filter((t) => !SPREAD || t.distance >= SPREAD * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = SPREAD > 0 ? SPREAD / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—'; }
function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgMultiTouchForwardTestWindowAnalysis.js <forward-test-dir>'); process.exit(1); }

  const { candles: rawCandles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  // Real calendar range for display - from the ORIGINAL genuine-UTC candles,
  // not the shifted engine-time ones below (shifting by 5h would misstate
  // the displayed start/end date by up to a day at the edges).
  const firstTime = rawCandles[0]?.time;
  const lastTime = rawCandles[rawCandles.length - 1]?.time;
  // Genuine UTC (cTrader export) -> engine time (fixed-EST-as-UTC) - see this
  // file's own time-zone-fix header comment. Used for the actual backtest/
  // session-window evaluation below.
  const candles = rawCandles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));

  const md = [];
  md.push('# US100 multi-contact — 8h-12h vs 10h-11h vs journée entière, sur les 7 mois RÉELS de forward-test');
  md.push('');
  md.push(
    `Question directe d'Esdras (2026-09-12) : "maintenant tu as accès aux données de 7 mois live, dis-moi 8h-12h ` +
      `vs 10h-11h, lequel aurait été meilleur ?" Bougies RÉELLES exportées du compte cTrader ` +
      `(\`${fmtDate(firstTime)}\` → \`${fmtDate(lastTime)}\`, voir \`data/forward-test-2026/results.md\`), jamais ` +
      "utilisées pour choisir un paramètre - un vrai hors-échantillon, pas un troisième découpage des mêmes " +
      "données historiques 2019-2025. US100 multi-contact, config production verbatim à part la fenêtre testée."
  );
  md.push('');
  md.push(
    '⚠ **Échantillon minuscule, à lire avant les chiffres** : 7 MOIS réels, pas 7 ans. Le forward-test déjà publié ' +
      '(contact unique) ne trouvait que 3 trades nets sur toute la période pour US100 — le multi-contact en prend ' +
      "plus (un contact raté ne tue plus la zone), mais on reste très loin d'un échantillon statistiquement " +
      'valable dans les deux cas. Ceci décrit ce qui est arrivé, ce n\'est pas une preuve de laquelle des deux fenêtres est la meilleure.'
  );
  md.push('');
  md.push('| Fenêtre | Trades | Win rate | Espérance (R) | R total | Drawdown max (R) |');
  md.push('|---|---|---|---|---|---|');

  const results = {};
  for (const w of WINDOWS) {
    const predicate = buildMultiTouchFilterPredicate(candles, SYMBOL, w.cfg);
    const engine = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: predicate });
    const trades = withCosts(runBacktest({ candles, symbol: SYMBOL, fvgEngine: engine, stopMode: w.cfg.stopMode, rrMultiple: w.cfg.rrMultiple }));
    const summary = summarizeTrades(trades);
    results[w.key] = { trades, summary };
    const wr = summary.winRate;
    md.push(`| ${w.key} | ${summary.totalSignals} | ${fmtPct(wr)} | ${fmtNum(summary.expectancyR)} | ${fmtNum(summary.finalEquityR)} | ${fmtNum(summary.maxDrawdownR)} |`);
    console.error(`[${w.key}] n=${summary.totalSignals} exp=${fmtNum(summary.expectancyR)} Rtot=${fmtNum(summary.finalEquityR)} maxDD=${fmtNum(summary.maxDrawdownR)}`);
  }
  md.push('');

  md.push('## Détail des trades, fenêtre par fenêtre');
  md.push('');
  for (const w of WINDOWS) {
    const { trades } = results[w.key];
    md.push(`### ${w.key} (n=${trades.length})`);
    if (trades.length === 0) {
      md.push('_Aucun trade._');
      md.push('');
      continue;
    }
    md.push('| Entrée | Direction | Résultat | R |');
    md.push('|---|---|---|---|');
    for (const t of trades) {
      // +FIXED_EST_TO_UTC_OFFSET_MS: t.entryTime is engine time (shifted -5h
      // for the backtest above) - shift back to real UTC for display.
      md.push(`| ${fmtDate(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS)} | ${t.direction === 'bullish' ? 'achat' : 'vente'} | ${t.outcome} | ${t.rMultiple >= 0 ? '+' : ''}${fmtNum(t.rMultiple)} |`);
    }
    md.push('');
  }

  const best = WINDOWS.reduce((a, b) => (results[b.key].summary.finalEquityR > results[a.key].summary.finalEquityR ? b : a));
  md.push(
    `**Sur ces 7 mois précis**, la fenêtre au R total le plus haut est **${best.key}** ` +
      `(${fmtNum(results[best.key].summary.finalEquityR)}R). Avec un échantillon aussi petit, un seul trade ` +
      "gagnant ou perdant suffit à faire basculer ce classement - ce résultat en dit plus sur CE QUI EST ARRIVÉ " +
      "que sur QUELLE FENÊTRE EST STRUCTURELLEMENT MEILLEURE (voir plutôt fvg-multi-touch-window-weekday-analysis.md " +
      "et ftmo-1step-us100-only-8to12-account-impact.md pour ça, sur 7 ANNÉES)."
  );

  const outMd = path.join(dir, 'fvg-multi-touch-forward-test-window-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
