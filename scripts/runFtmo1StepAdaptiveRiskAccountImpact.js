#!/usr/bin/env node
// runFtmo1StepAdaptiveRiskAccountImpact.js
// Usage: node scripts/runFtmo1StepAdaptiveRiskAccountImpact.js <dir-with-csvs>
//
// Dynamic/adaptive position sizing, tested on the REAL recommended combo
// (FVG US100+US500+XAUUSD + Divergence US100/US500, netting, FTMO 1-Step
// TRAILING drawdown rule — exactly runFtmo1StepAccountImpact.js, our current
// production reference) rather than the FVG-only US100/US500 subset the
// earlier exploratory script (runAdaptiveRiskAccountImpact.js) tested. That
// earlier script was never documented in HANDOFF.md and never checked
// against the actual combo running live — this closes that gap honestly.
//
// IMPORTANT PREMISE CHECK DONE FIRST (checkOutcomeSerialCorrelationFullCombo.js):
// the streak-based ladder only makes sense if a win actually makes the next
// close more likely to win too. On the FVG-only US100/US500 subset that gap
// was large (56.5% vs 35.4%). On the REAL combo — where Divergence supplies
// ~70% of all trades and is a totally different (mean-reversion) mechanism —
// the gap shrinks to 37.4% vs 32.8% overall and nearly DISAPPEARS out of
// sample (TEST: 33.7% vs 33.5%, n=95/188 — statistically indistinguishable).
// So the premise justifying this ladder is much weaker here than where it
// was first tested. This script checks empirically whether the ladder still
// helps anyway (it could, as plain risk-of-ruin protection, independent of
// the streak premise) or not — reported honestly either way.
//
// Ladder parameters are the EXACT same ones already used/published in
// runAdaptiveRiskAccountImpact.js (base 0.25%, +0.25%/win, cap 1.00%, reset
// to base on a loss, -0.05%/further loss floor 0.10%) — NOT re-tuned here,
// to avoid a fresh round of data-snooping on top of an already-weakened
// premise. Compared against fixed 0.25% and fixed 0.5% (our two usual
// references, 0.5% being the actual current production setting).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480;

function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

