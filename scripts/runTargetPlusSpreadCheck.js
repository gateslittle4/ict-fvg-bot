#!/usr/bin/env node
// runTargetPlusSpreadCheck.js
// Usage: node --max-old-space-size=4096 scripts/runTargetPlusSpreadCheck.js [startISO] [endISO]
//
// Esdras (2026-09-22) : "si je ne voulais pas que le spread mange dans mon profit, genre 3 ou 5 RR + spread,
// aura-t-il une grande consequence sur les trades?" - propose d'élargir la cible d'un spread supplémentaire
// (au lieu de RR x distance, viser RR x distance + spread) pour que le RR affiché soit atteint APRÈS le coût
// du spread, pas avant.
//
// Compare, sur les MÊMES candidats (même moteur réel, même méthode que
// runMaxTradesPerDayRealismCheckM1.js), deux résolutions minute par minute sur le vrai M1 :
//   - "actuelle"        : cible = distance x RR (coût du spread simplement soustrait du R réalisé)
//   - "cible + spread"  : cible = distance x RR + spread (le prix doit voyager plus loin avant de toucher la cible)
// La mécanique du stop est INCHANGÉE des deux côtés - seule la cible bouge.

import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const MAX_HOLDING_MINUTES = 480 * 15;

function loadM1(symbol) {
  const raw = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${symbol}.csv.gz`)).toString('utf8');
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
    if (!cur || cur.time !== bucket) { if (cur) out.push(cur); cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
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

  const m1BySymbol = {};
  const m15BySymbol = {};
  for (const symbol of symbols) {
    const m1 = loadM1(symbol);
    m1BySymbol[symbol] = { t: Float64Array.from(m1, (c) => c.time), h: Float64Array.from(m1, (c) => c.high), l: Float64Array.from(m1, (c) => c.low), c: Float64Array.from(m1, (c) => c.close), n: m1.length };
    m15BySymbol[symbol] = toM15(m1);
  }

  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15BySymbol[s];

  const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);

  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr,
    guardrail: warmupGuardrail, riskPctPerTrade: CONFIG.risk.riskPctPerTrade, spreads: DEFAULT_SPREADS,
  });

  console.log('Phase 1 : warmUp() sur tout l\'historique M15 reconstruit du M1...');
  const candidates = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type !== 'validated' || signal.blockedReason) return;
      if (signal.entryTime < startMs && candle.time < startMs) return;
      candidates.push({
        symbol: signal.symbol, source: signal.source, direction: signal.direction,
        entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, distance: signal.distance,
        rrMultiple: signal.rrMultiple, entryTime: candle.time,
      });
    },
  });
  const inWindow = candidates.filter((c) => c.entryTime >= startMs && c.entryTime < endMs);
  console.log(`Candidats dans la fenêtre : ${inWindow.length}\n`);

  function resolveVariant(cand, targetPrice) {
    const S = m1BySymbol[cand.symbol];
    const bullish = cand.direction === 'bullish';
    const start = lowerBound(S.t, S.n, cand.entryTime);
    const end = Math.min(S.n, lowerBound(S.t, S.n, cand.entryTime + 900000));
    let fill = -1;
    if (cand.source === 'fvg') {
      for (let i = start; i < end; i++) if (S.l[i] <= cand.entryPrice && cand.entryPrice <= S.h[i]) { fill = i; break; }
    } else {
      fill = start < S.n ? start : -1;
    }
    if (fill < 0) return null;
    const maxI = Math.min(S.n, fill + MAX_HOLDING_MINUTES);
    for (let i = fill; i < maxI; i++) {
      const hitStop = bullish ? S.l[i] <= cand.stopPrice : S.h[i] >= cand.stopPrice;
      const hitTarget = bullish ? S.h[i] >= targetPrice : S.l[i] <= targetPrice;
      if (hitStop) return { outcome: 'loss', exitTime: S.t[i], exitPrice: cand.stopPrice };
      if (hitTarget) return { outcome: 'win', exitTime: S.t[i], exitPrice: targetPrice };
    }
    const i = maxI - 1;
    return { outcome: 'timeout', exitTime: S.t[i], exitPrice: S.c[i] };
  }

  function netR(cand, exitPrice) {
    const bullish = cand.direction === 'bullish';
    const signedMove = bullish ? exitPrice - cand.entryPrice : cand.entryPrice - exitPrice;
    const grossR = signedMove / cand.distance;
    const spread = DEFAULT_SPREADS[cand.symbol] ?? 0;
    return grossR - (spread > 0 ? spread / cand.distance : 0);
  }

  console.log('Résolution M1 exacte : cible actuelle (RR x distance) vs cible + spread...\n');
  const baseline = [];
  const widened = [];
  let unfilledA = 0, unfilledB = 0;
  for (const cand of inWindow) {
    const bullish = cand.direction === 'bullish';
    const spread = DEFAULT_SPREADS[cand.symbol] ?? 0;
    const targetA = bullish ? cand.entryPrice + cand.rrMultiple * cand.distance : cand.entryPrice - cand.rrMultiple * cand.distance;
    const targetB = bullish ? targetA + spread : targetA - spread;

    const resA = resolveVariant(cand, targetA);
    if (!resA) { unfilledA++; continue; }
    baseline.push({ ...cand, netRMultiple: netR(cand, resA.exitPrice), outcome: resA.outcome, exitTime: resA.exitTime });

    const resB = resolveVariant(cand, targetB);
    if (!resB) { unfilledB++; continue; }
    widened.push({ ...cand, netRMultiple: netR(cand, resB.exitPrice), outcome: resB.outcome, exitTime: resB.exitTime });
  }
  console.log(`Trades résolus (fill requis des deux côtés) : baseline=${baseline.length} (${unfilledA} FVG jamais remplis), cible+spread=${widened.length} (${unfilledB} FVG jamais remplis)\n`);

  function replayThroughGuardrail(trades) {
    const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
    guardrail.setBalance(STARTING_BALANCE, trades.length > 0 ? trades[0].entryTime : startMs);
    let balance = STARTING_BALANCE;
    let accepted = 0, acceptedR = 0, wins = 0;
    const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
    for (const t of sorted) {
      if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) continue;
      accepted++;
      acceptedR += t.netRMultiple;
      if (t.outcome === 'win') wins++;
      const riskAmount = balance * (CONFIG.risk.riskPctPerTrade / 100);
      const pnl = riskAmount * t.netRMultiple;
      balance += pnl;
      guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
    }
    return { accepted, acceptedR, wins, balance };
  }

  const A = replayThroughGuardrail(baseline);
  const B = replayThroughGuardrail(widened);

  const winRateA = baseline.filter((t) => t.outcome === 'win').length / baseline.length;
  const winRateB = widened.filter((t) => t.outcome === 'win').length / widened.length;
  const lossRateA = baseline.filter((t) => t.outcome === 'loss').length / baseline.length;
  const lossRateB = widened.filter((t) => t.outcome === 'loss').length / widened.length;
  const flipped = baseline.filter((t, idx) => widened[idx] && t.outcome === 'win' && widened[idx].outcome !== 'win').length;

  console.log('=== Sur TOUS les candidats résolus (avant plafond de garde-fou) ===');
  console.log(`Actuelle (RR x distance)   : ${baseline.length} trades, ${(winRateA * 100).toFixed(1)}% gagnants, ${(lossRateA * 100).toFixed(1)}% perdants, R net total = ${baseline.reduce((s, t) => s + t.netRMultiple, 0).toFixed(1)}`);
  console.log(`Cible + spread             : ${widened.length} trades, ${(winRateB * 100).toFixed(1)}% gagnants, ${(lossRateB * 100).toFixed(1)}% perdants, R net total = ${widened.reduce((s, t) => s + t.netRMultiple, 0).toFixed(1)}`);
  console.log(`Trades qui étaient gagnants et ne le sont plus (cible jamais atteinte, retour au stop/timeout) : ${flipped} / ${baseline.length}\n`);

  console.log('=== Après rejeu à travers le VRAI GuardrailEngine (maxTradesPerDay=3, etc.) ===');
  console.log(`Actuelle    : ${A.accepted} pris, R net = ${A.acceptedR.toFixed(1)} (moy. ${(A.acceptedR / A.accepted).toFixed(3)}R), solde final $${A.balance.toFixed(0)}`);
  console.log(`Cible+spread: ${B.accepted} pris, R net = ${B.acceptedR.toFixed(1)} (moy. ${(B.acceptedR / B.accepted).toFixed(3)}R), solde final $${B.balance.toFixed(0)}`);
}

main();
