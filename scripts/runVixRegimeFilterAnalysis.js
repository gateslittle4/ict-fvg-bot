#!/usr/bin/env node
// runVixRegimeFilterAnalysis.js
// Usage: node scripts/runVixRegimeFilterAnalysis.js <dir-with-csvs>
//
// Answers a direct question from Esdras: "est-ce que le macro pourrait
// améliorer le combo [déjà validé] ?" — NOT a new instrument-rescue attempt
// (already discussed and dropped), but a filter test on the EXISTING
// validated combo (FVG US100+US500+XAUUSD + Divergence US100/US500,
// netting — reuses LiveStrategyEngine + CONFIG.fvg.perSymbol/CONFIG.divergence
// EXACTLY as production runs them, same pattern as
// recentPerformanceReport.js, just over the FULL history instead of a
// 90-day window).
//
// Macro proxy: VIX daily close (CBOE Volatility Index), sourced from FRED
// (https://fred.stlouisfed.org/series/VIXCLS, fetched 2026-09-12, saved at
// data/backtest-input/macro-vix-daily.csv). Regime threshold DECIDED BEFORE
// LOOKING AT ANY RESULT, per this project's anti-snooping discipline: VIX
// < 20 = "calme", VIX >= 20 = "élevé" — the standard, widely-cited CBOE/
// finance-media convention, not tuned on this project's own data.
//
// No-lookahead rule: a trade's regime is read from the LAST VIX close
// STRICTLY BEFORE its own entry day (yesterday's close, never today's —
// VIX's cash-session close isn't known intraday while our M15 trades are
// entering).
//
// Reports the combo's performance (n / win rate / PF / espérance) split by
// regime, TRAIN (2019-2023) and TEST (2024-2025) SEPARATELY, so a
// train-only artifact doesn't get mistaken for a real, repeatable filter.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const VIX_HIGH_THRESHOLD = 20; // decided before any result - standard CBOE/finance-media convention
const COMBO_SYMBOLS = ['US100', 'US500', 'XAUUSD'];

function loadVixSeries(dir) {
  const raw = fs.readFileSync(path.join(dir, 'macro-vix-daily.csv'), 'utf8');
  const lines = raw.trim().split(/\r?\n/).slice(1);
  const series = [];
  for (const line of lines) {
    const [dateStr, valueStr] = line.split(',');
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue; // skip any non-numeric/missing marker defensively
    series.push({ time: new Date(`${dateStr}T00:00:00Z`).getTime(), value });
  }
  series.sort((a, b) => a.time - b.time);
  return series;
}

