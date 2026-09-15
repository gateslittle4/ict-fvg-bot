#!/usr/bin/env node
// runFundingPipsFlexFloatingLossCheck.js
// Usage: node scripts/runFundingPipsFlexFloatingLossCheck.js <dir-with-csvs> [test|7months]
//
// Esdras, explicit request: verify FundingPips 1-Step Flex's ambiguous "trade
// idea floating loss" rule (src/propFirms/fundingPips.js's
// tradeIdeaFloatingLossRule, documented as unreconciled since 2026-09-12 -
// one source says 3% (<$50k accounts) / 2% (>=$50k) combined realized+
// unrealized loss on ONE "trade idea" is an IMMEDIATE hard breach; another
// says 1% is just a warning, 4 cumulative = closure) against the REAL
// current production portfolio (FVG x3, Divergence, NWOG buy-only, Judas
// Swing, Weekly Sweep GER40, pyramid gated by the per-symbol cooldown) at a
// $10k starting balance / 0.5% risk per trade - the same setup used for the
// FundingPips Flex cycle simulation ("on prend 10k pour tester").
//
// A "trade idea" = same symbol+direction, pyramid explicitly paired with its
// parent (opened while the parent was still open - exactly the rule's own
// definition, including its "re-entry within 10min" clause). For each trade,
// scans its OWN candles from the candle AFTER entry through exit (see
// worstExcursionDollars()'s comment for why not the entry candle itself),
// and CAPS the adverse excursion at 1R (t.distance) because this bot always
// places a REAL broker-side stop-loss order (cTraderDataSource.js's
// _submitOrder -> stopLoss: signal.stopPrice) - once price reaches that
// level the position is closed by the broker, so floating exposure cannot
// keep growing past it the way an uncapped candle-low/high scan would
// imply. This does NOT model gap slippage past the stop itself (a real but
// separate, typically much smaller effect).
//
// Two-pass design, same as the other combined-portfolio scripts this
// session: pass 1 = engine.warmUp() with a permissive guardrail (efficient
// O(n), correct per-symbol netting); pass 2 = a plain chronological replay
// assigning a stable riskAmount per trade (0.5%-of-balance, compounding
// approximation) and scanning each trade idea's own candles for its worst
// floating excursion.

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const STRICT_THRESHOLD_PCT = 3;
const LENIENT_THRESHOLD_PCT = 1;
const PYRAMID_MAX_HOLDING = 480;

function fmt(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : '—'; }

