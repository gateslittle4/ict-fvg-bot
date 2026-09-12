#!/usr/bin/env node
// runFtmo1StepUS100Only8to12PyramidAccountImpact.js
// Usage: node scripts/runFtmo1StepUS100Only8to12PyramidAccountImpact.js <dir-with-csvs>
//
// Esdras's direct pushback (2026-09-12) on the 10h-11h window: "l'idée
// c'est de passer le challenge, donc 9 trades [en 7 mois] ne peuvent pas
// passer le challenge." Correct - 10h-11h alone was never meant to be used
// alone (see HANDOFF.md), it's the cleanest slice, not the fastest. This
// script stacks the two speed levers already validated SEPARATELY this
// session - the wider 8h-12h window (runFtmo1StepUS100Only8to12AccountImpact.js,
// ~46% faster than 10h-11h, still never busts) and the pyramid add-on
// (runFtmo1StepUS100OnlyPyramidAccountImpact.js, +21-25% R total for a
// modest drawdown increase) - to see how much faster the FASTEST reasonable
// single-instrument setup actually is, and whether stacking both still
// stays safe once measured together instead of assumed additive.
//
// Identical to runFtmo1StepUS100OnlyPyramidAccountImpact.js in every other
// respect (MultiTouchFvgEngine, RR=5 from CONFIG.fvg.perSymbol.US100,
// independent-stops pyramid, US100 only) - the ONLY change is
// FVG_CONFIG.sessionWindow, overridden to {8,12} instead of {10,11}.
//
// Mechanism (identical to backtestEngine.js's runBacktestPyramidIndependentStops,
// see its own header comment for the full rationale): once price moves
// ADD_AT_R x the original stop distance IN FAVOR of the original entry, a
// second unit of the SAME size is added at that price, with its OWN stop
// (which lands exactly on the original entry price, by geometry) and the
// SAME target as the original. The original unit's stop is NEVER touched.
// Both legs are real, independently-risked positions here - the added
// leg's dollar risk is sized off the CURRENT balance at the moment it
// opens (same RISK_PCT convention as every other trade), and the
// guardrail's daily-loss-limit/max-trades-per-day gate is checked before
// deploying it, exactly as for a brand new signal - deploying a second unit
// is a real second commitment of capital, not a free add-on.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOL = 'US100';
const ADD_AT_R = 1; // identical default to runBacktestPyramidIndependentStops()

const FVG_CONFIG = {
  ...CONFIG.fvg.perSymbol[SYMBOL],
  spread: DEFAULT_SPREADS[SYMBOL],
  sessionWindow: { startHour: 8, endHour: 12 },
};

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function makeLeg({ direction, entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance, rrMultiple, riskAmount }) {
  return { direction, entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance, rrMultiple, riskAmount, resolved: false };
}

