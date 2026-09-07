#!/usr/bin/env node
// runBacktestReport.js
// Usage: node scripts/runBacktestReport.js <dir-with-csvs>
//
// Expects one M15 CSV per instrument, named <SYMBOL>.csv (e.g. US100.csv,
// US500.csv, EURUSD.csv, GBPUSD.csv) — TradingView/MT5/cTrader export.
// H1 and H4 candles are DERIVED from this same M15 data (no separate export
// needed), guaranteeing the HTF bias is perfectly consistent with the M15
// signals it's filtering.
//
// For each symbol, runs a grid of:
//   - HTF EMA bias variant: baseline (none) + {H1,H4} x {EMA20,50,200}  = 7
//   - ICT market-structure (BOS) filter: off / on                        = 2
//   - NY AM (08:00-12:00 New York time, DST-aware) session filter: off/on = 2
//   - stop mode: fvg-edge / swing                                        = 2
//   - R:R target: 1 / 2 / 3                                              = 3
// = 168 configs per instrument, so you can see, objectively, whether each
// filter (HTF bias, market structure, session) actually helps — alone or
// combined.
//
// Writes:
//   - backtest-results.json   (every single config + every trade, full detail)
//   - backtest-report.md      (readable summary tables)

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { computeCorrelationMatrix } from '../src/backtest/correlation.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import {
  runGrid,
  rankKey,
  MIN_DISTANCE_SPREAD_MULTIPLE,
  MIN_SIGNALS_FOR_RANKING,
  STRUCTURE_LOOKBACK,
  NY_AM_SESSION,
} from '../src/backtest/gridRunner.js';

function fmtPct(x) {
  return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
}
function fmtNum(x, d = 2) {
  return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d);
}
function fmtBool(b) {
  return b ? 'ON' : 'off';
}

