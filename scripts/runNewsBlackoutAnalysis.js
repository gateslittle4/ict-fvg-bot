#!/usr/bin/env node
// runNewsBlackoutAnalysis.js
// Usage: node scripts/runNewsBlackoutAnalysis.js <dir-with-csvs> [test|7months]
//
// Esdras, explicit request: "si on nous demande de ne pas trader les news ou
// 10 min avant et 10 min apres Red News, quel serait l'impact sur notre
// compte?" - measures the impact of a "no trade within ±10 minutes of a
// red-news event" rule on the COMBINED 5-mechanism live portfolio (FVG
// US100/US500/XAUUSD, Divergence, NWOG buy-only, Judas Swing, Weekly Sweep
// GER40, pyramid add-on) - built on top of the per-symbol cooldown and
// gated-pyramid fixes already shipped this session.
//
// Real, publicly-sourced event dates (src/backtest/newsEvents.js) - see
// that file's own header for exactly which sources and what's deliberately
// left out (Ifo/ZEW/ISM PMI, weekly jobless claims). Applied account-wide
// (a prop-firm no-news rule is typically account-wide, not per-instrument).
//
// Two-pass design, same as the other combined-portfolio scripts this
// session: pass 1 = engine.warmUp() with a permissive guardrail (efficient
// O(n), correct per-symbol netting + Divergence's cross-symbol dependency);
// pass 2 = real GuardrailEngine + news-blackout filter applied
// chronologically over the resulting candidate trades.

import fs from 'node:fs';
import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { allEventTimesAsCandleTime } from '../src/backtest/newsEvents.js';

const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const STARTING_BALANCE = 10000;
const BLACKOUT_MS = 10 * 60 * 1000;
const M15_MS = 15 * 60 * 1000;
const PYRAMID_MAX_HOLDING = 480;

function fmt(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : '—'; }

