#!/usr/bin/env node
// runMaxTradesPerDayRealismCheckM1.js
// Usage: node --max-old-space-size=4096 scripts/runMaxTradesPerDayRealismCheckM1.js [startISO] [endISO]
//
// Esdras (2026-09-21) pointed out that runMaxTradesPerDayRealismCheck.js used M15 candles
// (data/backtest-input/), while the M1 sweep another session ran (runMaxTradesSweepFullM1.js) found the
// OPPOSITE verdict (3/jour n'est pas destructeur) on real M1 data - and asked to redo THIS specific analysis
// (which trades get vetoed by max_trades_reached alone, and are they actually good trades?) on the same real
// M1 data, not just re-run a cap sweep.
//
// Same 2-phase method and same REAL production code (LiveStrategyEngine + GuardrailEngine, not the
// approximated scaffold in scripts/lib/stopFloorCore.js other studies use) as the original script - the ONLY
// change is how each candidate trade's outcome is resolved: instead of trusting the engine's own M15 "closed"
// event (which has the project's known "stop wins ties inside one M15 candle" bias), every candidate is
// re-resolved minute-by-minute against data/real-m1-full/*.csv.gz (same method as scripts/runM1Truth.js /
// runM1ProtocolBacktest.js: fill at the entry candle's first minute for a MARKET entry, or the first minute
// that touches the entry price for a LIMIT entry (FVG) - discarded if never touched; then walk forward minute
// by minute, stop only wins a tie within the SAME minute).
//
// CONFIG is imported live, so this automatically reflects GER40's removal (2026-09-21, not yet deployed) -
// this is the current/near-future combo, not a frozen historical one. M1 covers EURUSD/XAUUSD from 2022-05-19,
// indices from 2023-01-11 (see data/real-m1-full/README.md) - the requested window is clipped to what's
// available.

import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT_PER_TRADE = CONFIG.risk.riskPctPerTrade;
const MAX_HOLDING_MINUTES = 480 * 15; // same generic cap used elsewhere in this project's M1 studies

