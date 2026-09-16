#!/usr/bin/env node
// testAddNwogGer40ToCombo.js
// Usage: node scripts/testAddNwogGer40ToCombo.js [real-data-dir]
//
// Esdras (2026-09-16): "je veux toujours améliorer mes trades ou un autre
// pair pour augmenter les trades sans compromettre la qualité."
//
// Le candidat le plus solide déjà en attente dans HANDOFF.md, jamais testé
// nulle part ailleurs qu'en isolation : NWOG sur GER40 (voir "GER40 - vrai
// spread confirmé... NWOG réhabilité", 2026-09-15). Déjà validé
// INDÉPENDAMMENT à un niveau de rigueur élevé (verdict formel train/test,
// contrôle achat/vente 59/41 - pas un biais haussier caché, ET robuste sur
// 6/8 blocs de 2 ans, aucune année >22% du profit). Weekly Sweep/GER40 est
// LIVE depuis le 2026-09-15 ; NWOG/GER40 a été délibérément laissé de côté à
// ce moment, PAS pour un problème de qualité, mais pour pouvoir attribuer
// clairement un futur problème/succès à l'un ou l'autre des deux
// mécanismes GER40 pendant l'observation initiale.
//
// Ce script teste concrètement l'ajout : reprend le combo de production
// EXACTEMENT tel quel (FVG x3, Divergence, NWOG achat-seul/US100, Judas
// Swing/EURUSD, Weekly Sweep/GER40) et ajoute NWOG bidirectionnel sur GER40
// EN PLUS (src/backtest/nwog.js directement - le nwogConfig actuel de
// production a un SEUL flag longOnly partagé par tous ses symboles, or
// GER40/NWOG doit rester bidirectionnel (59/41 validé) - PAS le même
// réglage que US100/NWOG (achat seul) - donc pas ajouté via nwogConfig.
// symbols tel quel, simulé séparément puis fusionné, exactement comme
// dynamicLiquidityTarget.js l'a fait pour US100/FVG).
//
// Mesure : combien de trades/R supplémentaires ça ajoute (17 ans + fenêtre
// réelle 7 mois déjà committée), et si ça détériore quoi que ce soit
// (chevauchement avec Weekly Sweep sur le même symbole, qualité globale).

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runNwogBacktest } from '../src/backtest/nwog.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const HIST_CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');

function loadHistory(dir) {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }
  return historyBySymbol;
}

// The current production combo, UNCHANGED - GER40 already has Weekly Sweep
// live; nothing here is modified.
function replayProductionCombo(historyBySymbol) {
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
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, e); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      trades.push({
        symbol: e.symbol,
        source: opened.source,
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });
  return trades;
}

// NWOG on GER40 in isolation, BIDIRECTIONAL (no longOnly - matches the
// 59/41 balance already validated in HANDOFF.md, NOT the US100 long-only
// setting).
function replayNwogGer40(candles) {
  const trades = runNwogBacktest(candles, { rrMultiple: CONFIG.nwog.rrMultiple, maxHoldingCandles: CONFIG.nwog.maxHoldingM15Candles });
  return trades.map((t) => ({ symbol: 'GER40', source: 'nwog-ger40', entryTime: t.entryTime, exitTime: t.exitTime, outcome: t.outcome, rMultiple: t.rMultiple }));
}

function summarize(label, trades) {
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  const wins = decided.filter((t) => t.outcome === 'win').length;
  const totalR = decided.reduce((s, t) => s + (t.rMultiple || 0), 0);
  console.log(`${label} : ${trades.length} trades (${decided.length} décidés), taux de gain ${decided.length > 0 ? (100 * wins / decided.length).toFixed(1) : '—'}%, total ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`);
}

function bySource(trades) {
  const map = {};
  for (const t of trades) {
    map[t.source] ??= { count: 0, wins: 0, losses: 0, totalR: 0 };
    map[t.source].count++;
    if (t.outcome === 'win') map[t.source].wins++;
    else if (t.outcome === 'loss') map[t.source].losses++;
    map[t.source].totalR += t.rMultiple || 0;
  }
  return map;
}

// Overlap check: how often does NWOG/GER40 open on the same DAY Weekly
// Sweep/GER40 also has an open position - a rough proxy for whether the two
// mechanisms would compete for the same guardrail budget (maxTradesPerDay)
// or fight each other's netted P&L on the same symbol.
function overlapCheck(comboTrades, nwogGer40Trades) {
  const sweepTrades = comboTrades.filter((t) => t.symbol === 'GER40' && t.source === 'weeklysweep');
  let overlapDays = 0;
  for (const nwogT of nwogGer40Trades) {
    const nwogDay = new Date(nwogT.entryTime).toISOString().slice(0, 10);
    const overlapping = sweepTrades.some((s) => {
      const sDayStart = s.entryTime;
      const sDayEnd = s.exitTime;
      return nwogT.entryTime <= sDayEnd && nwogT.exitTime >= sDayStart;
    });
    if (overlapping) overlapDays++;
  }
  console.log(`Chevauchement temporel NWOG/GER40 vs Weekly Sweep/GER40 : ${overlapDays}/${nwogGer40Trades.length} trades NWOG avaient une position Weekly Sweep ouverte en même temps.`);
}

function main() {
  const realDir = process.argv[2];

  console.log('=== Historique complet (backtest CSV, 2009/2010-2025) ===\n');
  const histHistory = loadHistory(HIST_CSV_DIR);
  const histCombo = replayProductionCombo(histHistory);
  const histNwogGer40 = replayNwogGer40(histHistory.GER40);
  const histComboWithNwog = [...histCombo, ...histNwogGer40].sort((a, b) => a.entryTime - b.entryTime);

  summarize('Combo production (sans NWOG/GER40)', histCombo);
  summarize('Combo + NWOG/GER40                ', histComboWithNwog);
  console.log('\nNWOG/GER40 seul (bidirectionnel, réhabilité) :');
  summarize('  ', histNwogGer40);
  overlapCheck(histCombo, histNwogGer40);

  console.log('\nDétail par mécanisme (combo + NWOG/GER40) :');
  for (const [src, b] of Object.entries(bySource(histComboWithNwog))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }

  if (realDir) {
    console.log('\n\n=== Fenêtre réelle (broker cTrader, 2026-02 -> 2026-09) ===\n');
    const realHistory = loadHistory(realDir);
    const realCombo = replayProductionCombo(realHistory);
    const realNwogGer40 = replayNwogGer40(realHistory.GER40);
    const realComboWithNwog = [...realCombo, ...realNwogGer40].sort((a, b) => a.entryTime - b.entryTime);

    summarize('Combo production (sans NWOG/GER40)', realCombo);
    summarize('Combo + NWOG/GER40                ', realComboWithNwog);
    console.log('\nNWOG/GER40 seul sur cette fenêtre :');
    summarize('  ', realNwogGer40);
    overlapCheck(realCombo, realNwogGer40);
  }
}

main();
