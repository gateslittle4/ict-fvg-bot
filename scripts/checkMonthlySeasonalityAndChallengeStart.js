#!/usr/bin/env node
// checkMonthlySeasonalityAndChallengeStart.js
// Usage: node scripts/checkMonthlySeasonalityAndChallengeStart.js
//
// Esdras, suite directe à la vérification "17 août -> 7 septembre" :
// "Et Le mois de janvier a fevrier? Ny a til pas un mois qui produit le
// plus de perte au lieu de gain? En plus j'aimerais savoir si je decide
// de prendre Le challenge, dans quel mois commencer".
//
// Deux questions distinctes, traitées séparément :
//
// A) "Quel mois produit le plus de pertes ?" - regroupe TOUS les trades du
//    combo réel de production sur les 7 années complètes (2019-2025, même
//    rejeu que checkAugustSeasonalityAcrossYears.js/replayLastWeekOnRealData.js)
//    par MOIS CALENDAIRE (toutes années confondues), classé du pire au
//    meilleur.
//
// B) "Dans quel mois commencer un challenge ?" - PAS la même question que
//    A (un mois globalement faible n'implique pas forcément un mauvais
//    MOMENT DE DÉPART, si les pertes de ce mois-là tombent après un début
//    déjà réussi). Simule un vrai départ de challenge (FTMO 1-Step, seul
//    programme choisi comme référence - risque 0.5%/trade compounding,
//    même GuardrailEngine/_overallDrawdownFloor() que la production, pas
//    réimplémenté) au 1er de CHAQUE mois calendaire, pour CHAQUE occurrence
//    de ce mois entre 2019 et 2025 (jusqu'à 7 départs par mois), fenêtre de
//    90 jours calendaires après le départ (durée raisonnable pour une
//    évaluation de challenge, choisie avant de regarder un seul résultat -
//    aucun de ces programmes n'a de limite de temps stricte, donc ce n'est
//    pas un vrai plafond réglementaire, juste une fenêtre d'observation).
//    Rapporte, par mois de départ : combien de fois le plancher aurait
//    cassé (sur 7 essais), et le temps moyen pour atteindre la cible de
//    profit quand ça a marché.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const CHALLENGE_RISK_PCT = 0.5;
const STARTING_BALANCE = 10000;
const WINDOW_DAYS = 90;
const PROGRAM = { label: 'FTMO 1-Step (référence)', targetPct: 10, dailyLossLimitPct: 3, maxDrawdownPct: 10, maxDrawdownType: 'trailing-eod' };

function replayAll() {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(CSV_DIR, `${symbol}.csv`)).candles;
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
  trades.sort((a, b) => a.entryTime - b.entryTime);
  return trades;
}

function partA_monthlyBreakdown(trades) {
  console.log('\n=== A) Performance par MOIS CALENDAIRE, toutes années confondues (2019-2025) ===\n');
  const byMonth = Array.from({ length: 12 }, () => ({ count: 0, wins: 0, losses: 0, totalR: 0 }));
  for (const t of trades) {
    const m = new Date(t.entryTime).getUTCMonth();
    byMonth[m].count++;
    if (t.outcome === 'win') byMonth[m].wins++;
    else if (t.outcome === 'loss') byMonth[m].losses++;
    byMonth[m].totalR += t.rMultiple || 0;
  }
  const rows = byMonth.map((b, i) => ({ month: MONTH_NAMES[i], ...b, winRatePct: b.wins + b.losses > 0 ? (100 * b.wins / (b.wins + b.losses)) : null }));
  const ranked = [...rows].sort((a, b) => a.totalR - b.totalR);
  console.log('Mois | Trades | W/L | Taux | Total R (7 ans cumulés)');
  for (const r of ranked) {
    console.log(`${r.month} | ${r.count} | ${r.wins}/${r.losses} | ${r.winRatePct !== null ? r.winRatePct.toFixed(0) + '%' : '—'} | ${r.totalR >= 0 ? '+' : ''}${r.totalR.toFixed(2)}R`);
  }
  console.log(`\nPire mois (toutes années cumulées) : ${ranked[0].month} (${ranked[0].totalR >= 0 ? '+' : ''}${ranked[0].totalR.toFixed(2)}R)`);
  console.log(`Meilleur mois : ${ranked[ranked.length - 1].month} (+${ranked[ranked.length - 1].totalR.toFixed(2)}R)`);
}

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
      return { busted: true, bustedAt: t.exitTime, reachedTarget: false, daysToTarget: null };
    }
    if (status.targetReached) {
      return { busted: false, bustedAt: null, reachedTarget: true, daysToTarget: Math.round((t.exitTime - startTime) / 86400000) };
    }
  }
  return { busted: false, bustedAt: null, reachedTarget: false, daysToTarget: null }; // ni brûlé ni cible atteinte dans la fenêtre
}

function partB_bestStartMonth(trades) {
  console.log(`\n=== B) Meilleur mois pour DÉMARRER un challenge (${PROGRAM.label}, fenêtre de ${WINDOW_DAYS} jours, risque ${CHALLENGE_RISK_PCT}%/trade) ===\n`);
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');

  const byStartMonth = Array.from({ length: 12 }, () => ({ attempts: 0, busts: 0, reached: 0, daysToTargetSum: 0 }));
  for (let m = 0; m < 12; m++) {
    for (const year of YEARS) {
      const startTime = Date.UTC(year, m, 1);
      if (startTime < decided[0].entryTime || startTime > decided[decided.length - 1].exitTime) continue; // hors de la fenêtre de données disponible
      const result = simulateChallengeFrom(decided, startTime, WINDOW_DAYS);
      byStartMonth[m].attempts++;
      if (result.busted) byStartMonth[m].busts++;
      if (result.reachedTarget) {
        byStartMonth[m].reached++;
        byStartMonth[m].daysToTargetSum += result.daysToTarget;
      }
    }
  }

  const rows = byStartMonth.map((b, i) => ({
    month: MONTH_NAMES[i],
    attempts: b.attempts,
    busts: b.busts,
    reached: b.reached,
    avgDaysToTarget: b.reached > 0 ? b.daysToTargetSum / b.reached : null,
  }));

  console.log('Mois de départ | Essais (années dispo) | Plancher cassé | Cible atteinte | Jours moyens jusqu\'à la cible');
  for (const r of rows) {
    console.log(`${r.month} | ${r.attempts} | ${r.busts}/${r.attempts} | ${r.reached}/${r.attempts} | ${r.avgDaysToTarget !== null ? r.avgDaysToTarget.toFixed(0) + 'j' : '—'}`);
  }

  const ranked = [...rows]
    .filter((r) => r.attempts >= 3) // pas assez d'échantillon sinon pour classer sérieusement
    .sort((a, b) => {
      const bustRateA = a.busts / a.attempts, bustRateB = b.busts / b.attempts;
      if (bustRateA !== bustRateB) return bustRateA - bustRateB; // moins de casse d'abord
      const speedA = a.avgDaysToTarget ?? Infinity, speedB = b.avgDaysToTarget ?? Infinity;
      return speedA - speedB; // puis le plus rapide à la cible
    });
  console.log(`\nClassement (moins de plancher cassé, puis cible atteinte le plus vite) : ${ranked.map((r) => r.month).join(' > ')}`);
}

function main() {
  const trades = replayAll();
  console.log(`Total trades replayés sur les 7 années (2019-2025) : ${trades.length}`);
  partA_monthlyBreakdown(trades);
  partB_bestStartMonth(trades);
}

main();
