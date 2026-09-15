#!/usr/bin/env node
// replayLastWeekOnRealData.js
// Usage: node scripts/replayLastWeekOnRealData.js <dir-with-candle-jsons>
//
// Esdras: "j'aimerais voir combien de trade j'aurais fait la semaine
// dernière si le bot était déjà disponible" — a counterfactual using REAL
// broker candles (not backtest CSVs, which stop at 2025-12-31 and can't
// cover last week), replayed through the EXACT SAME LiveStrategyEngine that
// runs live in production (same construction as accountRuntime.js: fvg +
// divergence + nwog + judasSwing + weeklySweep configs, straight from
// CONFIG, not reimplemented) - this is the real production combo, not a
// separate approximation.
//
// Input: one file per real symbol (US100/US500/XAUUSD/EURUSD/GER40), EITHER:
//   - a JSON file `{ candles: [...] }`, from the bot's own retained M15
//     history via GET /api/accounts/default/candles?symbol=X&limit=5000
//     (already real UTC, offset-corrected server-side) - capped at ~2.5
//     months back (route's own 5000-candle response cap, see HANDOFF.md);
//   - a CSV file `time,open,high,low,close`, from the admin-gated
//     GET /api/admin/export-candles?symbol=X&days=245&token=... (cTrader's
//     own single-request cap, ~35 weeks/245 days - reaches back much
//     further than the JSON route above, e.g. ~7 months). Same format
//     loadCandlesFromCsv() already reads for the historical backtest CSVs.
// Auto-detected per-file by extension so the same replay logic serves both.
//
// BTCUSD is deliberately excluded - it's the documented temporary
// connectivity smoke test (no HTF bias/structure/session filters, meant to
// be removed), not a validated mechanism, and would need its own native M1
// fetch to replay faithfully. Pyramid assumed OFF (CONFIG.pyramid.enabled
// reads PYRAMID_ENABLED, unset in this sandbox - matches the documented
// open question of whether it's actually on in the real Render deployment).

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];

