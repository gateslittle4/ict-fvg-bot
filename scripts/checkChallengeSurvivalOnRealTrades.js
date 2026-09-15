#!/usr/bin/env node
// checkChallengeSurvivalOnRealTrades.js
// Usage: node scripts/checkChallengeSurvivalOnRealTrades.js <dir-with-csvs>
//
// Esdras, straight after seeing the real 4-losing-week streak (17 août ->
// 13 sept) in the ~7-month real-data replay: "que se passerait-il avec le
// challenge? On aurait pas brûlé le compte du 17 août au jour que tu as vu
// encore perdant?" - a concrete question, not hypothetical: would a REAL
// prop-firm challenge (with its real drawdown/daily-loss rules) have busted
// during that exact stretch, using the EXACT SAME real trade sequence
// already verified in this conversation (replayLastWeekOnRealData.js's
// 145 trades over 218 real days, Feb 10 - Sept 15 2026).
//
// Reuses the SAME LiveStrategyEngine warm-up (real production combo) to get
// the identical trade list, then re-simulates account balance/guardrail
// state independently PER prop-firm program, using the REAL GuardrailEngine
// (same overall-drawdown-floor math as production, src/engines/
// guardrailEngine.js's _overallDrawdownFloor() - not reimplemented here) at
// the CHALLENGE risk level (0.5%/trade, CONFIG's own challenge default -
// NOT the 0.3% currently live in 'live' mode, since this question is
// specifically about a challenge). Compounding risk (riskAmount = balance
// at entry time * 0.5%), matching liveStrategyEngine.js's own convention.
//
// Only programs whose maxDrawdownType is actually IMPLEMENTED by
// GuardrailEngine ('static', 'trailing-eod', 'trailing-locks-at-start-
// balance') are simulated - CTI's 'trailing-on-every-close' and
// GoatFundedTrader's 'trailing-realtime-equity-never-resets' fall through
// to `return null` in _overallDrawdownFloor() (fails OPEN, never blocks),
// so running them through this script would silently under-report their
// real risk - flagged as a known gap instead of a false "survived".

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CHALLENGE_RISK_PCT = 0.5; // CONFIG's own DEFAULT_RISK_PCT_BY_MODE.challenge
const STARTING_BALANCE = 10000;