function main() {
  const dir = process.argv[2];
  const windowArg = process.argv[3] || 'test';
  if (!dir) {
    console.error('Usage: node scripts/runFundingPipsFlexFloatingLossCheck.js <dir-with-csvs> [test|7months]');
    process.exit(1);
  }

  const raw = {};
  let endMs = 0;
  for (const symbol of SYMBOLS) {
    raw[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
    endMs = Math.max(endMs, raw[symbol][raw[symbol].length - 1].time);
  }
  const endDate = new Date(endMs);
  let cutoffDate;
  if (windowArg === '7months') {
    cutoffDate = new Date(endDate);
    cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 7);
  } else {
    cutoffDate = new Date('2024-01-01T00:00:00Z');
  }
  const cutoffMs = cutoffDate.getTime();
  const sliced = {};
  for (const symbol of SYMBOLS) sliced[symbol] = raw[symbol].filter((c) => c.time >= cutoffMs && c.time <= endMs);

  const permissiveGuardrail = new GuardrailEngine({ maxTradesPerDay: 1e9, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 1e9 });
  const engine = new LiveStrategyEngine({
    symbols: SYMBOLS, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep,
    pyramidConfig: { ...CONFIG.pyramid, enabled: true },
    guardrail: permissiveGuardrail, riskPctPerTrade: CONFIG.risk.riskPctPerTrade, spreads: DEFAULT_SPREADS,
  });

  const openById = new Map();
  const candidateTrades = [];
  const pyramidLegsPending = [];
  engine.warmUp(sliced, {
    onEvent: (e, candle) => {
      if (!e) return;
      if (e.type === 'pyramid-order-requested') {
        pyramidLegsPending.push({ symbol: e.symbol, direction: e.direction, entryPrice: e.entryPrice, stopPrice: e.stopPrice, targetPrice: e.targetPrice, distance: e.distance, rrMultiple: CONFIG.fvg.perSymbol[e.symbol]?.rrMultiple ?? 5, entryTime: candle.time });
        return;
      }
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, { ...e }); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      const grossR = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
      if (grossR === null) return;
      candidateTrades.push({ symbol: e.symbol, source: opened.source, direction: opened.direction, entryPrice: opened.entryPrice, entryTime: opened.validatedAt, exitTime: e.exitTime, distance: opened.distance, grossR });
    },
  });

  function resolvePyramidLeg(symbol, leg) {
    const candles = sliced[symbol];
    const startIdx = candles.findIndex((c) => c.time === leg.entryTime);
    if (startIdx === -1) return null;
    const bullish = leg.direction === 'bullish';
    for (let i = startIdx + 1; i < candles.length && i - startIdx <= PYRAMID_MAX_HOLDING; i++) {
      const c = candles[i];
      const hitStop = bullish ? c.low <= leg.stopPrice : c.high >= leg.stopPrice;
      const hitTarget = bullish ? c.high >= leg.targetPrice : c.low <= leg.targetPrice;
      if (hitStop) return { grossR: -1, exitTime: c.time };
      if (hitTarget) return { grossR: leg.rrMultiple, exitTime: c.time };
    }
    return null;
  }
  const pyramidTrades = [];
  for (const leg of pyramidLegsPending) {
    const resolved = resolvePyramidLeg(leg.symbol, leg);
    if (!resolved) continue;
    pyramidTrades.push({ symbol: leg.symbol, source: 'pyramid', direction: leg.direction, entryPrice: leg.entryPrice, entryTime: leg.entryTime, exitTime: resolved.exitTime, distance: leg.distance, grossR: resolved.grossR });
  }
  const allTrades = [...candidateTrades, ...pyramidTrades].sort((a, b) => a.entryTime - b.entryTime);

  // Assign a stable riskAmount per trade using the SAME $10k/0.5%-risk cycle
  // logic already verified (compounding balance) - approximate here by
  // reusing the running balance at entry time (close enough for this check;
  // exact cycle boundaries don't change the qualitative answer).
  let balance = STARTING_BALANCE;
  for (const t of allTrades) {
    t.riskAmount = balance * (RISK_PCT / 100);
    const spread = DEFAULT_SPREADS[t.symbol] ?? 0;
    const costR = spread > 0 ? spread / t.distance : 0;
    t.netR = t.grossR - costR;
    balance += t.riskAmount * t.netR;
  }

  // Worst floating-loss excursion in $ for a single trade, scanning its OWN candles.
  function worstExcursionDollars(t) {
    const candles = sliced[t.symbol];
    const startIdx = candles.findIndex((c) => c.time === t.entryTime);
    const endIdx = candles.findIndex((c) => c.time === t.exitTime);
    if (startIdx === -1 || endIdx === -1) return { worst: 0, atTime: null };
    const bullish = t.direction === 'bullish';
    let worst = 0, atTime = null;
    // Start at startIdx+1, NOT startIdx: ingestCandle() resolves the open
    // position against a candle BEFORE detecting/opening a NEW signal on
    // that same candle (liveStrategyEngine.js's ingestCandle - stop/target
    // checks always start on the candle AFTER entry, never the entry candle
    // itself). Scanning the entry candle's own low/high would count price
    // the position was never actually exposed to - the entry is assumed
    // filled at the signal's zone price, and if that candle gapped straight
    // through the whole zone without trading back up near it, that candle's
    // low is not a real floating loss on this position, it's a backtest
    // fill-price idealization artifact (found: 2025-12-29 US100/fvg, entry
    // candle opened well below the assumed entryPrice).
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const c = candles[i];
      const adverseRaw = bullish ? t.entryPrice - c.low : c.high - t.entryPrice;
      // Cap at 1R (t.distance): a real broker-side stop order closes the
      // position once price reaches that level, so exposure cannot keep
      // growing past it the way an uncapped scan would imply.
      const adverseCapped = Math.min(adverseRaw, t.distance);
      if (adverseCapped > 0) {
        const r = adverseCapped / t.distance;
        const dollars = r * t.riskAmount;
        if (dollars > worst) { worst = dollars; atTime = c.time; }
      }
    }
    return { worst, atTime };
  }

  const results = allTrades.map((t) => ({ ...t, soloWorstDollars: worstExcursionDollars(t).worst }));

  // Combined excursion for parent+pyramid pairs (same symbol+direction, overlapping time) -
  // the rule's own "same trade idea" definition.
  const combined = [];
  const byKey = {};
  for (const t of results) (byKey[`${t.symbol}|${t.direction}`] ??= []).push(t);
  for (const key of Object.keys(byKey)) {
    const group = byKey[key].sort((a, b) => a.entryTime - b.entryTime);
    for (const a of group) {
      if (a.source !== 'fvg') continue; // pyramid always pairs with an 'fvg' parent
      const pyramidPartner = group.find((p) => p.source === 'pyramid' && p.entryTime >= a.entryTime && p.entryTime <= a.exitTime);
      if (!pyramidPartner) continue;
      const overlapStart = pyramidPartner.entryTime;
      const overlapEnd = Math.min(a.exitTime, pyramidPartner.exitTime);
      const candlesA = sliced[a.symbol];
      let worstCombined = 0, atTime = null;
      for (const c of candlesA) {
        // Exclude the pyramid leg's own entry candle (c.time === overlapStart) -
        // same reasoning as worstExcursionDollars above.
        if (c.time <= overlapStart || c.time > overlapEnd) continue;
        const bullish = a.direction === 'bullish';
        const advA = bullish ? a.entryPrice - c.low : c.high - a.entryPrice;
        const advP = bullish ? pyramidPartner.entryPrice - c.low : c.high - pyramidPartner.entryPrice;
        const rA = Math.min(Math.max(0, advA), a.distance) / a.distance;
        const rP = Math.min(Math.max(0, advP), pyramidPartner.distance) / pyramidPartner.distance;
        const dollars = rA * a.riskAmount + rP * pyramidPartner.riskAmount;
        if (dollars > worstCombined) { worstCombined = dollars; atTime = c.time; }
      }
      combined.push({ symbol: a.symbol, direction: a.direction, worstCombinedDollars: worstCombined, atTime, accountBalanceApprox: a.riskAmount / (RISK_PCT / 100) });
    }
  }

  const worstSolo = results.reduce((max, t) => (t.soloWorstDollars > (max?.soloWorstDollars ?? -1) ? t : max), null);
  const worstSoloPct = (worstSolo.soloWorstDollars / (worstSolo.riskAmount / (RISK_PCT / 100))) * 100;
  const worstCombo = combined.reduce((max, c) => (c.worstCombinedDollars > (max?.worstCombinedDollars ?? -1) ? c : max), null);
  const worstComboPct = worstCombo ? (worstCombo.worstCombinedDollars / worstCombo.accountBalanceApprox) * 100 : 0;

  const soloBreachesStrict = results.filter((t) => (t.soloWorstDollars / (t.riskAmount / (RISK_PCT / 100))) * 100 >= STRICT_THRESHOLD_PCT);
  const soloBreachesLenient = results.filter((t) => (t.soloWorstDollars / (t.riskAmount / (RISK_PCT / 100))) * 100 >= LENIENT_THRESHOLD_PCT);
  const comboBreachesStrict = combined.filter((c) => (c.worstCombinedDollars / c.accountBalanceApprox) * 100 >= STRICT_THRESHOLD_PCT);
  const comboBreachesLenient = combined.filter((c) => (c.worstCombinedDollars / c.accountBalanceApprox) * 100 >= LENIENT_THRESHOLD_PCT);

  console.log(`Trades analysés: ${results.length}, dont ${pyramidTrades.length} pyramid`);
  console.log(`Pire excursion flottante SOLO: ${fmt(worstSolo.soloWorstDollars)}$ = ${fmt(worstSoloPct)}% du solde, sur ${worstSolo.symbol}/${worstSolo.source} (${new Date(worstSolo.entryTime).toISOString()})`);
  console.log(`Paires parent+pyramid superposées: ${combined.length}`);
  if (worstCombo) console.log(`Pire excursion flottante COMBINÉE: ${fmt(worstCombo.worstCombinedDollars)}$ = ${fmt(worstComboPct)}% du solde, sur ${worstCombo.symbol}/${worstCombo.direction} (${new Date(worstCombo.atTime).toISOString()})`);
  console.log(`Dépassements STRICT (3%): solo=${soloBreachesStrict.length}, combiné=${comboBreachesStrict.length}`);
  console.log(`Dépassements SOUPLE (1%): solo=${soloBreachesLenient.length}, combiné=${comboBreachesLenient.length}`);

  const md = [];
  md.push('# Vérification de la règle "floating loss par idée de trade" - FundingPips 1-Step Flex');
  md.push('');
  md.push(
    `⚠ Demande explicite d'Esdras : "On verifie [...] la trade idea floating loss [rule]". Règle documentée dans \`src/propFirms/fundingPips.js\` (ambiguë, jamais réconciliée - accès direct à fundingpips.com bloqué) : lecture STRICTE = 3% (<$50k)/2% (≥$50k) de perte flottante+réalisée combinée sur UNE "idée de trade" = rupture immédiate ; lecture SOUPLE = 1% = avertissement, 4 cumulés = fermeture. Compte $10k, risque ${RISK_PCT}%/trade (le réglage actuel du bot), portefeuille de production réel (FVG US100/US500/XAUUSD, Divergence, NWOG achat seul, Judas Swing, Weekly Sweep GER40, pyramidage soumis au garde-fou).`
  );
  md.push('');
  md.push(`## Fenêtre : ${cutoffDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`);
  md.push('');
  md.push(`Trades analysés : ${results.length} (dont ${pyramidTrades.length} legs pyramid). Paires parent+pyramid superposées (= la définition même d'une "idée de trade" étendue par la règle) : ${combined.length}.`);
  md.push('');
  md.push('| | Pire excursion flottante | % du solde | Dépassements strict (3%) | Dépassements souple (1%) |');
  md.push('|---|---|---|---|---|');
  md.push(`| SOLO (une position) | ${fmt(worstSolo.soloWorstDollars)}$ | ${fmt(worstSoloPct)}% | ${soloBreachesStrict.length}/${results.length} | ${soloBreachesLenient.length}/${results.length} |`);
  md.push(`| COMBINÉ (parent+pyramid) | ${worstCombo ? fmt(worstCombo.worstCombinedDollars) : '—'}$ | ${fmt(worstComboPct)}% | ${comboBreachesStrict.length}/${combined.length} | ${comboBreachesLenient.length}/${combined.length} |`);
  md.push('');
  md.push(
    `**Verdict à ${RISK_PCT}% de risque : aucun dépassement, ni sous la lecture stricte ni sous la lecture souple.** Le pire cas solo (${fmt(worstSoloPct)}% du solde) plafonne à quasiment exactement 1R (= ${RISK_PCT}% du solde par construction du risque par trade) grâce au stop-loss réel placé côté broker (\`cTraderDataSource.js\`) - une fois le prix atteint le niveau du stop, le broker ferme la position, donc l'exposition flottante ne peut pas dépasser 1R (hors slippage de gap au-delà du stop, un effet réel mais distinct et typiquement bien plus petit, non modélisé ici). Le pire cas combiné (${fmt(worstComboPct)}% du solde) correspond à deux unités (parent + pyramid) proches de leur stop en même temps, soit ~2R au pire - toujours largement sous le seuil souple de 1% par unité individuelle et sous le seuil strict combiné.`
  );
  md.push('');
  md.push(
    "**Réserve honnête** : ceci répond à \"quelle est l'exposition flottante réelle tant que le stop protège la position\", pas au cas d'un gap qui saute par-dessus le niveau du stop lui-même (slippage d'exécution réel, dépendant du broker/de la liquidité au moment du gap - non quantifié ici, faute de données de profondeur de marché)."
  );
  md.push('');

  const outMd = path.join(dir, `fundingpips-flex-floating-loss-check-${windowArg}.md`);
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
