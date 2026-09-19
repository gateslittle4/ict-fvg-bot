// replaySignals.js
// The strategy trades the "Simulateur" page draws over the replayed market (2026-09-19, Esdras: see
// HOW the strategies appear and play out). Two families:
//  - the bot's 8 live mechanisms (FVG, Divergence, NWOG, Judas Swing, Weekly Sweep, Breaker Block,
//    Silver Bullet, CBDR), each with the symbols and R:R that CONFIG says it really trades - so the
//    "bot" option shows what the bot would have done, and nothing on a symbol it does not trade;
//  - any of the Labo's 21 strategies, with the Labo's default settings.
// Every trade comes back in one shape (engine time; the page adds the 5 h to real time):
//   {strategyId, direction, entryTime, entryPrice, stopPrice, targetPrice|null, exitTime, exitPrice, outcome, rMultiple}
// The runs are the ones the backtests use (same code, no lookahead in the entries); the page only ever
// SHOWS a trade from its entry time on, and its result from its exit time on.

import { CONFIG } from '../config.js';
import { LAB_STRATEGIES } from './labRegistry.js';
import { runLiveFvgRawTrades, liveFvgSymbols } from './liveFvgRunner.js';
import { runNwogBacktest } from './nwog.js';
import { runJudasSwingBacktest } from './judasSwing.js';
import { runWeeklySweepBacktest } from './weeklyLiquiditySweep.js';
import { runBreakerBlockBacktest } from './breakerBlock.js';
import { runSilverBulletBacktest } from './silverBullet.js';
import { runCbdrBacktest } from './cbdr.js';
import { runDivergenceMomentumBacktestForSymbol } from './divergenceMomentum.js';
import { resampleCandles, TIMEFRAME_MS } from './htfBias.js';
import { computeZScoreSeries, alignByTime } from './correlation.js';
import { computeAtrSeries } from './rsiDivergence.js';

const toReplay = (strategyId) => (t) => ({
  strategyId,
  direction: t.direction,
  entryTime: t.entryTime,
  entryPrice: t.entryPrice,
  stopPrice: t.stopPrice,
  targetPrice: Number.isFinite(t.targetPrice) ? t.targetPrice : null,
  exitTime: t.exitTime,
  exitPrice: t.exitPrice,
  outcome: t.outcome,
  rMultiple: t.rMultiple,
});

/**
 * Same computation as LiveStrategyEngine._computeDivergenceCandidates() (pinned by a parity test
 * against the real class, so it cannot drift): a candidate at the bar AFTER the z-score of the
 * log price ratio first crosses the threshold; the LAGGARD is traded, always long.
 */
export function computeDivergenceCandidates(histA, histB, symA, symB, cfg = CONFIG.divergence) {
  const h1A = resampleCandles(histA, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(histB, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  if (n <= cfg.lookback + 1) return [];
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, cfg.lookback);
  const atrA = computeAtrSeries(alignedA, cfg.atrPeriod);
  const atrB = computeAtrSeries(alignedB, cfg.atrPeriod);
  const candidates = [];
  let wasExtended = false;
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= cfg.zThreshold;
    if (extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= cfg.zThreshold;
      const symbol = laggardIsB ? symB : symA;
      const atr = laggardIsB ? atrB[i] : atrA[i];
      const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
      if (atr && atr > 0) candidates.push({ symbol, entryTime: entryCandle.time, stopDistance: cfg.stopAtrMultiple * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

const simple = (run, key) => ({ symbolsOf: () => CONFIG[key].symbols, run: (candles, symbol) => run(candles, { rrMultiple: CONFIG[key].rrMultiple, maxHoldingCandles: CONFIG[key].maxHoldingM15Candles }) });

/** The 8 live mechanisms, each with where it really trades (from CONFIG, so this follows the bot). */
export const BOT_MECHANISMS = [
  { id: 'bot-fvg', label: 'FVG filtré', symbolsOf: () => liveFvgSymbols(), run: (candles, symbol) => runLiveFvgRawTrades(candles, symbol) },
  {
    id: 'bot-divergence', label: 'Divergence US100/US500', needsPartner: true,
    symbolsOf: () => CONFIG.divergence.pair,
    partnerOf: (symbol) => CONFIG.divergence.pair.find((s) => s !== symbol),
    run: (candles, symbol, partnerCandles) => {
      const [a, b] = CONFIG.divergence.pair;
      const cands = symbol === a ? computeDivergenceCandidates(candles, partnerCandles, a, b) : computeDivergenceCandidates(partnerCandles, candles, a, b);
      return runDivergenceMomentumBacktestForSymbol(candles, cands.filter((c) => c.symbol === symbol), { rrMultiple: CONFIG.divergence.rrMultiple, maxHoldingCandles: CONFIG.divergence.maxHoldingM15Candles });
    },
  },
  {
    id: 'bot-nwog', label: 'NWOG (gap de semaine)', ...simple(runNwogBacktest, 'nwog'),
    run: (candles, symbol) => runNwogBacktest(candles, { rrMultiple: CONFIG.nwog.rrMultiple, maxHoldingCandles: CONFIG.nwog.maxHoldingM15Candles })
      .filter((t) => !(CONFIG.nwog.longOnlySymbols || []).includes(symbol) || t.direction === 'bullish'),
  },
  { id: 'bot-judas', label: 'Judas Swing', ...simple(runJudasSwingBacktest, 'judasSwing') },
  { id: 'bot-weekly', label: 'Weekly Sweep', ...simple(runWeeklySweepBacktest, 'weeklySweep') },
  { id: 'bot-breaker', label: 'Breaker Block', ...simple(runBreakerBlockBacktest, 'breakerBlock') },
  { id: 'bot-silver', label: 'Silver Bullet', ...simple(runSilverBulletBacktest, 'silverBullet') },
  { id: 'bot-cbdr', label: 'CBDR', ...simple(runCbdrBacktest, 'cbdr') },
];

export const BOT_IDS = BOT_MECHANISMS.map((m) => m.id);
export const botMechanism = (id) => BOT_MECHANISMS.find((m) => m.id === id) ?? null;

/** Which of the bot's mechanisms really run on this symbol. */
export function botMechanismsForSymbol(symbol) {
  return BOT_MECHANISMS.filter((m) => m.symbolsOf().includes(symbol)).map(({ id, label }) => ({ id, label }));
}

/**
 * @param {string} id - 'bot-*' or a Labo strategy id
 * @param {Array} candles - the symbol's M15 candles, engine time
 * @param {string} symbol
 * @param {Array|null} partnerCandles - the pair partner's candles, only for the Divergence
 * @returns {Array|null} replay-shaped trades, or null when the strategy does not apply to this symbol/data
 */
export function runReplayStrategy(id, candles, symbol, partnerCandles = null) {
  const bot = botMechanism(id);
  if (bot) {
    if (!bot.symbolsOf().includes(symbol)) return null;
    if (bot.needsPartner && !partnerCandles) return null;
    return bot.run(candles, symbol, partnerCandles).map(toReplay(id));
  }
  const lab = LAB_STRATEGIES[id];
  if (!lab) throw new Error(`Stratégie inconnue: "${id}"`);
  return lab.run(candles).map(toReplay(id));
}
