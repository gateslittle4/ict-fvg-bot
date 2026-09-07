#!/usr/bin/env node
// runMarketRegimeAnalysis.js
// Usage: node scripts/runMarketRegimeAnalysis.js <dir-with-csvs>
//
// Answers a question this project had NOT explicitly answered before now:
// does each validated strategy's edge hold up across bull/bear/range
// markets, or is it concentrated in one regime? None of the earlier
// train/test tables tagged trades by regime - the closest existing proxies
// were the HTF EMA bias filter and the BOS/structure filter, but those
// describe the LOCAL/immediate trend at the moment of entry, not the
// broader daily-timeframe regime, and the year-by-year account-impact
// tables mix all regimes together within each calendar year without ever
// separating them out.
//
// Regime classification (daily bars, a-priori STANDARD convention, not
// tuned on this project's data - same discipline as every strategy param
// in this project):
//   - ADX(14) with Wilder smoothing (classic Wilder 1978 default period).
//   - SMA(100) on daily closes.
//   - ADX >= 25 & close > SMA100 -> 'bull' (classic ADX "trending"
//     threshold, textbook convention - Wilder himself and most references
//     use 25 as the trending cutoff).
//   - ADX >= 25 & close < SMA100 -> 'bear'.
//   - ADX < 25 -> 'range' (direction unclear/no consensus trend, regardless
//     of which side of the SMA price sits on).
//
// No-lookahead tagging: every trade (FVG, Divergence, RSI-2) is tagged with
// the regime of the LAST FULLY-CLOSED daily bar strictly BEFORE its entry
// time - never the still-forming day the entry happens on, even for FVG
// trades that enter intraday on M15 data.
//
// This is DESCRIPTIVE, not a new parameter search: ADX/SMA periods and the
// 25 threshold are fixed textbook values decided before looking at any
// regime-split result, so splitting the existing validated trades by regime
// does not reopen the data-snooping risk this project has consistently
// guarded against. Run on the FULL 2019-2025 sample per (strategy, symbol,
// regime) bucket - deliberately not re-split into train/test here, because
// the goal is descriptive coverage (enough trades per bucket to read
// something), not a fresh out-of-sample validation of a new rule.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, computeEMA, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

// ---- Regime classification params (Wilder/textbook standard, fixed a priori) ----
const ADX_PERIOD = 14;
const SMA_REGIME_PERIOD = 100;
const ADX_TREND_THRESHOLD = 25;
const REGIMES = ['bull', 'bear', 'range'];

// ---- Same validated FVG configs as the final combined account-impact script ----
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};

// ---- Same Divergence params as elsewhere ----
const DIV_SYMBOLS = ['US100', 'US500'];
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_H1_CANDLES = 480 / 4; // H1 candles this loop walks (was M15 candles elsewhere; same time span)

// ---- Same RSI(2) params as elsewhere ----
const RSI_SYMBOLS = ['US100', 'US500'];
const RSI_EMA_TREND_PERIOD = 200;
const RSI_PERIOD = 2;
const RSI_OVERSOLD = 5;
const RSI_OVERBOUGHT = 95;
const RSI_SMA_EXIT_PERIOD = 5;
const RSI_ATR_PERIOD = 14;
const RSI_STOP_ATR_MULTIPLE = 2;
const RSI_MAX_HOLDING_DAYS = 10;

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

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

/** Simple (non-Wilder) rolling RSI - only used for the RSI(2) strategy itself, same as rsi-mean-reversion-analysis.js. */
function computeRsiSeries(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gainSum = 0, lossSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gainSum += change; else lossSum += -change;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) rsi[i] = avgGain === 0 ? 50 : 100;
    else { const rs = avgGain / avgLoss; rsi[i] = 100 - 100 / (1 + rs); }
  }
  return rsi;
}

/** Classic Wilder(1978) ADX: smoothed TR/+DM/-DM (Wilder's own smoothing, alpha=1/period, not a plain SMA/EMA), then DX, then Wilder-smoothed DX = ADX. */
function computeAdxSeries(daily, period) {
  const n = daily.length;
  const tr = new Array(n).fill(0);
  const plusDm = new Array(n).fill(0);
  const minusDm = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const cur = daily[i], prev = daily[i - 1];
    tr[i] = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    plusDm[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDm[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
  }

  const adx = new Array(n).fill(null);
  if (n <= period * 2) return adx;

  // Wilder's smoothing: first value = simple sum over the first `period` bars, then
  // each subsequent value = prev - prev/period + current (the classic Wilder recursive average).
  let smTr = 0, smPlusDm = 0, smMinusDm = 0;
  for (let i = 1; i <= period; i++) { smTr += tr[i]; smPlusDm += plusDm[i]; smMinusDm += minusDm[i]; }

  const dx = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smTr = smTr - smTr / period + tr[i];
      smPlusDm = smPlusDm - smPlusDm / period + plusDm[i];
      smMinusDm = smMinusDm - smMinusDm / period + minusDm[i];
    }
    const plusDi = smTr > 0 ? (100 * smPlusDm) / smTr : 0;
    const minusDi = smTr > 0 ? (100 * smMinusDm) / smTr : 0;
    const diSum = plusDi + minusDi;
    dx[i] = diSum > 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0;
  }

  // ADX = Wilder-smoothed average of DX, first value = simple average of the first `period` DX values.
  let smDx = 0;
  let count = 0;
  for (let i = period; i < Math.min(period * 2, n); i++) { smDx += dx[i]; count++; }
  if (count === 0) return adx;
  smDx = smDx / count;
  adx[period * 2 - 1] = smDx;
  for (let i = period * 2; i < n; i++) {
    smDx = (smDx * (period - 1) + dx[i]) / period;
    adx[i] = smDx;
  }
  return adx;
}

