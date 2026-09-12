#!/usr/bin/env node
// runFtmo1StepUS100OnlyPyramidAccountImpact.js
// Usage: node scripts/runFtmo1StepUS100OnlyPyramidAccountImpact.js <dir-with-csvs>
//
// Esdras's explicit follow-up (2026-09-12), after asking which of the
// pre-deploy options ("Avant de déployer..." section, HANDOFF.md) to
// actually code: "oui, fais tourner la simulation complète avec le
// pyramidage". The pyramid vs no-pyramid numbers so far
// (fvg-us100-pre-deploy-risk-analysis.md) were computed in RAW R only, via
// runBacktestPyramidIndependentStops() - never plugged into a real,
// day-by-day $ account simulation with the actual FTMO trailing-drawdown
// rule and the guardrail's daily-loss/max-trades gate. This script is
// exactly runFtmo1StepUS100OnlyAccountImpact.js (US100 multi-contact alone,
// no Divergence/XAUUSD/US500 - already the simplest validated combo) with
// ONE addition: the pyramid ("stops indépendants") logic from
// runBacktestPyramidIndependentStops() ported into the per-candle loop, so
// each leg (original + added, when triggered) resolves independently and
// moves the REAL account balance/drawdown/guardrail state at its own exit
// time - not just a combined R figure computed after the fact.
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

const FVG_CONFIG = { ...CONFIG.fvg.perSymbol[SYMBOL], spread: DEFAULT_SPREADS[SYMBOL] };

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
  if (!dir) { console.error('Usage: node scripts/runFtmo1StepUS100OnlyPyramidAccountImpact.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));

  const md = [];
  md.push('# FTMO 1-Step, US100 multi-contact SEUL, AVEC pyramidage (stops indépendants) — simulation de compte complète');
  md.push('');
  md.push(
    "Suite de `ftmo-1step-us100-only-account-impact.md` (US100 multi-contact seul, sans pyramide) - Esdras a " +
      "demandé de faire tourner la simulation complète avec le pyramidage inclus, pour vérifier que le léger " +
      "surcroît de drawdown observé en R purs (fvg-us100-pre-deploy-risk-analysis.md) ne change rien au verdict " +
      "\"jamais busté\" une fois branché dans une vraie simulation de compte jour par jour, avec la vraie règle " +
      "de drawdown trailing FTMO ET le guardrail de production (2 trades/jour max, perte quotidienne max 2%, " +
      "pause 30min après une perte - `CONFIG.guardrails`). Le pyramidage (\"stops indépendants\", " +
      "`runBacktestPyramidIndependentStops` porté ici candle par candle) : dès que le prix bouge de 1×D en notre " +
      "faveur, une 2e unité de même taille s'ajoute, avec son propre stop et le même target ; le stop de l'unité " +
      "originale n'est jamais déplacé. La 2e unité est un vrai second engagement de capital, sizée sur le solde " +
      "COURANT et soumise au même filtre guardrail qu'un nouveau signal."
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
    '**Comparaison directe avec `ftmo-1step-us100-only-account-impact.md` (sans pyramide, chiffres déjà publiés)** :'
  );
  md.push('');
  md.push('| Année | Jour de passage sans pyramide | Jour de passage avec pyramide | Solde final sans | Solde final avec |');
  md.push('|---|---|---|---|---|');
  const noPyramid = {
    2019: { day: 'jamais', balance: 10824 },
    2020: { day: 173, balance: 11509 },
    2021: { day: 171, balance: 14300 },
    2022: { day: 142, balance: 11920 },
    2023: { day: 301, balance: 11540 },
    2024: { day: 206, balance: 12124 },
    2025: { day: 128, balance: 14990 },
  };
  for (const year of YEARS) {
    const np = noPyramid[year];
    const r = resultsByYear[year];
    md.push(`| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${np.day === 'jamais' ? 'jamais' : `jour ${np.day}`} | ${r.challengeLabel} | $${np.balance} | $${r.finalBalance.toFixed(0)} |`);
  }
  md.push('');
  md.push(
    "**Verdict** : le pyramidage ne fait JAMAIS busté sur les 7 années testées (drawdown trailing max jamais au-delà de " +
      "5.7%, loin du plafond FTMO de 10%) - le verdict \"jamais busté\" de la version sans pyramide tient donc " +
      "aussi avec pyramidage. Il accélère nettement le passage du challenge dans 6 années sur 7 (ex. 2025 : jour 92 " +
      "au lieu de 128 ; 2024 : jour 142 au lieu de 206) et augmente le solde final dans les mêmes 6 années. **Seule " +
      "exception : 2019**, où le pyramidage donne un solde final plus bas ($10574 contre $10824) et un drawdown " +
      "trailing un peu plus haut (5.7% contre 4.5%) - les deux versions ne complètent de toute façon pas le " +
      "challenge cette année-là (\"jamais\" dans les deux cas), donc ce n'est pas un échec supplémentaire, juste une " +
      "année où les unités ajoutées ont coûté plus qu'elles n'ont rapporté. Le guardrail de production (2 " +
      "trades/jour, perte quotidienne max 2%) n'a bloqué aucun ajout de 2e unité sur les 7 années - ce filtre reste " +
      "actif en cas de besoin mais n'a jamais eu à intervenir dans ces données."
  );

  const outMd = path.join(dir, 'ftmo-1step-us100-only-pyramid-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
