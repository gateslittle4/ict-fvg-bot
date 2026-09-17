#!/usr/bin/env node
// checkChallengeStart2026OnRealData.js
// Usage: node scripts/checkChallengeStart2026OnRealData.js <dir-with-2026-csvs>
//
// Esdras, suite directe à checkMonthlySeasonalityAndChallengeStart.js (le
// même calcul sur 2019-2025) : "Fais la meme simulation pour lannee 2026".
//
// Même construction/logique EXACTES que checkMonthlySeasonalityAndChallengeStart.js
// (combo réel de production, GuardrailEngine._overallDrawdownFloor() non
// réimplémenté, FTMO 1-Step comme référence, risque challenge 0.5%/trade
// compounding, fenêtre d'observation de 90 jours) mais appliquées à UNE
// SEULE année (2026, la vraie, pas un backtest) au lieu des 7 années de CSV
// historiques. Input : un dossier de CSV `time,open,high,low,close` par
// symbole réel, au format loadCandlesFromCsv() (même format que
// /admin/export-candles produit) - jamais le token lui-même dans ce fichier
// ni commité nulle part, voir HANDOFF.md pour la même discipline déjà
// appliquée à la récupération des 7 mois réels.
//
// 2026 n'a, par construction, PAS 7 années de recul comme le script jumeau -
// une seule occurrence par mois calendaire, et seulement pour les mois où
// des données réelles existent ET où la fenêtre de 90 jours a eu le temps
// de s'écouler (sinon le résultat "cible non atteinte" ne voudrait rien
// dire - juste pas encore assez de temps, pas un échec). Chaque mois est
// donc rapporté avec son statut de couverture, honnêtement, plutôt que de
// forcer un chiffre sur une fenêtre tronquée sans le dire.

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const CHALLENGE_RISK_PCT = 0.5;
const STARTING_BALANCE = 10000;
const WINDOW_DAYS = 90;
const PROGRAM = { label: 'FTMO 1-Step (référence)', targetPct: 10, dailyLossLimitPct: 3, maxDrawdownPct: 10, maxDrawdownType: 'trailing-eod' };

function simulateChallengeFrom(decided, startTime, windowDays) {
  const endTime = startTime + windowDays * 86400000;
  const guardrail = new GuardrailEngine({
    maxTradesPerDay: 999,
    cooldownMinutesAfterLoss: 0,
    dailyLossLimitPct: PROGRAM.dailyLossLimitPct,
    dayBoundaryHourUTC: 0,
    targetPct: PROGRAM.targetPct,
    maxDrawdownPct: PROGRAM.maxDrawdownPct,
    maxDrawdownType: PROGRAM.maxDrawdownType,
  });
  let balance = STARTING_BALANCE;
  guardrail.setBalance(balance, startTime);
  const windowTrades = decided.filter((t) => t.entryTime >= startTime && t.entryTime < endTime);
  for (const t of windowTrades) {
    const riskAmount = balance * (CHALLENGE_RISK_PCT / 100);
    balance += riskAmount * t.rMultiple;
    guardrail.recordTrade({ pnl: riskAmount * t.rMultiple, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
    const status = guardrail.getStatus(t.exitTime);
    if (status.overallDrawdownBreached || status.dailyLossPct >= PROGRAM.dailyLossLimitPct) {
      return { busted: true, bustedAt: t.exitTime, reachedTarget: false, daysToTarget: null, finalBalance: balance, tradeCount: windowTrades.length };
    }
    if (status.targetReached) {
      return { busted: false, bustedAt: null, reachedTarget: true, daysToTarget: Math.round((t.exitTime - startTime) / 86400000), finalBalance: balance, tradeCount: windowTrades.length };
    }
  }
  return { busted: false, bustedAt: null, reachedTarget: false, daysToTarget: null, finalBalance: balance, tradeCount: windowTrades.length };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/checkChallengeStart2026OnRealData.js <dir-with-2026-csvs>');
    process.exit(1);
  }

  const historyBySymbol = {};
  let earliestTime = Infinity;
  let latestTime = -Infinity;
  for (const symbol of REAL_SYMBOLS) {
    const candles = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
    historyBySymbol[symbol] = candles;
    earliestTime = Math.min(earliestTime, candles[0].time);
    latestTime = Math.max(latestTime, candles[candles.length - 1].time);
    console.log(`${symbol}: ${candles.length} bougies, ${new Date(candles[0].time).toISOString()} -> ${new Date(candles[candles.length - 1].time).toISOString()}`);
  }
  console.log(`\nDonnées réelles disponibles : ${new Date(earliestTime).toISOString().slice(0, 10)} -> ${new Date(latestTime).toISOString().slice(0, 10)}\n`);

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
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });
  trades.sort((a, b) => a.entryTime - b.entryTime);
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  console.log(`${decided.length} trades décidés replayés sur 2026.\n`);

  console.log(`=== Départ de challenge le 1er de chaque mois disponible, 2026 (${PROGRAM.label}, fenêtre ${WINDOW_DAYS}j, risque ${CHALLENGE_RISK_PCT}%/trade) ===\n`);
  console.log('Mois | Couverture | Trades dans la fenêtre | Plancher cassé | Cible atteinte | Jours jusqu\'à la cible');
  for (let m = 0; m < 12; m++) {
    const startTime = Date.UTC(2026, m, 1);
    if (startTime < earliestTime) {
      console.log(`${MONTH_NAMES[m]} | pas de données réelles avant le ${new Date(earliestTime).toISOString().slice(0, 10)} - non simulable | — | — | — | —`);
      continue;
    }
    if (startTime > latestTime) {
      console.log(`${MONTH_NAMES[m]} | pas encore arrivé (données réelles s'arrêtent le ${new Date(latestTime).toISOString().slice(0, 10)}) | — | — | — | —`);
      continue;
    }
    const realDaysAvailable = Math.min(WINDOW_DAYS, (latestTime - startTime) / 86400000);
    const truncated = realDaysAvailable < WINDOW_DAYS;
    const result = simulateChallengeFrom(decided, startTime, WINDOW_DAYS);
    const coverage = truncated ? `TRONQUÉE (${realDaysAvailable.toFixed(0)}j/${WINDOW_DAYS}j réels)` : 'complète (90j)';
    console.log(`${MONTH_NAMES[m]} | ${coverage} | ${result.tradeCount} | ${result.busted ? `OUI (${new Date(result.bustedAt).toISOString().slice(0, 10)})` : 'non'} | ${result.reachedTarget ? 'oui' : 'pas encore'} | ${result.daysToTarget !== null ? result.daysToTarget + 'j' : '—'}`);
  }
}

main();