function loadM1(symbol) {
  const raw = fs.existsSync(`data/real-m1-full/${symbol}.csv.gz`)
    ? zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${symbol}.csv.gz`)).toString('utf8')
    : fs.readFileSync(`data/real-m1-full/${symbol}.csv`, 'utf8');
  const lines = raw.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    out.push({ time: Number(p[0]) - FIXED_EST_TO_UTC_OFFSET_MS, open: Number(p[1]), high: Number(p[2]), low: Number(p[3]), close: Number(p[4]) });
  }
  return out;
}

function toM15(m1) {
  const out = [];
  let cur = null;
  for (const c of m1) {
    const bucket = Math.floor(c.time / 900000) * 900000;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function lowerBound(arr, n, x) {
  let lo = 0, hi = n;
  while (hi > lo) { const mid = (lo + hi) >> 1; if (arr[mid] >= x) hi = mid; else lo = mid + 1; }
  return lo;
}

function main() {
  const startArg = process.argv[2] || '2024-01-01T00:00:00Z';
  const endArg = process.argv[3] || '2026-01-01T00:00:00Z';
  const startMs = Date.parse(startArg);
  const endMs = Date.parse(endArg);

  const symbols = CONFIG.symbols;
  console.log(`Symboles (config actuelle) : ${symbols.join(', ')}\n`);

  console.log('Chargement du M1 réel et reconstruction des M15...');
  const m1BySymbol = {};
  const m15BySymbol = {};
  for (const symbol of symbols) {
    const m1 = loadM1(symbol);
    m1BySymbol[symbol] = {
      t: Float64Array.from(m1, (c) => c.time),
      h: Float64Array.from(m1, (c) => c.high),
      l: Float64Array.from(m1, (c) => c.low),
      c: Float64Array.from(m1, (c) => c.close),
      n: m1.length,
    };
    m15BySymbol[symbol] = toM15(m1);
  }

  // --- Phase 1: warmUp() over the full M15 (reconstructed from M1) history, permissive guardrail (netting/
  // direction filters still apply - only the daily-cap/cooldown/loss-limit gate is disabled), to get the
  // engine's natural candidate list with entry/stop/target - the SAME candidate-generation code path as the
  // original M15 script, just fed M15 candles built from the real M1 series instead of data/backtest-input/.
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15BySymbol[s];

  const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);

  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    cbdrConfig: CONFIG.cbdr,
    guardrail: warmupGuardrail,
    riskPctPerTrade: RISK_PCT_PER_TRADE,
    spreads: DEFAULT_SPREADS,
  });

  console.log('Phase 1 : warmUp() sur tout l\'historique M15 reconstruit du M1...');
  const candidates = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type !== 'validated' || signal.blockedReason) return;
      candidates.push({
        symbol: signal.symbol, source: signal.source, direction: signal.direction,
        entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
        distance: signal.distance, rrMultiple: signal.rrMultiple, entryTime: candle.time,
      });
    },
  });
  console.log(`Candidats (netting/filtres de direction déjà appliqués, plafond/cooldown/perte pas encore) : ${candidates.length}`);

  // --- M1-exact resolution of every candidate, same method as scripts/runM1Truth.js
  let unfilled = 0;
  function resolveOnM1(cand) {
    const S = m1BySymbol[cand.symbol];
    const bullish = cand.direction === 'bullish';
    const entryCandleTime = cand.entryTime; // candle whose open/spot the signal fires on
    const start = lowerBound(S.t, S.n, entryCandleTime);
    const end = Math.min(S.n, lowerBound(S.t, S.n, entryCandleTime + 900000));
    let fill = -1;
    // MARKET entry (everything except FVG's limit-at-gap-edge): fills at the candle's first available minute.
    // LIMIT entry (FVG): needs a minute whose [low,high] actually touches entryPrice within its own M15 candle.
    if (cand.source === 'fvg') {
      for (let i = start; i < end; i++) {
        if (S.l[i] <= cand.entryPrice && cand.entryPrice <= S.h[i]) { fill = i; break; }
      }
    } else {
      fill = start < S.n ? start : -1;
    }
    if (fill < 0) { unfilled++; return null; }
    const maxI = Math.min(S.n, fill + MAX_HOLDING_MINUTES);
    for (let i = fill; i < maxI; i++) {
      const hitStop = bullish ? S.l[i] <= cand.stopPrice : S.h[i] >= cand.stopPrice;
      const hitTarget = bullish ? S.h[i] >= cand.targetPrice : S.l[i] <= cand.targetPrice;
      if (hitStop) return { outcome: 'loss', exitTime: S.t[i] };
      if (hitTarget) return { outcome: 'win', exitTime: S.t[i] };
    }
    const i = maxI - 1;
    const netR = (bullish ? S.c[i] - cand.entryPrice : cand.entryPrice - S.c[i]) / cand.distance;
    return { outcome: 'timeout', exitTime: S.t[i], netRTimeout: netR };
  }

  function netRMultipleOf(cand, exitPrice) {
    const bullish = cand.direction === 'bullish';
    const signedMove = bullish ? exitPrice - cand.entryPrice : cand.entryPrice - exitPrice;
    const grossR = signedMove / cand.distance;
    const spread = DEFAULT_SPREADS[cand.symbol] ?? 0;
    const costR = spread > 0 ? spread / cand.distance : 0;
    return grossR - costR;
  }

  console.log('Résolution M1 exacte de chaque candidat (bougie par bougie, minute par minute)...');
  const trades = [];
  for (const cand of candidates) {
    if (cand.entryTime < startMs || cand.entryTime >= endMs) continue;
    const res = resolveOnM1(cand);
    if (!res) continue; // FVG limit never touched at minute resolution
    const exitPrice = res.outcome === 'win' ? cand.targetPrice : res.outcome === 'loss' ? cand.stopPrice : null;
    const netRMultiple = res.outcome === 'timeout' ? res.netRTimeout - (DEFAULT_SPREADS[cand.symbol] ?? 0) / cand.distance : netRMultipleOf(cand, exitPrice);
    trades.push({ symbol: cand.symbol, source: cand.source, entryTime: cand.entryTime, exitTime: res.exitTime, netRMultiple });
  }
  trades.sort((a, b) => a.entryTime - b.entryTime);
  console.log(`Trades dans la fenêtre, résolus en M1 exact : ${trades.length} (${unfilled} entrées FVG jamais touchées, écartées)\n`);

  // --- Phase 2: chronological replay through ONE real, persistent GuardrailEngine(CONFIG.guardrails) - identical to the original script.
  console.log(`Phase 2 : rejeu à travers UN SEUL GuardrailEngine réel et persistant (maxTradesPerDay=${CONFIG.guardrails.maxTradesPerDay}, cooldown=${CONFIG.guardrails.cooldownMinutesAfterLoss}min, dailyLossLimitPct=${CONFIG.guardrails.dailyLossLimitPct}%)...\n`);

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
  guardrail.setBalance(STARTING_BALANCE, trades.length > 0 ? trades[0].entryTime : startMs);
  let balance = STARTING_BALANCE;

  const vetoReasonCounts = {};
  const vetoedTrades = [];
  let accepted = 0;
  let acceptedR = 0;

  for (const t of trades) {
    if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) {
      const status = guardrail.getStatus(t.entryTime, t.symbol);
      for (const reason of status.blockReasons) vetoReasonCounts[reason] = (vetoReasonCounts[reason] || 0) + 1;
      vetoedTrades.push({ ...t, reasons: status.blockReasons });
      continue;
    }
    accepted++;
    acceptedR += t.netRMultiple;
    const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * t.netRMultiple;
    balance += pnl;
    guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
  }

  console.log(`Trades pris : ${accepted} / ${trades.length} (${((accepted / trades.length) * 100).toFixed(1)}%), R net = ${acceptedR.toFixed(1)}, moyenne ${(acceptedR / accepted).toFixed(3)}R`);
  console.log(`Trades vétoés (au moins une raison) : ${vetoedTrades.length} (${((vetoedTrades.length / trades.length) * 100).toFixed(1)}%)\n`);
  console.log('Répartition des raisons de veto (un trade vétoé peut cumuler plusieurs raisons) :');
  for (const [reason, count] of Object.entries(vetoReasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(28)} ${count} (${((count / trades.length) * 100).toFixed(1)}% de tous les trades candidats)`);
  }

  const maxTradesOnly = vetoedTrades.filter((t) => t.reasons.length === 1 && t.reasons[0] === 'max_trades_reached');
  const maxTradesOnlyR = maxTradesOnly.reduce((s, t) => s + t.netRMultiple, 0);
  console.log(`\nVétoés PAR max_trades_reached SEUL : ${maxTradesOnly.length} (${((maxTradesOnly.length / trades.length) * 100).toFixed(1)}% de tous les trades candidats)`);
  console.log(`  R net de ces trades vétoés = ${maxTradesOnlyR.toFixed(1)}, moyenne ${(maxTradesOnlyR / maxTradesOnly.length).toFixed(3)}R (comparer à la moyenne des trades pris ci-dessus)`);

  const daysHit = new Set(maxTradesOnly.map((t) => new Date(t.entryTime).toISOString().slice(0, 10)));
  const daysActive = new Set(trades.map((t) => new Date(t.entryTime).toISOString().slice(0, 10)));
  console.log(`Jours où max_trades_reached (seul) a coûté au moins 1 trade : ${daysHit.size} / ${daysActive.size} jours actifs (${((daysHit.size / daysActive.size) * 100).toFixed(1)}%)`);

  if (maxTradesOnly.length > 0) {
    console.log('\nExemples (jusqu\'à 10) :');
    for (const t of maxTradesOnly.slice(0, 10)) {
      console.log(`  ${new Date(t.entryTime).toISOString()} ${t.source}/${t.symbol} netR=${t.netRMultiple.toFixed(2)}`);
    }
  }
}

main();
