// labRegistry.js
// Backs the dashboard's "Labo de stratégies" tab (2026-09-18, Esdras: "tu as
// tres peu dimagination" after a round of dashboard polish - asked for
// something bigger). This project has ~20 fully-built, already-tested
// backtest engines (src/backtest/*.js) that were only ever reachable by
// asking a Claude session to write and run a one-off scripts/run*.js - most
// of them never made it past research into anything Esdras could poke at
// himself. This registry is the single place that turns each one into a
// {label, run(candles) -> trades[]} the dashboard can call generically.
//
// Deliberately excludes: mechanisms needing a second candle series
// (smtDivergence, correlation), a different timeframe (rsiMomentum wants
// daily candles, divergenceMomentum wants pre-computed candidates), and
// pure sub-components that aren't standalone entry generators (marketStructure,
// liquiditySweep, dynamicLiquidityTarget, htfBias, weekdayFilter, newsEvents,
// volatilityRegime, gridRunner, portfolioSimulator, backtestEngine's own
// generic runBacktest - that one already powers the LIVE FVG/mechanism grid
// via accountRuntime.js, this registry is specifically for the ones that
// don't have a live/dashboard home yet). Each entry's default config is
// copied from that mechanism's own scripts/run<Name>StrategyAnalysis.js -
// the same config already used to screen it on train/test data - not a
// fresh guess.

import { runAnchoredVwapBacktest } from './anchoredVwap.js';
import { runAsianRangeFadeBacktest } from './asianRangeFade.js';
import { runAsianRangeBreakoutBacktest } from './asianRangeBreakout.js';
import { runBollingerSqueezeBacktest } from './bollingerSqueeze.js';
import { runBreakerBlockBacktest } from './breakerBlock.js';
import { runCbdrBacktest } from './cbdr.js';
import { runDmiTrendBacktest } from './dmiTrend.js';
import { runEqualHighsLowsBacktest } from './equalHighsLows.js';
import { runGapContinuationBacktest, DAILY_GAP_HOURS } from './gapContinuation.js';
import { runHtfSupportReversalBacktest } from './htfSupportReversal.js';
import { runJudasSwingBacktest } from './judasSwing.js';
import { runMacdTrendBacktest } from './macdTrend.js';
import { runMidnightOpenRetracementBacktest } from './midnightOpen.js';
import { runMitigationBlockBacktest } from './mitigationBlock.js';
import { runNdogBacktest } from './ndog.js';
import { runNwogBacktest } from './nwog.js';
import { runOteBacktest } from './oteStrategy.js';
import { runPowerOfThreeBacktest } from './powerOfThree.js';
import { runRsiDivergenceBacktest } from './rsiDivergence.js';
import { runStarPatternsBacktest } from './starPatterns.js';
import { runUnicornModelBacktest } from './unicornModel.js';
import { runWeeklySweepBacktest } from './weeklyLiquiditySweep.js';

export const LAB_STRATEGIES = {
  'anchored-vwap': { label: 'Anchored VWAP', run: (c) => runAnchoredVwapBacktest(c) },
  'asian-range-fade': { label: 'Asian Range Fade', run: (c) => runAsianRangeFadeBacktest(c) },
  'asian-range-breakout': { label: 'Asian Range Breakout', run: (c) => runAsianRangeBreakoutBacktest(c) },
  'bollinger-squeeze': { label: 'Bollinger Squeeze', run: (c) => runBollingerSqueezeBacktest(c) },
  'breaker-block': { label: 'Breaker Block', run: (c) => runBreakerBlockBacktest(c) },
  cbdr: { label: 'CBDR (Central Bank Dealer Range)', run: (c) => runCbdrBacktest(c) },
  'dmi-trend': { label: 'DMI Trend', run: (c) => runDmiTrendBacktest(c) },
  'equal-highs-lows': { label: 'Equal Highs / Equal Lows', run: (c) => runEqualHighsLowsBacktest(c) },
  'gap-continuation': { label: 'Gap Continuation (quotidien)', run: (c) => runGapContinuationBacktest(c, DAILY_GAP_HOURS) },
  'htf-support-reversal': { label: 'Support HTF (jour/semaine/mois) + renversement', run: (c) => runHtfSupportReversalBacktest(c) },
  'judas-swing': { label: 'Judas Swing', run: (c) => runJudasSwingBacktest(c) },
  'macd-trend': { label: 'MACD Trend', run: (c) => runMacdTrendBacktest(c) },
  'midnight-open': { label: 'Midnight Open Retracement', run: (c) => runMidnightOpenRetracementBacktest(c) },
  'mitigation-block': { label: 'Mitigation Block', run: (c) => runMitigationBlockBacktest(c) },
  ndog: { label: 'NDOG (New Day Opening Gap)', run: (c) => runNdogBacktest(c) },
  nwog: { label: 'NWOG (New Week Opening Gap)', run: (c) => runNwogBacktest(c) },
  ote: { label: 'OTE (Optimal Trade Entry)', run: (c) => runOteBacktest(c) },
  'power-of-three': { label: 'Power of Three', run: (c) => runPowerOfThreeBacktest(c) },
  'rsi-divergence': { label: 'RSI Divergence', run: (c) => runRsiDivergenceBacktest(c) },
  'star-patterns': { label: 'Star Patterns', run: (c) => runStarPatternsBacktest(c) },
  'unicorn-model': { label: 'Unicorn Model', run: (c) => runUnicornModelBacktest(c) },
  'weekly-sweep': { label: 'Weekly Liquidity Sweep', run: (c) => runWeeklySweepBacktest(c) },
};

export function listLabStrategies() {
  return Object.entries(LAB_STRATEGIES).map(([id, { label }]) => ({ id, label }));
}