// Strictly the LAST VIX close before `entryTime`'s own calendar day (no lookahead).
function makeVixLookup(vixSeries) {
  return (entryTime) => {
    const dayStart = new Date(entryTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    let last = null;
    for (const point of vixSeries) {
      if (point.time >= dayStart.getTime()) break;
      last = point;
    }
    return last ? last.value : null;
  };
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runVixRegimeFilterAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const vixSeries = loadVixSeries(dir);
  const vixAt = makeVixLookup(vixSeries);
  console.error(`VIX series: ${vixSeries.length} daily points, ${new Date(vixSeries[0].time).toISOString().slice(0, 10)} to ${new Date(vixSeries[vixSeries.length - 1].time).toISOString().slice(0, 10)}`);

  const historyBySymbol = {};
  for (const symbol of COMBO_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    historyBySymbol[symbol] = candles;
  }

  const guardrail = new GuardrailEngine({});
  const engine = new LiveStrategyEngine({
    symbols: COMBO_SYMBOLS,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    guardrail,
  });

  const openById = new Map();
  const trades = [];
  engine.warmUp(historyBySymbol, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, e); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      const rMultiple = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
      trades.push({ symbol: e.symbol, source: opened.source, entryTime: opened.validatedAt, exitTime: e.exitTime, outcome: e.outcome, rMultiple });
    },
  });

  console.error(`Combo trades total: ${trades.length}`);

  const withRegime = trades.map((t) => {
    const vix = vixAt(t.entryTime);
    return { ...t, vix, regime: vix === null ? null : vix >= VIX_HIGH_THRESHOLD ? 'eleve' : 'calme' };
  });
  const missingVix = withRegime.filter((t) => t.regime === null).length;
  if (missingVix > 0) console.error(`⚠ ${missingVix} trades have no VIX value available (before VIX series start) - excluded from the regime split.`);

  function summarize(label, list) {
    const asTradeShape = list.map((t) => ({ outcome: t.outcome, rMultiple: t.rMultiple ?? 0 }));
    const s = summarizeTrades(asTradeShape);
    console.error(`  ${label}: n=${s.totalSignals} wr=${fmtPct(s.winRate)} pf=${fmtNum(s.profitFactor)} exp=${fmtNum(s.expectancyR)}`);
    return s;
  }

  const md = [];
  md.push('# Filtre macro (régime VIX) sur le combo déjà validé — améliore-t-il quelque chose ?');
  md.push('');
  md.push(
    "Question posée directement par Esdras après avoir dropé l'idée d'un nouvel instrument macro : " +
      "le combo FVG (US100+US500+XAUUSD) + Divergence (US100/US500), déjà validé et en production, " +
      "se comporte-t-il différemment selon le régime de volatilité macro (VIX) ? Seuil décidé AVANT " +
      "de voir un seul résultat : VIX < 20 = 'calme', VIX ≥ 20 = 'élevé' (convention standard CBOE/" +
      "médias financiers, pas ajustée sur ces données). Régime lu depuis la dernière clôture VIX " +
      "STRICTEMENT AVANT le jour d'entrée du trade (aucun regard en avant)."
  );
  md.push('');
  md.push('| Période | Régime | Trades | WR | PF | Espérance (R) |');
  md.push('|---|---|---|---|---|---|');

  for (const [label, cutoffTest] of [['TRAIN (2019-2023)', false], ['TEST (2024-2025)', true]]) {
    const periodTrades = withRegime.filter((t) => (t.entryTime >= TRAIN_CUTOFF) === cutoffTest);
    for (const regime of ['calme', 'eleve']) {
      const list = periodTrades.filter((t) => t.regime === regime);
      const s = summarize(`${label} / ${regime}`, list);
      md.push(`| ${label} | ${regime === 'calme' ? 'Calme (VIX<20)' : 'Élevé (VIX≥20)'} | ${s.totalSignals} | ${fmtPct(s.winRate)} | ${fmtNum(s.profitFactor)} | ${fmtNum(s.expectancyR)} |`);
    }
    const sAll = summarize(`${label} / TOUS régimes confondus`, periodTrades);
    md.push(`| ${label} | **Tous régimes (référence)** | ${sAll.totalSignals} | ${fmtPct(sAll.winRate)} | ${fmtNum(sAll.profitFactor)} | ${fmtNum(sAll.expectancyR)} |`);
  }

  md.push('');
  md.push(
    "⚠ La lecture agrégée ci-dessus mélange 4 sous-populations différentes (3 FVG + 1 Divergence) qui peuvent " +
      "réagir dans des sens OPPOSÉS au régime VIX — décomposée ci-dessous, par instrument/source, avant de tirer " +
      'une conclusion.'
  );
  md.push('');
  md.push('| Période | Instrument/source | Calme (n / exp R) | Élevé (n / exp R) |');
  md.push('|---|---|---|---|');
  const SOURCE_SYMBOL_PAIRS = [
    ['fvg', 'US100'], ['fvg', 'US500'], ['fvg', 'XAUUSD'], ['divergence', 'US500'],
  ];
  for (const [label, cutoffTest] of [['TRAIN', false], ['TEST', true]]) {
    const periodTrades = withRegime.filter((t) => (t.entryTime >= TRAIN_CUTOFF) === cutoffTest);
    for (const [source, symbol] of SOURCE_SYMBOL_PAIRS) {
      const calme = periodTrades.filter((t) => t.source === source && t.symbol === symbol && t.regime === 'calme');
      const eleve = periodTrades.filter((t) => t.source === source && t.symbol === symbol && t.regime === 'eleve');
      const sC = summarizeTrades(calme.map((t) => ({ outcome: t.outcome, rMultiple: t.rMultiple ?? 0 })));
      const sE = summarizeTrades(eleve.map((t) => ({ outcome: t.outcome, rMultiple: t.rMultiple ?? 0 })));
      md.push(`| ${label} | ${symbol}/${source} | ${sC.totalSignals} / ${fmtNum(sC.expectancyR)} | ${sE.totalSignals} / ${fmtNum(sE.expectancyR)} |`);
    }
  }

  const outMd = path.join(dir, 'vix-regime-filter-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