function classifyRegimeSeries(daily) {
  const closes = daily.map((c) => c.close);
  const adx = computeAdxSeries(daily, ADX_PERIOD);
  const sma = computeSma(closes, SMA_REGIME_PERIOD);
  const regime = new Array(daily.length).fill(null);
  for (let i = 0; i < daily.length; i++) {
    if (adx[i] === null || sma[i] === null) continue;
    if (adx[i] >= ADX_TREND_THRESHOLD) regime[i] = closes[i] > sma[i] ? 'bull' : 'bear';
    else regime[i] = 'range';
  }
  return regime;
}

/** Builds a lookup: given an entry timestamp, returns the regime of the last FULLY-CLOSED daily bar strictly before it (no lookahead). */
function makeRegimeLookup(daily, regime) {
  // daily[i].time = start of day i (UTC midnight from resampleCandles); the bar is "closed" at time+DAY_MS.
  return (entryTime) => {
    let lo = 0, hi = daily.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (daily[mid].time + DAY_MS <= entryTime) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? regime[ans] : null;
  };
}

function computeZScoreSeries(logRatio, lookback) {
  const z = new Array(logRatio.length).fill(null);
  for (let i = lookback; i < logRatio.length; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += logRatio[j];
    const mean = sum / lookback;
    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (logRatio[j] - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);
    z[i] = std > 0 ? (logRatio[i] - mean) / std : 0;
  }
  return z;
}

function alignByTime(candlesA, candlesB) {
  const mapB = new Map(candlesB.map((c) => [c.time, c]));
  const alignedA = [];
  const alignedB = [];
  for (const a of candlesA) {
    const b = mapB.get(a.time);
    if (b) { alignedA.push(a); alignedB.push(b); }
  }
  return { alignedA, alignedB };
}