function loadSymbolCandles(dir, symbol) {
  const csvPath = path.join(dir, `${symbol}.csv`);
  if (fs.existsSync(csvPath)) {
    return loadCandlesFromCsv(csvPath).candles;
  }
  const jsonPath = path.join(dir, `${symbol}.json`);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8')).candles;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/replayLastWeekOnRealData.js <dir-with-candle-jsons-or-csvs>');
    process.exit(1);
  }

  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    const candles = loadSymbolCandles(dir, symbol);
    historyBySymbol[symbol] = candles;
    console.log(`${symbol}: ${candles.length} candles, ${new Date(candles[0].time).toISOString()} -> ${new Date(candles[candles.length - 1].time).toISOString()}`);
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigRealOnly = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigRealOnly.BTCUSD; // exclude the temporary smoke-test symbol

  const engine = new LiveStrategyEngine({
    symbols: REAL_SYMBOLS,
    fvgConfig: fvgConfigRealOnly,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
    pyramidConfig: CONFIG.pyramid,
  });

  const openById = new Map();
  const trades = [];
  engine.warmUp(historyBySymbol, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) {
        openById.set(e.id, e);
        return;
      }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      trades.push({
        symbol: e.symbol,
        source: opened.source,
        direction: opened.direction,
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });

  trades.sort((a, b) => a.entryTime - b.entryTime);
  console.log(`\nTotal trades replayés sur toute la fenêtre disponible (${trades.length}) :`);
  for (const t of trades) {
    console.log(`  ${new Date(t.entryTime).toISOString()} ${t.symbol} (${t.source}) ${t.direction} -> ${t.outcome}${t.rMultiple !== null ? ' ' + t.rMultiple.toFixed(2) + 'R' : ''}`);
  }

  function summarize(label, subset) {
    const wins = subset.filter((t) => t.outcome === 'win').length;
    const losses = subset.filter((t) => t.outcome === 'loss').length;
    const timeouts = subset.filter((t) => t.outcome === 'timeout').length;
    const totalR = subset.reduce((s, t) => s + (t.rMultiple || 0), 0);
    console.log(`\n=== ${label} ===`);
    console.log(`Trades: ${subset.length} (${wins}W / ${losses}L / ${timeouts} timeout), totalR=${totalR.toFixed(2)}`);
    const bySource = {};
    for (const t of subset) bySource[t.source] = (bySource[t.source] || 0) + 1;
    console.log('Par source:', JSON.stringify(bySource));
    const bySymbol = {};
    for (const t of subset) bySymbol[t.symbol] = (bySymbol[t.symbol] || 0) + 1;
    console.log('Par symbole:', JSON.stringify(bySymbol));
    const winLossBySource = {};
    for (const t of subset) {
      if (t.outcome !== 'win' && t.outcome !== 'loss') continue;
      winLossBySource[t.source] = winLossBySource[t.source] || { w: 0, l: 0 };
      winLossBySource[t.source][t.outcome === 'win' ? 'w' : 'l']++;
    }
    console.log('Taux de gain par source (W/L, %):', Object.entries(winLossBySource).map(([src, { w, l }]) => `${src}: ${w}/${w + l} (${(100 * w / (w + l)).toFixed(0)}%)`).join(', '));
    for (const t of subset) {
      console.log(`  ${new Date(t.entryTime).toISOString()} ${t.symbol} (${t.source}) ${t.direction} -> ${t.outcome}${t.rMultiple !== null ? ' ' + t.rMultiple.toFixed(2) + 'R' : ''}`);
    }
  }

  // "Semaine dernière" = semaine calendaire précédente (lundi->dimanche),
  // pas une fenêtre glissante de 7 jours - convention française usuelle.
  // Aujourd'hui 2026-09-15 (mardi) -> semaine dernière = 2026-09-07 (lundi) au
  // 2026-09-13 (dimanche) inclus.
  const lastMonday = new Date('2026-09-07T00:00:00Z').getTime();
  const nextMonday = new Date('2026-09-14T00:00:00Z').getTime();
  const lastCalendarWeek = trades.filter((t) => t.entryTime >= lastMonday && t.entryTime < nextMonday);
  summarize('Semaine calendaire dernière (lundi 7 sept -> dimanche 13 sept 2026)', lastCalendarWeek);

  // Repère secondaire : fenêtre glissante des 7 derniers jours jusqu'à
  // maintenant (utile vu que la semaine calendaire en cours n'est pas finie).
  const latestCandleTime = Math.max(...REAL_SYMBOLS.map((s) => historyBySymbol[s][historyBySymbol[s].length - 1].time));
  const rolling7d = trades.filter((t) => t.entryTime >= latestCandleTime - 7 * 86400000);
  summarize('Repère secondaire : 7 derniers jours glissants (jusqu\'à la donnée la plus récente)', rolling7d);

  // Esdras, suite : "regarde LA semaine d'avant alors, regarde sur les 30
  // derniers jours" - semaine calendaire encore précédente (lundi 31 août ->
  // dimanche 6 sept 2026), puis fenêtre glissante des 30 derniers jours.
  const weekBeforeMonday = new Date('2026-08-31T00:00:00Z').getTime();
  const weekBeforeNextMonday = new Date('2026-09-07T00:00:00Z').getTime();
  const weekBefore = trades.filter((t) => t.entryTime >= weekBeforeMonday && t.entryTime < weekBeforeNextMonday);
  summarize('Semaine calendaire d\'avant (lundi 31 août -> dimanche 6 sept 2026)', weekBefore);

  const rolling30d = trades.filter((t) => t.entryTime >= latestCandleTime - 30 * 86400000);
  summarize('30 derniers jours glissants (jusqu\'à la donnée la plus récente)', rolling30d);

  // Esdras, suite : "regarde 3 mois precedent". PLAFOND RÉEL À SIGNALER :
  // GET /api/accounts/:id/candles clampe sa réponse à 5000 bougies max
  // (server.js, `Math.min(Number(req.query.limit) || 300, 5000)`), quel que
  // soit ce qu'on demande - donc la fenêtre la plus ancienne accessible par
  // CETTE route est ~juillet 1er (voir le log des bougies chargées plus haut),
  // pas tout à fait 3 mois calendaires pleins (~2 semaines de moins). Aller
  // chercher plus loin nécessiterait soit la route admin
  // /admin/export-candles (gated ADMIN_EXPORT_TOKEN, pas dispo dans ce
  // sandbox), soit d'attendre que plus d'historique réel s'accumule - pas de
  // redémarrage de la connexion broker en prod juste pour ce chiffre.
  summarize(`Fenêtre réelle complète disponible (~${Math.round((latestCandleTime - Math.min(...REAL_SYMBOLS.map((s) => historyBySymbol[s][0].time))) / 86400000)} jours calendaires, plafonnée par l'API à 5000 bougies M15 - PAS tout à fait 3 mois pleins)`, trades);
}

main();