function resolvePyramidLeg(candlesBySymbol, symbol, leg) {
  const candles = candlesBySymbol[symbol];
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

function main() {
  const dir = process.argv[2];
  const windowArg = process.argv[3] || 'test';
  if (!dir) {
    console.error('Usage: node scripts/runNewsBlackoutAnalysis.js <dir-with-csvs> [test|7months]');
    process.exit(1);
  }

  const EVENT_TIMES = allEventTimesAsCandleTime();
  function inBlackout(entryTime) {
    for (const ev of EVENT_TIMES) {
      if (entryTime < ev + BLACKOUT_MS && entryTime + M15_MS > ev - BLACKOUT_MS) return true;
    }
    return false;
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
        pyramidLegsPending.push({ symbol: e.symbol, direction: e.direction, stopPrice: e.stopPrice, targetPrice: e.targetPrice, distance: e.distance, rrMultiple: CONFIG.fvg.perSymbol[e.symbol]?.rrMultiple ?? 5, entryTime: candle.time });
        return;
      }
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, { ...e }); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      const grossR = e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null;
      if (grossR === null) return;
      candidateTrades.push({ symbol: e.symbol, source: opened.source, direction: opened.direction, entryTime: opened.validatedAt, exitTime: e.exitTime, distance: opened.distance, grossR });
    },
  });

  const pyramidTrades = [];
  for (const leg of pyramidLegsPending) {
    const resolved = resolvePyramidLeg(sliced, leg.symbol, leg);
    if (!resolved) continue;
    pyramidTrades.push({ symbol: leg.symbol, source: 'pyramid', direction: leg.direction, entryTime: leg.entryTime, exitTime: resolved.exitTime, distance: leg.distance, grossR: resolved.grossR });
  }

  const allCandidates = [...candidateTrades, ...pyramidTrades].sort((a, b) => a.entryTime - b.entryTime);

  function simulate(useNewsFilter) {
    const guardrail = new GuardrailEngine(CONFIG.guardrails);
    guardrail.setBalance(STARTING_BALANCE, allCandidates[0].entryTime);
    let balance = STARTING_BALANCE;
    const trades = [];
    let newsBlocked = 0;
    for (const ct of allCandidates) {
      if (useNewsFilter && inBlackout(ct.entryTime)) { newsBlocked++; continue; }
      const status = guardrail.getStatus(ct.entryTime, ct.symbol);
      if (status.blocked) continue;
      const spread = DEFAULT_SPREADS[ct.symbol] ?? 0;
      const costR = spread > 0 ? spread / ct.distance : 0;
      const netR = ct.grossR - costR;
      const riskAmount = balance * (CONFIG.risk.riskPctPerTrade / 100);
      const pnl = riskAmount * netR;
      balance += pnl;
      guardrail.recordTrade({ pnl, time: ct.exitTime, balanceAfter: balance, symbol: ct.symbol });
      trades.push({ ...ct, netR, pnl, balanceAfter: balance });
    }
    let peak = STARTING_BALANCE, maxDD = 0;
    for (const t of trades) { peak = Math.max(peak, t.balanceAfter); maxDD = Math.max(maxDD, ((peak - t.balanceAfter) / peak) * 100); }
    return { trades, balance, maxDD, newsBlocked };
  }

  const without = simulate(false);
  const withNews = simulate(true);
  const excludedTrades = allCandidates.filter((ct) => inBlackout(ct.entryTime));
  const bySource = {};
  for (const t of excludedTrades) (bySource[t.source] ??= []).push(t);

  const md = [];
  md.push('# Impact d\'un blackout "±10 min autour des red news" sur le portefeuille combiné (5 mécanismes)');
  md.push('');
  md.push(
    `⚠ Demande explicite d'Esdras ("si on nous demande de ne pas trader les news ou 10 min avant et 10 min apres Red News, quel serait l'impact...") puis ("les props firms ont l'habitude de dire Red News, donc je pense que c'est TOUS les red news"). ${EVENT_TIMES.length} événements réels, sources publiques officielles (BLS, Fed, BEA, Census, BCE) - voir \`src/backtest/newsEvents.js\` pour le détail exact des sources et des exclusions volontaires (Ifo/ZEW allemands, PMI ISM, demandes de chômage hebdomadaires - considérés "orange" plutôt que "red" sur la plupart des calendriers, pas chassés davantage). Appliqué sur tout le compte (une règle prop firm "pas de news" est typiquement compte-global, pas par instrument), construit par-dessus les correctifs déjà livrés cette session (cooldown par symbole, pyramidage soumis au garde-fou).`
  );
  md.push('');
  md.push(`## Fenêtre : ${cutoffDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`);
  md.push('');
  md.push('| | Sans exclusion news | Avec exclusion ±10min |');
  md.push('|---|---|---|');
  md.push(`| Trades | ${without.trades.length} | ${withNews.trades.length} (${withNews.newsBlocked} exclus) |`);
  md.push(`| Solde final | ${fmt(without.balance)} (${fmt((without.balance / STARTING_BALANCE - 1) * 100)}%) | ${fmt(withNews.balance)} (${fmt((withNews.balance / STARTING_BALANCE - 1) * 100)}%) |`);
  md.push(`| Drawdown max | ${fmt(without.maxDD)}% | ${fmt(withNews.maxDD)}% |`);
  md.push('');
  md.push(`Répartition des ${excludedTrades.length} candidats exclus par les news :`);
  md.push('');
  md.push('| Source | Trades exclus |');
  md.push('|---|---|');
  for (const s of Object.keys(bySource).sort()) md.push(`| ${s} | ${bySource[s].length} |`);
  md.push('');

  const outMd = path.join(dir, `news-blackout-analysis-${windowArg}.md`);
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.log(`Sans exclusion: n=${without.trades.length} solde=${fmt(without.balance)} DDmax=${fmt(without.maxDD)}%`);
  console.log(`Avec exclusion (${EVENT_TIMES.length} events): n=${withNews.trades.length} (${withNews.newsBlocked} exclus) solde=${fmt(withNews.balance)} DDmax=${fmt(withNews.maxDD)}%`);
}

main();