/** @returns {Array} raw (pre-cost) Divergence trades, tagged with symbol - resolved independently (no netting; this is a standalone-edge diagnostic, same convention as the strategy's original validation). */
function runDivergenceBacktest(m15A, m15B) {
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, DIV_LOOKBACK);
  const atrA = computeAtrSeries(alignedA, DIV_ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, DIV_ATR_PERIOD);

  const tradesBySymbol = { US100: [], US500: [] };
  let wasExtended = false;
  let open = null; // one at a time across the pair, same as the live account-impact scripts

  for (let i = 0; i < n; i++) {
    // Resolve an open trade first (long-only mean reversion, same as elsewhere).
    if (open && i > open.entryIndex) {
      const bar = open.symbol === 'US100' ? alignedA[i] : alignedB[i];
      const hitStop = bar.low <= open.stopPrice;
      const hitTarget = bar.high >= open.targetPrice;
      const timedOut = i - open.entryIndex >= DIV_MAX_HOLDING_H1_CANDLES;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice;
        if (hitStop) exitPrice = open.stopPrice;
        else if (hitTarget) exitPrice = open.targetPrice;
        else exitPrice = bar.close;
        const rMultiple = (exitPrice - open.entryPrice) / open.distance;
        const outcome = hitStop ? 'loss' : hitTarget ? 'win' : timedOut ? 'timeout' : (rMultiple > 0 ? 'win' : 'loss');
        tradesBySymbol[open.symbol].push({ ...open, exitIndex: i, exitTime: bar.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    if (z[i] === null) { wasExtended = false; continue; }
    const extended = Math.abs(z[i]) >= DIV_Z_THRESHOLD;
    if (extended && !wasExtended && !open && i + 1 < n) {
      const laggardIsB = z[i] >= DIV_Z_THRESHOLD;
      const symbol = laggardIsB ? 'US500' : 'US100';
      const atr = laggardIsB ? atrB[i] : atrA[i];
      const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
      if (atr && atr > 0) {
        const distance = 1.5 * atr;
        const entryPrice = entryCandle.open;
        open = {
          symbol,
          entryIndex: i + 1,
          entryTime: entryCandle.time,
          entryPrice,
          stopPrice: entryPrice - distance,
          targetPrice: entryPrice + DIV_RR_MULTIPLE * distance,
          distance,
        };
      }
    }
    wasExtended = extended;
  }
  return tradesBySymbol;
}

/** @returns {Array} raw (pre-cost) RSI(2) trades */
function runRsiBacktest(daily) {
  const closes = daily.map((c) => c.close);
  const ema200 = computeEMA(closes, RSI_EMA_TREND_PERIOD);
  const rsi2 = computeRsiSeries(closes, RSI_PERIOD);
  const sma5 = computeSma(closes, RSI_SMA_EXIT_PERIOD);
  const atr14 = computeAtrSeries(daily, RSI_ATR_PERIOD);

  const trades = [];
  let open = null;
  const startIdx = Math.max(RSI_EMA_TREND_PERIOD, RSI_PERIOD, RSI_SMA_EXIT_PERIOD, RSI_ATR_PERIOD) + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitMeanTarget = sma5[i] !== null && (bullish ? day.close >= sma5[i] : day.close <= sma5[i]);
      const timedOut = i - open.entryIndex >= RSI_MAX_HOLDING_DAYS;
      if (hitStop || hitMeanTarget || timedOut) {
        const exitPrice = hitStop ? open.stopPrice : day.close;
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        const outcome = rMultiple > 0 ? 'win' : 'loss'; // same convention as rsi-mean-reversion-analysis.js (no separate timeout bucket there)
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }
    if (!open) {
      const y = i - 1;
      if (ema200[y] === null || rsi2[y] === null || atr14[y] === null) continue;
      const uptrend = closes[y] > ema200[y];
      const downtrend = closes[y] < ema200[y];
      if (uptrend && rsi2[y] < RSI_OVERSOLD) {
        const entryPrice = day.open;
        const distance = RSI_STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance };
      } else if (downtrend && rsi2[y] > RSI_OVERBOUGHT) {
        const entryPrice = day.open;
        const distance = RSI_STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bearish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, distance };
      }
    }
  }
  return trades;
}

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function tagAndBucket(trades, regimeLookup) {
  const buckets = { bull: [], bear: [], range: [], unknown: [] };
  for (const t of trades) {
    const regime = regimeLookup(t.entryTime);
    buckets[regime ?? 'unknown'].push(t);
  }
  return buckets;
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }

