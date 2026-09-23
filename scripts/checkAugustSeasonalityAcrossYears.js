#!/usr/bin/env node
// checkAugustSeasonalityAcrossYears.js
// Usage: node scripts/checkAugustSeasonalityAcrossYears.js
//
// Esdras, suite directe à la série perdante du 17 août -> 7 septembre 2026
// (voir HANDOFF.md "Explication de la série perdante") : "Est ce que ca
// sait produit deja das les donnees des annees passes? Si ca sest produit
// peut etre on pourait eviter ce mois non?"
//
// Rejoue le VRAI combo de production (FVG + Divergence + NWOG + Judas
// Swing + Weekly Sweep, config directement depuis CONFIG, même construction
// que scripts/replayLastWeekOnRealData.js/checkChallengeSurvivalOnRealTrades.js
// - pas une réimplémentation séparée) sur les 7 ANNÉES COMPLÈTES des CSV
// historiques déjà validés (2019-2025, data/backtest-input/), puis isole,
// dans CHAQUE année, la MÊME fenêtre calendaire que la série 2026 (17 août
// -> 7 septembre) pour voir si un passage à vide comparable s'est déjà
// produit à cette période précise, les années précédentes.
//
// BTCUSD exclu (même raison que les scripts jumeaux : smoke-test temporaire,
// pas un mécanisme validé). Pyramide/risque/spreads : mêmes réglages de
// production que les autres rejeux réels de cette même session.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { fileURLToPath } from 'node:url';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CSV_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'backtest-input');
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Fenêtre exacte de la série perdante 2026 (voir HANDOFF.md), même mois/jour
// appliqué à chaque année passée - pas une fenêtre glissante, un vrai
// repère calendaire identique d'une année à l'autre.
const WINDOW = { startMonth: 8, startDay: 17, endMonth: 9, endDay: 7 }; // 17 août -> 7 septembre inclus

function mondayOf(ms) {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday);
}

function windowRange(year) {
  const start = Date.UTC(year, WINDOW.startMonth - 1, WINDOW.startDay);
  const end = Date.UTC(year, WINDOW.endMonth - 1, WINDOW.endDay + 1); // exclusive
  return { start, end };
}

function main() {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    const csvPath = path.join(CSV_DIR, `${symbol}.csv`);
    const candles = loadCandlesFromCsv(csvPath).candles;
    historyBySymbol[symbol] = candles;
    console.log(`${symbol}: ${candles.length} bougies, ${new Date(candles[0].time).toISOString()} -> ${new Date(candles[candles.length - 1].time).toISOString()}`);
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigRealOnly = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigRealOnly.BTCUSD;

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
  console.log(`\nTotal trades replayés sur les 7 années (2019-2025) : ${trades.length}\n`);

  console.log(`=== Fenêtre du 17 août au 7 septembre, année par année (même repère calendaire que la série 2026) ===\n`);
  const rows = [];
  for (const year of YEARS) {
    const { start, end } = windowRange(year);
    const windowTrades = trades.filter((t) => t.entryTime >= start && t.entryTime < end);
    const wins = windowTrades.filter((t) => t.outcome === 'win').length;
    const losses = windowTrades.filter((t) => t.outcome === 'loss').length;
    const totalR = windowTrades.reduce((s, t) => s + (t.rMultiple || 0), 0);

    const byWeek = new Map();
    for (const t of windowTrades) {
      const wk = mondayOf(t.entryTime);
      byWeek.set(wk, (byWeek.get(wk) || 0) + (t.rMultiple || 0));
    }
    const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
    let losingWeeks = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    for (const [, wkR] of weeks) {
      const isLosing = wkR < 0;
      if (isLosing) losingWeeks++;
      currentStreak = isLosing ? currentStreak + 1 : 0;
      longestStreak = Math.max(longestStreak, currentStreak);
    }

    rows.push({ year, count: windowTrades.length, wins, losses, totalR, weeksWithTrades: weeks.length, losingWeeks, longestStreak });

    console.log(`--- ${year} (${new Date(start).toISOString().slice(0, 10)} -> ${new Date(end - 86400000).toISOString().slice(0, 10)}) ---`);
    if (windowTrades.length === 0) {
      console.log('  Aucun trade sur cette fenêtre.\n');
      continue;
    }
    console.log(`  ${windowTrades.length} trades (${wins}W/${losses}L), totalR=${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`);
    for (const [wk, wkR] of weeks) {
      console.log(`    semaine du ${new Date(wk).toISOString().slice(0, 10)} : ${wkR >= 0 ? '+' : ''}${wkR.toFixed(2)}R${wkR < 0 ? '  <- perdante' : ''}`);
    }
    console.log(`  Semaines perdantes : ${losingWeeks}/${weeks.length}, plus longue série consécutive : ${longestStreak}\n`);
  }

  console.log(`=== Résumé (fenêtre 17 août -> 7 sept, chaque année) ===`);
  console.log('Année | Trades | W/L | TotalR | Semaines perdantes | Plus longue série');
  for (const r of rows) {
    console.log(`${r.year} | ${r.count} | ${r.wins}/${r.losses} | ${r.totalR >= 0 ? '+' : ''}${r.totalR.toFixed(2)}R | ${r.losingWeeks}/${r.weeksWithTrades} | ${r.longestStreak}`);
  }

  const comparable = rows.filter((r) => r.year !== 2026 && (r.longestStreak >= 3 || r.totalR <= -3));
  console.log(`\n2026 (référence, déjà connu) : 4 semaines perdantes consécutives, totalR négatif sur cette fenêtre.`);
  console.log(`Années passées (2019-2025) avec un épisode comparable (>= 3 semaines perdantes d'affilée, ou totalR <= -3R, sur CETTE MÊME fenêtre calendaire) : ${comparable.length > 0 ? comparable.map((r) => r.year).join(', ') : 'AUCUNE'}.`);
}

main();