function bestOf(rows) {
  return rows.reduce((a, b) => (rankKey(b) > rankKey(a) ? b : a));
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runBacktestReport.js <dir-with-csvs>');
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    console.error(`No .csv files found in ${dir}`);
    process.exit(1);
  }

  const fullDump = {}; // symbol -> results (with trades)
  const mdSections = [];

  mdSections.push('# Résultats du backtest — ICT FVG (M15) : biais HTF, structure de marché (BOS), session NY AM');
  mdSections.push('');
  mdSections.push(
    '⚠ Hypothèses : entrée au bord de la zone FVG, une seule position ouverte à la fois par instrument, ' +
      "stop supposé touché en premier en cas d'ambiguïté sur une même bougie, config classées seulement " +
      `si ≥ ${MIN_SIGNALS_FOR_RANKING} signaux (sinon échantillon trop petit pour être fiable). ` +
      'H1/H4 sont recalculés depuis les mêmes bougies M15 (pas de fichier séparé nécessaire).'
  );
  mdSections.push('');
  mdSections.push(
    `⚠ **Structure de marché (ICT BOS)** : pivot haut/bas confirmé après ${STRUCTURE_LOOKBACK} bougies de chaque côté ` +
      "(fractale symétrique, aucune anticipation). Le biais passe à haussier dès qu'une clôture dépasse le dernier " +
      'pivot haut confirmé (Break of Structure), et inversement pour baissier. Une entrée FVG n\'est gardée que si elle ' +
      "va dans le sens du biais de structure en cours — exactement le même principe que le filtre de biais HTF, mais basé "+
      'sur les swings de prix plutôt que sur une EMA.'
  );
  mdSections.push('');
  mdSections.push(
    `⚠ **Session NY AM (${NY_AM_SESSION.startHour}h-${NY_AM_SESSION.endHour}h, heure de New York)** : n'autorise une ` +
      "entrée que si la bougie de validation FVG tombe dans cette fenêtre, en heure LOCALE de New York réelle (donc " +
      "sensible à l'heure d'été — les données HistData sont en EST fixe toute l'année ; la conversion tient compte du " +
      "décalage DST pour retrouver la vraie heure de New York, voir src/backtest/nySession.js pour le détail)."
  );
  mdSections.push('');
  mdSections.push(
    '⚠⚠ **Mise en garde sur les tableaux "meilleure config"** : ce rapport teste 168 configurations par instrument. ' +
      'Choisir la meilleure après coup sur les mêmes données ("data snooping") gonfle artificiellement ' +
      "les résultats — une partie de ce qui a l'air bon n'est que du bruit statistique qui a eu de la chance " +
      "sur CET échantillon précis. Le fichier train-test-validation.md (à régénérer avec " +
      'scripts/runTrainTestValidation.js) vérifie si les configs qui semblent gagnantes ici tiennent sur des ' +
      'données jamais vues.'
  );
  mdSections.push('');

  // --- Load every CSV first (needed up front for the cross-symbol correlation section) ---
  const candlesBySymbol = {};
  const dataInfoBySymbol = {};
  for (const file of files) {
    const symbol = path.basename(file, '.csv').toUpperCase();
    const filePath = path.join(dir, file);
    let loaded;
    try {
      loaded = loadCandlesFromCsv(filePath);
    } catch (err) {
      console.error(`[skip] ${file}: ${err.message}`);
      continue;
    }
    const { candles, skippedRows, totalRows } = loaded;
    if (candles.length < 200) {
      console.error(`[skip] ${symbol}: only ${candles.length} usable M15 candles — too few, especially for EMA200 on H4 (needs 800h+ of data)`);
      continue;
    }
    candlesBySymbol[symbol] = candles;
    dataInfoBySymbol[symbol] = {
      candleCount: candles.length,
      skippedRows,
      totalRows,
      from: new Date(candles[0].time).toISOString().slice(0, 10),
      to: new Date(candles[candles.length - 1].time).toISOString().slice(0, 10),
    };
  }

  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    const info = dataInfoBySymbol[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;
    console.error(`[${symbol}] running 168-config grid over ${info.candleCount} candles...`);
    const results = runGrid(candles, symbol, spread);
    fullDump[symbol] = results;

    mdSections.push(`## ${symbol}`);
    mdSections.push(`Données: ${info.candleCount} bougies M15, du ${info.from} au ${info.to} (${info.skippedRows} lignes ignorées sur ${info.totalRows}).`);
    mdSections.push(
      `Coût de transaction appliqué: spread de ${spread} (${spread === 0 ? 'AUCUN — instrument non reconnu, vérifie DEFAULT_SPREADS' : 'indicatif, à vérifier contre le vrai spread FundingPips/cTrader'}), ` +
        `signaux dont le stop < ${MIN_DISTANCE_SPREAD_MULTIPLE}x le spread exclus (non-viables : le spread dominerait le risque). ` +
        '"R net"/"Win rate net" = sur les signaux viables après coût ; "R brut" = tel quel, sans rien de tout ça.'
    );
    mdSections.push('');

    // --- Baseline table (no HTF, no structure, no session) — the original reference ---
    mdSections.push('### Référence : sans aucun filtre (ni HTF, ni structure, ni session)');
    mdSections.push('| Stop | R visé | Signaux (brut) | Non-viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) | Résultat net (R) |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of results.filter((r) => r.variant === 'baseline' && !r.structureEnabled && !r.sessionEnabled)) {
      const s = r.summary;
      const n = r.summaryNet;
      mdSections.push(
        `| ${r.stopMode} | 1:${r.rrMultiple} | ${s.totalSignals} | ${r.droppedAsNonViable} | ${fmtPct(n.winRate)} | ${fmtNum(s.avgR)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} | ${fmtNum(n.maxDrawdownR)} | ${fmtNum(n.finalEquityR)} |`
      );
    }
    mdSections.push('');

    // --- Impact of structure/session filters: best config found within each of the 4 combos ---
    mdSections.push("### Impact des filtres structure ICT (BOS) et session NY AM (meilleure config par combinaison, toutes variantes HTF confondues)");
    mdSections.push('| Structure | Session NY AM | Meilleure variante | Stop | R visé | Signaux viables | Win rate net | R net | Profit factor (net) | Max DD net (R) |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const structureEnabled of [false, true]) {
      for (const sessionEnabled of [false, true]) {
        const rows = results.filter((r) => r.structureEnabled === structureEnabled && r.sessionEnabled === sessionEnabled);
        const best = bestOf(rows);
        const n = best.summaryNet;
        const note = best.summary.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' (échantillon faible)' : '';
        mdSections.push(
          `| ${fmtBool(structureEnabled)} | ${fmtBool(sessionEnabled)} | ${best.variant} | ${best.stopMode} | 1:${best.rrMultiple} | ${n.totalSignals}${note} | ${fmtPct(n.winRate)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} | ${fmtNum(n.maxDrawdownR)} |`
        );
      }
    }
    mdSections.push('');

    // --- Best config per HTF variant (across all structure/session/stopMode/RR combos) ---
    mdSections.push('### Meilleure config par variante de biais HTF (classée par R net, structure/session inclus dans la recherche)');
    mdSections.push('| Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|---|');
    const variants = [...new Set(results.filter((r) => r.variant !== 'baseline').map((r) => r.variant))];
    for (const variant of variants) {
      const rows = results.filter((r) => r.variant === variant);
      const best = bestOf(rows);
      const s = best.summary;
      const n = best.summaryNet;
      const note = s.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' (échantillon faible)' : '';
      mdSections.push(
        `| ${variant} | ${fmtBool(best.structureEnabled)} | ${fmtBool(best.sessionEnabled)} | ${best.stopMode} | 1:${best.rrMultiple} | ${n.totalSignals}${note} | ${fmtPct(n.winRate)} | ${fmtNum(s.avgR)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} | ${fmtNum(n.maxDrawdownR)} |`
      );
    }
    mdSections.push('');

    // --- Top 10 overall (all 168 configs), ranked by NET expectancy ---
    const allRanked = [...results].sort((a, b) => rankKey(b) - rankKey(a)).slice(0, 10);
    mdSections.push('### Top 10 configurations toutes variantes confondues (classées par espérance R NETTE)');
    mdSections.push('| # | Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    allRanked.forEach((r, i) => {
      const n = r.summaryNet;
      mdSections.push(
        `| ${i + 1} | ${r.variant} | ${fmtBool(r.structureEnabled)} | ${fmtBool(r.sessionEnabled)} | ${r.stopMode} | 1:${r.rrMultiple} | ${n.totalSignals} | ${fmtPct(n.winRate)} | ${fmtNum(r.summary.avgR)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} | ${fmtNum(n.maxDrawdownR)} |`
      );
    });
    mdSections.push('');
  }

  if (Object.keys(fullDump).length === 0) {
    console.error('No usable results produced - check the CSV files above.');
    process.exit(1);
  }

  // --- Cross-symbol correlation (informs single vs. multi-pair live decisions) ---
  const symbolsForCorrelation = Object.keys(candlesBySymbol);
  if (symbolsForCorrelation.length >= 2) {
    const { matrix, overlapCounts } = computeCorrelationMatrix(candlesBySymbol);
    mdSections.push('## Corrélation entre instruments (rendements M15)');
    mdSections.push(
      "Corrélation de Pearson calculée sur les rendements M15, uniquement sur les horodatages communs entre chaque paire " +
        '(gère les différences de sessions de trading entre indices et forex). ' +
        '|r| > 0.7 = fortement corrélé (ne pas compter comme diversifiant) ; |r| < 0.3 = faiblement corrélé (bon candidat pour combiner 2 paires).'
    );
    mdSections.push('');
    mdSections.push('| | ' + symbolsForCorrelation.join(' | ') + ' |');
    mdSections.push('|---|' + symbolsForCorrelation.map(() => '---').join('|') + '|');
    for (const a of symbolsForCorrelation) {
      const row = symbolsForCorrelation.map((b) => {
        const r = matrix[a][b];
        if (r === null) return `n/a (${overlapCounts[a][b]} pts communs)`;
        return fmtNum(r, 2);
      });
      mdSections.push(`| **${a}** | ${row.join(' | ')} |`);
    }
    mdSections.push('');
  }

  // Strip per-trade detail (and the per-trade equityCurve inside each
  // summary) before serializing: at 168 configs x 2 symbols, including every
  // individual trade blows past V8's JSON.stringify string-length limit.
  // The report tables above already carry every aggregate stat that matters;
  // re-run a specific config via runOneConfig() if per-trade detail is ever
  // needed for one particular combination.
  const lightDump = {};
  for (const [symbol, results] of Object.entries(fullDump)) {
    lightDump[symbol] = results.map(({ trades, summary, summaryNet, ...rest }) => ({
      ...rest,
      summary: { ...summary, equityCurve: undefined },
      summaryNet: { ...summaryNet, equityCurve: undefined },
    }));
  }

  const outJson = path.join(dir, 'backtest-results.json');
  fs.writeFileSync(outJson, JSON.stringify(lightDump, null, 2));

  const outMd = path.join(dir, 'backtest-report.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main();