function summaryRow(label, trades) {
  const s = summarizeTrades(trades);
  return `| ${label} | ${s.totalSignals} | ${fmtPct(s.winRate)} | ${fmtNum(s.profitFactor)} | ${fmtNum(s.expectancyR)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runMarketRegimeAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Analyse par régime de marché (bull / bear / range) — FVG, Divergence, RSI(2)');
  md.push('');
  md.push(
    "⚠ Question posée : les analyses précédentes tenaient-elles compte de la tendance du marché (bullish/bearish/range) ? " +
      "Réponse honnête : NON, pas explicitement. Les proxys les plus proches existants étaient le filtre de biais EMA " +
      "(H1/H4) et le filtre de structure/BOS, qui décrivent la tendance LOCALE au moment de l'entrée, pas le régime " +
      "quotidien global ; et les tableaux année-par-année, qui mélangent tous les régimes à l'intérieur d'une même " +
      "année sans jamais les séparer. Ceci comble ce manque : classification ADX(14) Wilder + SMA(100) quotidienne " +
      "(seuil ADX=25, convention manuel/textbook standard, décidée AVANT de regarder un seul résultat de ce script - " +
      "même discipline que partout ailleurs dans ce projet). Chaque trade (FVG par instrument, Divergence, RSI-2) est " +
      "étiqueté avec le régime de la DERNIÈRE bougie quotidienne COMPLÈTEMENT CLÔTURÉE avant son entrée (aucun regard " +
      "en avant, même pour les entrées intra-journalières du FVG en M15). Calcul sur l'échantillon COMPLET 2019-2025 " +
      "par (stratégie, instrument, régime) - volontairement pas re-séparé train/test ici : c'est un diagnostic " +
      "descriptif d'une règle déjà validée, pas une nouvelle recherche de paramètre, donc pas de risque de data-snooping " +
      "à regarder l'échantillon complet pour avoir assez de trades par case."
  );
  md.push('');

  // ---- Load and resample everything up front ----
  const m15BySymbol = {};
  const dailyBySymbol = {};
  const regimeBySymbol = {};
  const regimeLookupBySymbol = {};
  const allSymbols = Array.from(new Set([...FVG_SYMBOLS, ...DIV_SYMBOLS, ...RSI_SYMBOLS]));
  for (const symbol of allSymbols) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15BySymbol[symbol] = m15;
    const daily = resampleCandles(m15, DAY_MS);
    dailyBySymbol[symbol] = daily;
    const regime = classifyRegimeSeries(daily);
    regimeBySymbol[symbol] = regime;
    regimeLookupBySymbol[symbol] = makeRegimeLookup(daily, regime);

    const counts = { bull: 0, bear: 0, range: 0, unknown: 0 };
    for (const r of regime) counts[r ?? 'unknown']++;
    console.error(`[${symbol}] regime days: bull=${counts.bull} bear=${counts.bear} range=${counts.range} unclassified=${counts.unknown}`);
  }

  // ---- Overall regime day-count table (how much of history is in each regime, per symbol) ----
  md.push('## Répartition des jours par régime (par instrument)');
  md.push('');
  md.push('| Instrument | Jours bull | Jours bear | Jours range | Jours non classés (historique insuffisant) |');
  md.push('|---|---|---|---|---|');
  for (const symbol of allSymbols) {
    const counts = { bull: 0, bear: 0, range: 0, unknown: 0 };
    for (const r of regimeBySymbol[symbol]) counts[r ?? 'unknown']++;
    md.push(`| ${symbol} | ${counts.bull} | ${counts.bear} | ${counts.range} | ${counts.unknown} |`);
  }
  md.push('');

  // ---- FVG per symbol, own validated config, full history, tagged by regime ----
  md.push('## FVG (config validée par instrument) par régime');
  md.push('');
  for (const symbol of FVG_SYMBOLS) {
    const m15 = m15BySymbol[symbol];
    if (!m15 || m15.length === 0) continue;
    const { engine } = buildFilteredEngine(m15, symbol, FVG_CONFIG[symbol]);
    const trades = runBacktest({ candles: m15, symbol, fvgEngine: engine, stopMode: FVG_CONFIG[symbol].stopMode, rrMultiple: FVG_CONFIG[symbol].rrMultiple });
    const { trades: netTrades } = withNet(trades, FVG_CONFIG[symbol].spread);
    const buckets = tagAndBucket(netTrades, regimeLookupBySymbol[symbol]);

    md.push(`### ${symbol}`);
    md.push('');
    md.push('| Régime | Trades | WR | PF | Espérance (R) |');
    md.push('|---|---|---|---|---|');
    for (const regime of REGIMES) md.push(summaryRow(regime, buckets[regime]));
    if (buckets.unknown.length > 0) md.push(summaryRow('non classé', buckets.unknown));
    md.push('');
    console.error(`[FVG ${symbol}] bull=${buckets.bull.length} bear=${buckets.bear.length} range=${buckets.range.length} unknown=${buckets.unknown.length}`);
  }

  // ---- Divergence (US100/US500 pair), tagged by regime of the traded symbol ----
  md.push('## Divergence (US100/US500) par régime');
  md.push('');
  const divTradesBySymbol = runDivergenceBacktest(m15BySymbol.US100, m15BySymbol.US500);
  for (const symbol of DIV_SYMBOLS) {
    const netTrades = withCosts(divTradesBySymbol[symbol], symbol);
    const buckets = tagAndBucket(netTrades, regimeLookupBySymbol[symbol]);
    md.push(`### ${symbol} (jambe longue de la paire)`);
    md.push('');
    md.push('| Régime | Trades | WR | PF | Espérance (R) |');
    md.push('|---|---|---|---|---|');
    for (const regime of REGIMES) md.push(summaryRow(regime, buckets[regime]));
    if (buckets.unknown.length > 0) md.push(summaryRow('non classé', buckets.unknown));
    md.push('');
    console.error(`[Div ${symbol}] bull=${buckets.bull.length} bear=${buckets.bear.length} range=${buckets.range.length} unknown=${buckets.unknown.length}`);
  }

  // ---- RSI(2) mean reversion, tagged by regime ----
  md.push('## RSI(2) retour à la moyenne (réserve, US100/US500) par régime');
  md.push('');
  for (const symbol of RSI_SYMBOLS) {
    const daily = dailyBySymbol[symbol];
    const rawTrades = runRsiBacktest(daily);
    const netTrades = withCosts(rawTrades, symbol);
    const buckets = tagAndBucket(netTrades, regimeLookupBySymbol[symbol]);
    md.push(`### ${symbol}`);
    md.push('');
    md.push('| Régime | Trades | WR | PF | Espérance (R) |');
    md.push('|---|---|---|---|---|');
    for (const regime of REGIMES) md.push(summaryRow(regime, buckets[regime]));
    if (buckets.unknown.length > 0) md.push(summaryRow('non classé', buckets.unknown));
    md.push('');
    console.error(`[RSI2 ${symbol}] bull=${buckets.bull.length} bear=${buckets.bear.length} range=${buckets.range.length} unknown=${buckets.unknown.length}`);
  }

  const outMd = path.join(dir, 'market-regime-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
