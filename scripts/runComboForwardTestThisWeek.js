#!/usr/bin/env node
// runComboForwardTestThisWeek.js
// Usage: node scripts/runComboForwardTestThisWeek.js <real-data-dir> [weekStartISO]
//
// Esdras: "fait un back foward depuis le commencement de la semaine jusqua
// aujoudhui pour voir les trades que les combo aurait execute" - runs the
// EXACT real production combo (every live mechanism: FVG, Divergence, NWOG,
// Judas Swing, Weekly Sweep, Breaker Block, Silver Bullet - imported
// directly from src/config.js, not hand-copied) through LiveStrategyEngine's
// own warmUp() (the SAME bulk-reconstruction code path production boots
// with, bit-for-bit equivalence to sequential ingestCandle() already proven
// in test/liveStrategyEngine.test.js) on real cTrader candles
// (data/real-data-2026-09-17/, see that dir's own README for provenance),
// then reports every signal that ACTUALLY WOULD HAVE OPENED A REAL POSITION
// (blockedReason === null - a blocked one is not "executed", same
// distinction the dashboard itself makes) with an entry time on or after
// the week-start cutoff.
//
// Real per-symbol history (not just this week's slice) is fed through the
// engine so HTF-bias/structure/liquidity-sweep lookups have proper warm-up
// context, exactly like every other backtest in this project - only the
// REPORTED entries are filtered to the week, not the computation itself.
//
// Uses the REAL guardrail config (CONFIG.guardrails) - not a permissive
// stand-in - so this reports what would have ACTUALLY fired given the
// account's real daily-trade-count/cooldown limits, not an inflated
// before-guardrails count.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

function fmtDate(ms) {
  return new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
function fmtNum(x, d = 2) {
  return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : '—';
}

function main() {
  const dir = process.argv[2];
  // Sunday ~22:00 UTC (NY market open, per server.js's own keep-alive
  // comment "Sun 17:00 -> Fri 17:00 NY") by default - a calendar-Monday
  // cutoff would clip the weekend NWOG gap entry, which typically prints in
  // the first hour or two after Sunday's open (confirmed while writing this
  // script: 2026-09-13 22:15 UTC for both US100/GER40's NWOG entries this
  // week).
  const weekStartArg = process.argv[3] || '2026-09-13T21:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runComboForwardTestThisWeek.js <real-data-dir> [weekStartISO]');
    process.exit(1);
  }
  const weekStartRealUtc = new Date(weekStartArg).getTime();
  const weekStartEngine = weekStartRealUtc - FIXED_EST_TO_UTC_OFFSET_MS;

  const candlesBySymbol = {};
  for (const symbol of CONFIG.symbols) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] no ${symbol}.csv in ${dir}`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    candlesBySymbol[symbol] = candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    // pyramidConfig deliberately omitted: CONFIG.pyramid.enabled reads
    // PYRAMID_ENABLED from THIS process's env, which may not match what's
    // actually set on Render - reported separately as a caveat, not guessed.
  });

  const opened = []; // { id, source, symbol, direction, entryTime, entryPrice, stopPrice, targetPrice, rrMultiple }
  const closedById = new Map();

  engine.warmUp(candlesBySymbol, {
    onEvent: (e) => {
      if (e.type === 'validated' && e.blockedReason === null && e.entryPrice !== undefined) {
        opened.push(e);
      } else if (e.type === 'closed') {
        closedById.set(e.id, e);
      }
    },
  });

  const thisWeek = opened
    .filter((e) => e.validatedAt >= weekStartEngine)
    .sort((a, b) => a.validatedAt - b.validatedAt);

  console.log(`Fenêtre analysée : ${fmtDate(weekStartEngine)} -> maintenant (données jusqu'à ${fmtDate(candlesBySymbol[CONFIG.symbols[0]].at(-1).time)})`);
  console.log(`Trades réellement ouverts par le combo cette semaine : ${thisWeek.length}\n`);

  for (const e of thisWeek) {
    const closed = closedById.get(e.id);
    const outcome = closed ? closed.outcome : 'toujours ouvert / non résolu dans cette fenêtre de données';
    const rMultiple = closed ? (closed.outcome === 'win' ? e.rrMultiple : closed.outcome === 'loss' ? -1 : null) : null;
    console.log(
      `${fmtDate(e.validatedAt)} | ${e.symbol.padEnd(6)} | ${e.source.padEnd(11)} | ${e.direction.padEnd(7)} | ` +
        `entrée=${fmtNum(e.entryPrice, 5)} stop=${fmtNum(e.stopPrice, 5)} cible=${fmtNum(e.targetPrice, 5)} | ${outcome}` +
        (rMultiple !== null ? ` (${rMultiple >= 0 ? '+' : ''}${fmtNum(rMultiple)}R)` : '')
    );
  }

  const bySource = {};
  for (const e of thisWeek) bySource[e.source] = (bySource[e.source] || 0) + 1;
  console.log(`\nPar mécanisme : ${JSON.stringify(bySource)}`);
}

main();