function computeDivergenceCandidates(m15A, m15B) {
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, DIV_LOOKBACK);
  const atrA = computeAtrSeries(alignedA, DIV_ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, DIV_ATR_PERIOD);
  const candidates = [];
  let wasExtended = false;
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= DIV_Z_THRESHOLD;
    if (extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= DIV_Z_THRESHOLD;
      const symbol = laggardIsB ? 'US500' : 'US100';
      const atr = laggardIsB ? atrB[i] : atrA[i];
      const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
      if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: 1.5 * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year, { riskPct, adaptiveRiskConfig, drawdownThrottleConfig }) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    m15BySymbol[symbol] = (m15CandlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const divCandidatesByTime = new Map();
  for (const symbol of ['US100', 'US500']) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) {
    if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    if (m15BySymbol[symbol].length === 0) continue;
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
  }
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  if (timeline.length === 0) return null;

  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let staticMin = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let challengePoint = null;

  // Shared adaptive risk ladder, exactly the semantics in portfolioSimulator.js:
  // starts at base; a profitable close raises it by `step` (capped); a losing
  // close resets it to base, or steps it down further (floored) if losses
  // keep coming right after a reset.
  let currentRiskPct = adaptiveRiskConfig ? adaptiveRiskConfig.base : riskPct;
  let consecutiveLosingCloses = 0;
  // Drawdown throttle: a completely different, premise-free mechanism (no
  // reliance on any win/loss serial correlation) - simply reduce size once
  // the account has already given back a meaningful chunk of its trailing
  // drawdown budget, and restore full size once it's meaningfully recovered
  // (hysteresis band so it doesn't flap on every single trade).
  let throttled = false;
  function getRiskPct() {
    if (adaptiveRiskConfig) return currentRiskPct;
    if (drawdownThrottleConfig) {
      const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
      if (!throttled && ddPct >= drawdownThrottleConfig.enterPct) throttled = true;
      else if (throttled && ddPct <= drawdownThrottleConfig.exitPct) throttled = false;
      return throttled ? drawdownThrottleConfig.reducedRisk : drawdownThrottleConfig.fullRisk;
    }
    return riskPct;
  }
  function updateAfterClose(pnl) {
    if (!adaptiveRiskConfig) return;
    const { step, cap, stepDown, floor } = adaptiveRiskConfig;
    if (pnl > 0) {
      consecutiveLosingCloses = 0;
      currentRiskPct = Math.min(currentRiskPct + step, cap);
    } else {
      consecutiveLosingCloses += 1;
      if (consecutiveLosingCloses === 1) currentRiskPct = adaptiveRiskConfig.base;
      else currentRiskPct = Math.max(currentRiskPct - stepDown, floor);
    }
  }

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0, fvgTrades = 0, goldTrades = 0, divTrades = 0;
  const risksUsed = [];

  const resolveClose = (symbol, netR, exitTime, riskAmount, isDivergence, outcome, riskPctUsed) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    risksUsed.push(riskPctUsed);
    if (isDivergence) divTrades++;
    else if (symbol === 'XAUUSD') goldTrades++;
    else fvgTrades++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }
    updateAfterClose(pnl);
    if (ddPct >= TRAILING_MAX_LOSS_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!challengePoint && balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE) challengePoint = { time: exitTime, balance };
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = FVG_CONFIG[symbol].spread ?? 0;

    const openF = openFvg[symbol];
    if (openF && candle.time > openF.entryTime) {
      const bullish = openF.direction === 'bullish';
      const hitStop = bullish ? candle.low <= openF.stopPrice : candle.high >= openF.stopPrice;
      const hitTarget = bullish ? candle.high >= openF.targetPrice : candle.low <= openF.targetPrice;
      const timedOut = i - openF.entryIndex >= 480;
      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = openF.rrMultiple; outcome = 'win'; }
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - openF.entryPrice : openF.entryPrice - exitPrice;
          legR = signedMove / openF.distance;
          outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, false, outcome, openF.riskPctUsed);
        openFvg[symbol] = null;
      }
    }

    if (openDivergence && openDivergence.symbol === symbol && candle.time > openDivergence.entryTime) {
      const hitStop = candle.low <= openDivergence.stopPrice;
      const hitTarget = candle.high >= openDivergence.targetPrice;
      const timedOut = i - openDivergence.entryIndex >= DIV_MAX_HOLDING_M15_CANDLES;
      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = DIV_RR_MULTIPLE; outcome = 'win'; }
        else { legR = (candle.close - openDivergence.entryPrice) / openDivergence.distance; outcome = 'timeout'; }
        const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
        const costR = divSpread > 0 ? divSpread / openDivergence.distance : 0;
        resolveClose(symbol, legR - costR, candle.time, openDivergence.riskAmount, true, outcome, openDivergence.riskPctUsed);
        openDivergence = null;
      }
    }

    const events = engines[symbol].processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexBySymbol[symbol].set(e.id, i);
      } else if (e.type === 'validated' && !openFvg[symbol] && !(openDivergence && openDivergence.symbol === symbol)) {
        const c3Index = formationIndexBySymbol[symbol].get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: m15BySymbol[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
        if (!guardrail.canTakeNewTrade(candle.time)) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
        const riskPctUsed = getRiskPct();
        openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPctUsed / 100), riskPctUsed };
      }
    }

    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
      const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
      const distance = cand.stopDistance;
      if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
        const entryPrice = candle.open;
        const riskPctUsed = getRiskPct();
        openDivergence = { symbol, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance, riskAmount: balance * (riskPctUsed / 100), riskPctUsed };
      }
    }
  }

  const firstTime = timeline[0].candle.time;
  const riskRange = risksUsed.length > 0
    ? `${Math.min(...risksUsed).toFixed(2)}%-${Math.max(...risksUsed).toFixed(2)}% (moy ${(risksUsed.reduce((a, b) => a + b, 0) / risksUsed.length).toFixed(2)}%)`
    : '—';

  return {
    trades: totalTrades, fvgTrades, goldTrades, divTrades,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
    riskRange,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades}+${r.goldTrades}+${r.divTrades}) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} | ${r.riskRange} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFtmo1StepAdaptiveRiskAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
  }
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);

  const md = [];
  md.push('# Position sizing dynamique — échelle de risque évolutive testée sur le VRAI combo (FVG US100+US500+OR + Divergence), règles FTMO 1-Step');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, combo recommandé réel (voir HANDOFF.md), règles FTMO 1-Step (cible +10% unique, ` +
      "perte max TRAILING 10% sur le plus haut solde jamais atteint). Échelle testée : base 0.25%, +0.25% après " +
      "chaque trade gagnant (plafond 1.00%), reset à 0.25% après une perte, puis -0.05% supplémentaire par perte " +
      "additionnelle (plancher 0.10%) — PARAMÈTRES IDENTIQUES à ceux déjà publiés dans " +
      "adaptive-risk-account-impact.md (non retouchés ici). **Vérification préalable du postulat** " +
      "(checkOutcomeSerialCorrelationFullCombo.js) : sur le VRAI combo (Divergence = ~70% des trades), le lien " +
      "gagne-après-gagne est BEAUCOUP plus faible que sur le sous-ensemble FVG seul déjà testé (37.4% vs 32.8% " +
      "global, et quasi NUL en test : 33.7% vs 33.5%, n=95/188). Ce test vérifie si l'échelle aide quand même " +
      "(protection anti-ruine indépendante du postulat) ou non. Un DEUXIÈME mécanisme, sans dépendance à ce " +
      "postulat, est aussi testé : un simple frein sur drawdown (risque plein 0.5% tant que le drawdown trailing " +
      "reste sous 5% du plus haut solde, risque réduit à 0.25% au-delà, retour au plein risque sous 3% - " +
      "convention de gestion de risque courante côté prop firm, le seuil 5% étant la moitié du plafond de perte " +
      "réel 10%)."
  );
  md.push('');

  const scenarios = [
    { label: 'Risque fixe — 0.25%/trade', riskPct: 0.25, adaptiveRiskConfig: null },
    { label: 'Risque fixe — 0.5%/trade (RÉFÉRENCE PRODUCTION ACTUELLE)', riskPct: 0.5, adaptiveRiskConfig: null },
    { label: 'Risque évolutif — base 0.25%, +0.25%/gain (plafond 1.00%), reset puis -0.05%/perte (plancher 0.10%)', riskPct: 0.25, adaptiveRiskConfig: { base: 0.25, step: 0.25, cap: 1.0, stepDown: 0.05, floor: 0.1 } },
    { label: 'Frein sur drawdown — 0.5% plein tant que DD trailing <5%, 0.25% au-delà, retour au plein sous 3%', riskPct: 0.5, drawdownThrottleConfig: { fullRisk: 0.5, reducedRisk: 0.25, enterPct: 5, exitPct: 3 } },
  ];

  for (const scenario of scenarios) {
    md.push(`## ${scenario.label}`);
    md.push('| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |');
    md.push('|---|---|---|---|---|---|---|---|---|');
    for (const year of YEARS) {
      const r = simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year, scenario);
      md.push(fmtRow(year, r));
      console.error(`[${scenario.label}] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) + ', DD trailing ' + r.trailingDrawdownPct.toFixed(1) + '%, ' + r.challengeLabel : 'skip'}`);
    }
    md.push('');
  }

  const outMd = path.join(dir, 'ftmo-1step-adaptive-risk-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