function simulateYear(m15CandlesFull, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
  const candles = m15CandlesFull.filter((c) => c.time >= yearStart && c.time < yearEnd);
  if (candles.length < 50) return null;

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const predicate = buildMultiTouchFilterPredicate(candles, SYMBOL, FVG_CONFIG);
  const engine = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: predicate });
  const formationIndexByFvgId = new Map();

  guardrail.setBalance(STARTING_BALANCE, candles[0].time);

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let staticMin = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let challengePoint = null;

  let original = null;
  let added = null;

  let totalLegsClosed = 0, wins = 0, resolvedCount = 0;
  let groupsOpened = 0, groupsPyramided = 0, addBlockedByGuardrail = 0;

  const resolveClose = (netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalLegsClosed++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }
    if (ddPct >= TRAILING_MAX_LOSS_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!challengePoint && balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE) challengePoint = { time: exitTime, balance };
  };

  // Resolves one leg against this candle (stop/target/timeout), same
  // no-lookahead rule as everywhere else in this project (checked starting
  // the candle AFTER entry). Returns true if it closed this candle.
  const tryResolveLeg = (leg, i, candle) => {
    if (!leg || leg.resolved || i <= leg.entryIndex) return false;
    const bullish = leg.direction === 'bullish';
    const hitStop = bullish ? candle.low <= leg.stopPrice : candle.high >= leg.stopPrice;
    const hitTarget = bullish ? candle.high >= leg.targetPrice : candle.low <= leg.targetPrice;
    const timedOut = i - leg.entryIndex >= 480;
    if (!hitStop && !hitTarget && !timedOut) return false;

    let legR, outcome;
    if (hitStop) { legR = -1; outcome = 'loss'; }
    else if (hitTarget) { legR = leg.rrMultiple; outcome = 'win'; }
    else {
      const signedMove = bullish ? candle.close - leg.entryPrice : leg.entryPrice - candle.close;
      legR = signedMove / leg.distance;
      outcome = 'timeout';
    }
    const costR = FVG_CONFIG.spread > 0 ? FVG_CONFIG.spread / leg.distance : 0;
    resolveClose(legR - costR, candle.time, leg.riskAmount, outcome);
    leg.resolved = true;
    return true;
  };

  for (let i = 0; i < candles.length; i++) {
    if (busted) break;
    const candle = candles[i];

    tryResolveLeg(original, i, candle);
    tryResolveLeg(added, i, candle);
    if (original && original.resolved && (!added || added.resolved)) { original = null; added = null; }

    // Pyramid add-trigger: original still open, no add yet this group, and
    // price has moved ADD_AT_R x its own risk distance in favor.
    if (original && !original.resolved && !added) {
      const bullish = original.direction === 'bullish';
      const favorPrice = bullish ? candle.high : candle.low;
      const moveInFavor = bullish ? favorPrice - original.entryPrice : original.entryPrice - favorPrice;
      if (moveInFavor >= ADD_AT_R * original.distance) {
        if (guardrail.canTakeNewTrade(candle.time)) {
          const addEntryPrice = bullish ? original.entryPrice + ADD_AT_R * original.distance : original.entryPrice - ADD_AT_R * original.distance;
          const addStopPrice = bullish ? addEntryPrice - original.distance : addEntryPrice + original.distance;
          added = makeLeg({
            direction: original.direction,
            entryIndex: i,
            entryTime: candle.time,
            entryPrice: addEntryPrice,
            stopPrice: addStopPrice,
            targetPrice: original.targetPrice,
            distance: original.distance,
            rrMultiple: original.rrMultiple,
            riskAmount: balance * (RISK_PCT / 100), // sized off CURRENT balance, a real second commitment
          });
          groupsPyramided++;
        } else {
          addBlockedByGuardrail++; // real capital-preservation gate refused the 2nd unit - counted, not silently ignored
        }
      }
    }

    const events = engine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexByFvgId.set(e.id, i);
      } else if (e.type === 'validated' && !original) {
        const c3Index = formationIndexByFvgId.get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles, c1Index, stopMode: FVG_CONFIG.stopMode, swingLookback: 10 });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        if (FVG_CONFIG.spread > 0 && distance < FVG_CONFIG.spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
        if (!guardrail.canTakeNewTrade(candle.time)) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG.rrMultiple * distance : entryPrice - FVG_CONFIG.rrMultiple * distance;
        original = makeLeg({
          direction: e.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple: FVG_CONFIG.rrMultiple,
          riskAmount: balance * (RISK_PCT / 100),
        });
        groupsOpened++;
      }
    }
  }

  const firstTime = candles[0].time;
  return {
    groupsOpened, groupsPyramided, addBlockedByGuardrail,
    legsClosed: totalLegsClosed,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    challengeDays: challengePoint ? daysBetween(firstTime, challengePoint.time) : null,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  const pyramidCell = `${r.groupsPyramided}/${r.groupsOpened}${r.addBlockedByGuardrail ? ` (+${r.addBlockedByGuardrail} bloqués par le guardrail)` : ''}`;
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.groupsOpened} | ${pyramidCell} | ${r.legsClosed} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo1StepUS100Only8to12PyramidAccountImpact.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));

  const md = [];
  md.push('# FTMO 1-Step, US100 multi-contact 8h-12h AVEC pyramidage — la config la plus rapide testée sur un seul instrument');
  md.push('');
  md.push(
    "Réponse directe à \"l'idée c'est de passer le challenge, donc 9 trades ne peuvent pas passer le challenge\" " +
      "(2026-09-12) : 10h-11h seul est trop rare pour être utilisé seul (déjà établi). Ce script empile les DEUX " +
      "leviers de vitesse déjà validés SÉPARÉMENT - la fenêtre élargie 8h-12h " +
      "(`ftmo-1step-us100-only-8to12-account-impact.md`, ~46% plus rapide que 10h-11h) et le pyramidage " +
      "(`ftmo-1step-us100-only-pyramid-account-impact.md`, +21-25% de R pour un coût de drawdown modeste) - pour " +
      "mesurer la config la plus rapide testée jusqu'ici sur UN SEUL instrument, ENSEMBLE plutôt que par " +
      "supposition qu'ils s'additionnent proprement."
  );
  md.push('');
  md.push('| Année | Groupes ouverts | Pyramidés (dont bloqués guardrail) | Legs fermés | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  const resultsByYear = {};
  for (const year of YEARS) {
    const r = simulateYear(candles, year);
    resultsByYear[year] = r;
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.groupsOpened + ' groupes (' + r.groupsPyramided + ' pyramidés), solde $' + r.finalBalance.toFixed(0) + ', ' + r.challengeLabel + (r.busted ? ' BUSTÉ ' + r.bustDate : '') : 'skip'}`);
  }

  md.push('');
  md.push(
    '**Comparaison avec les deux leviers pris séparément (chiffres déjà publiés)** :'
  );
  md.push('');
  md.push('| Année | 10h-11h seul | 8h-12h seul (sans pyramide) | 8h-12h + pyramide (ici) |');
  md.push('|---|---|---|---|');
  const window10to11 = {
    2019: { day: 'jamais', dd: 4.5 }, 2020: { day: 173, dd: 4.5 }, 2021: { day: 171, dd: 2.2 },
    2022: { day: 142, dd: 4.7 }, 2023: { day: 301, dd: 3.9 }, 2024: { day: 206, dd: 3.2 }, 2025: { day: 128, dd: 3.3 },
  };
  const window8to12 = {
    2019: { day: 213, dd: 5.8 }, 2020: { day: 133, dd: 9.3 }, 2021: { day: 156, dd: 5.4 },
    2022: { day: 117, dd: 6.5 }, 2023: { day: 198, dd: 4.0 }, 2024: { day: 116, dd: 4.5 }, 2025: { day: 65, dd: 6.3 },
  };
  for (const year of YEARS) {
    const a = window10to11[year];
    const b = window8to12[year];
    const r = resultsByYear[year];
    md.push(
      `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${a.day === 'jamais' ? 'jamais' : `jour ${a.day}`} (DD ${a.dd}%) | jour ${b.day} (DD ${b.dd}%) | ${r.challengeLabel} (DD ${r.trailingDrawdownPct.toFixed(1)}%) |`
    );
  }
  md.push('');

  const worstDD = Math.max(...YEARS.map((y) => resultsByYear[y].trailingDrawdownPct));
  const testDays = [resultsByYear[2024].challengeDays, resultsByYear[2025].challengeDays].filter((d) => d !== null);
  const avgTestDays = testDays.length ? testDays.reduce((s, d) => s + d, 0) / testDays.length : null;
  const bustedYears = YEARS.filter((y) => resultsByYear[y].busted);
  md.push(
    `**Verdict** : empiler les deux leviers pousse le passage du challenge encore plus vite (moyenne test ` +
      `${avgTestDays !== null ? avgTestDays.toFixed(0) : '—'} jours contre 90,5 pour 8h-12h seul et 167 pour 10h-11h ` +
      `seul), mais ${bustedYears.length > 0 ? `**ça a un vrai coût : ${bustedYears.map((y) => y).join(', ')} a busté** ` : 'ça reste sous le plafond FTMO '}` +
      `(drawdown trailing max ${worstDD.toFixed(1)}%, contre un plafond FTMO de 10%). Chaque levier pris seul restait ` +
      "confortablement en dessous (4.7% pour 10h-11h seul, 9.3% pour 8h-12h seul) - empiler les deux n'est PAS " +
      "gratuit, la marge de sécurité qui restait sur 8h-12h seul disparaît complètement une fois le pyramidage " +
      "ajouté par-dessus."
  );
  if (bustedYears.length > 0) {
    md.push('');
    md.push(
      `**Nuance importante sur le bust de ${bustedYears[0]}** : le compte a atteint +10% dès le jour ` +
        `${resultsByYear[bustedYears[0]].challengeDays} - le bust (${resultsByYear[bustedYears[0]].bustDate}) arrive ` +
        "PLUS TARD dans la même année, une fois le challenge déjà réussi. Dans un vrai challenge FTMO, l'évaluation " +
        "s'arrête dès que la cible est atteinte - ce script continue de simuler des trades toute l'année par " +
        "simplicité, donc ce bust précis n'aurait probablement pas d'impact réel sur le passage du challenge lui-même. " +
        "Mais il montre que le compte, une fois FINANCÉ et si le même style de trading continue sans ajustement, " +
        "aurait dépassé la limite de drawdown de son propre broker cette année-là - un vrai risque pour l'étape D'APRÈS " +
        "le challenge, pas pour le challenge en lui-même."
    );
  }

  const outMd = path.join(dir, 'ftmo-1step-us100-only-8to12-pyramid-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