const PROGRAMS = [
  { label: 'FTMO 1-Step (Challenge)', targetPct: 10, dailyLossLimitPct: 3, maxDrawdownPct: 10, maxDrawdownType: 'trailing-eod' },
  { label: 'FTMO 2-Step (Challenge)', targetPct: 10, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static' },
  { label: 'FundingPips Phase 1', targetPct: 8, dailyLossLimitPct: 5, maxDrawdownPct: 10, maxDrawdownType: 'static' },
  { label: 'FundingPips Flex', targetPct: 12, dailyLossLimitPct: 3, maxDrawdownPct: 12, maxDrawdownType: 'static' },
  { label: 'FundingPips Instant', targetPct: null, dailyLossLimitPct: 3, maxDrawdownPct: 5, maxDrawdownType: 'trailing-locks-at-start-balance' },
];

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/checkChallengeSurvivalOnRealTrades.js <dir-with-csvs>');
    process.exit(1);
  }

  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }

  const replayGuardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigRealOnly = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigRealOnly.BTCUSD;
  const engine = new LiveStrategyEngine({
    symbols: REAL_SYMBOLS,
    fvgConfig: fvgConfigRealOnly,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    guardrail: replayGuardrail,
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
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });
  trades.sort((a, b) => a.entryTime - b.entryTime);
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  console.log(`${decided.length} trades décidés (win/loss, timeouts exclus) rejoués, ${new Date(decided[0].entryTime).toISOString().slice(0, 10)} -> ${new Date(decided[decided.length - 1].exitTime).toISOString().slice(0, 10)}`);

  for (const program of PROGRAMS) {
    const guardrail = new GuardrailEngine({
      maxTradesPerDay: 999, // pas la question ici - déjà appliqué dans le rejeu ci-dessus
      cooldownMinutesAfterLoss: 0, // idem, déjà dans la séquence réelle rejouée
      dailyLossLimitPct: program.dailyLossLimitPct ?? 100,
      dayBoundaryHourUTC: 0,
      targetPct: program.targetPct,
      maxDrawdownPct: program.maxDrawdownPct,
      maxDrawdownType: program.maxDrawdownType,
    });
    let balance = STARTING_BALANCE;
    guardrail.setBalance(balance, decided[0].entryTime);

    let bustedAt = null;
    let bustedTrade = null;
    for (const t of decided) {
      if (bustedAt) break; // le compte n'existe plus après un bust réel
      const riskAmount = balance * (CHALLENGE_RISK_PCT / 100); // compounding, comme liveStrategyEngine.js
      const pnl = riskAmount * t.rMultiple;
      balance += pnl;
      guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
      const status = guardrail.getStatus(t.exitTime);
      if (status.overallDrawdownBreached || status.dailyLossPct >= (program.dailyLossLimitPct ?? Infinity)) {
        bustedAt = t.exitTime;
        bustedTrade = t;
      }
    }

    console.log(`\n=== ${program.label} (cible ${program.targetPct ?? '—'}%, perte quotidienne max ${program.dailyLossLimitPct}%, drawdown max ${program.maxDrawdownPct}% ${program.maxDrawdownType}) ===`);
    if (bustedAt) {
      console.log(`BRÛLÉ le ${new Date(bustedAt).toISOString().slice(0, 10)} (trade ${bustedTrade.symbol}, solde tombé à ${balance.toFixed(2)} soit ${(100 * (balance / STARTING_BALANCE - 1)).toFixed(1)}%)`);
    } else {
      console.log(`Jamais brûlé sur toute la fenêtre. Solde final : ${balance.toFixed(2)} (${(100 * (balance / STARTING_BALANCE - 1)).toFixed(1)}%)`);
    }
  }

  // Zoom spécifique sur la question posée : où en était le solde/plancher
  // juste avant le 17 août, et au plus bas de la série perdante (13 sept),
  // pour CHAQUE programme - avec la valeur exacte de risque/solde à ce
  // moment-là, pas juste un R brut.
  console.log('\n=== Zoom 17 août -> 13 septembre, par programme (solde et plancher réels à ce moment-là) ===');
  const zoomStart = new Date('2026-08-17T00:00:00Z').getTime();
  const zoomEnd = new Date('2026-09-14T00:00:00Z').getTime();
  for (const program of PROGRAMS) {
    const guardrail = new GuardrailEngine({
      maxTradesPerDay: 999,
      cooldownMinutesAfterLoss: 0,
      dailyLossLimitPct: program.dailyLossLimitPct ?? 100,
      dayBoundaryHourUTC: 0,
      targetPct: program.targetPct,
      maxDrawdownPct: program.maxDrawdownPct,
      maxDrawdownType: program.maxDrawdownType,
    });
    let balance = STARTING_BALANCE;
    guardrail.setBalance(balance, decided[0].entryTime);
    let balanceAtZoomStart = null;
    let worstBalance = Infinity;
    let worstDate = null;
    let breachedInZoom = false;
    for (const t of decided) {
      const riskAmount = balance * (CHALLENGE_RISK_PCT / 100);
      balance += riskAmount * t.rMultiple;
      guardrail.recordTrade({ pnl: riskAmount * t.rMultiple, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
      if (t.exitTime >= zoomStart && balanceAtZoomStart === null) balanceAtZoomStart = balance;
      if (t.exitTime >= zoomStart && t.exitTime <= zoomEnd) {
        if (balance < worstBalance) { worstBalance = balance; worstDate = t.exitTime; }
        const status = guardrail.getStatus(t.exitTime);
        if (status.overallDrawdownBreached) breachedInZoom = true;
      }
    }
    const floorPct = 100 * (1 - program.maxDrawdownPct / 100);
    console.log(`  ${program.label}: solde au 17 août ≈ ${balanceAtZoomStart?.toFixed(2)} (${(100 * (balanceAtZoomStart / STARTING_BALANCE - 1)).toFixed(1)}%), plus bas atteint pendant la série ≈ ${worstBalance.toFixed(2)} (${(100 * (worstBalance / STARTING_BALANCE - 1)).toFixed(1)}%) le ${worstDate ? new Date(worstDate).toISOString().slice(0, 10) : '—'}, plancher du programme à ${floorPct.toFixed(1)}% du solde initial${breachedInZoom ? ' -> PLANCHER CASSÉ PENDANT CETTE SÉRIE' : ' -> plancher jamais cassé pendant cette série'}`);
  }

  // Esdras : "Est-ce qu'il y a eu dans le passé une série perdante autant ?"
  // Repère chaque épisode de drawdown peak-to-trough (pas juste des semaines
  // consécutives cette fois - la vraie profondeur en % du solde, au risque
  // challenge 0.5%/trade compounding) sur toute la fenêtre de 7 mois, pour
  // comparer objectivement la série récente à tout ce qui a précédé.
  console.log('\n=== Tous les épisodes de drawdown peak-to-trough (risque challenge 0.5%/trade, compounding) ===');
  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let peakTime = decided[0].entryTime;
  const episodes = []; // { peakTime, peakBalance, troughTime, troughBalance, depthPct }
  let current = null;
  for (const t of decided) {
    const riskAmount = balance * (CHALLENGE_RISK_PCT / 100);
    balance += riskAmount * t.rMultiple;
    if (balance >= peak) {
      if (current) episodes.push(current);
      current = null;
      peak = balance;
      peakTime = t.exitTime;
    } else {
      if (!current) current = { peakTime, peakBalance: peak, troughTime: t.exitTime, troughBalance: balance };
      if (balance < current.troughBalance) {
        current.troughTime = t.exitTime;
        current.troughBalance = balance;
      }
    }
  }
  if (current) episodes.push(current);
  for (const e of episodes) e.depthPct = 100 * (1 - e.troughBalance / e.peakBalance);
  episodes.sort((a, b) => b.depthPct - a.depthPct);
  console.log(`${episodes.length} épisodes de drawdown trouvés sur toute la fenêtre. Les 5 plus profonds :`);
  for (const e of episodes.slice(0, 5)) {
    console.log(`  -${e.depthPct.toFixed(1)}% : pic le ${new Date(e.peakTime).toISOString().slice(0, 10)} (${e.peakBalance.toFixed(2)}) -> creux le ${new Date(e.troughTime).toISOString().slice(0, 10)} (${e.troughBalance.toFixed(2)})`);
  }
}

main();
