#!/usr/bin/env node
// runFtmo1StepFullHistoryTrainTestForward2026.js
// Usage: node --max-old-space-size=4096 scripts/runFtmo1StepFullHistoryTrainTestForward2026.js
//
// Esdras: "fais des analyses du marche avec les vrais donnees qu'on a
// telecharge dans l'autre session, train, test et forward de janvier 2026 a
// nos jours, donne moi le resultat en % du compte, combien de challenge
// perdu ou gagne, ensuite d'autres configurations qui pourraient augmenter
// nos chances de rester sur le marche plus longtemps."
//
// Meme methode 2 phases que runFtmo1Step2026Real7MonthsCycle.js (warmUp()
// unique -> liste canonique de trades, puis rejeu dans de vrais cycles FTMO
// 1-Step / un vrai compte continu via GuardrailEngine reel), mais sur
// data/real-m1-full/*.csv.gz (M1 reel FP Markets SANS les trous de 16 jours
// du premier export - voir HANDOFF.md 2026-09-21 "Trous periodiques"),
// reconstruit en M15 (comme runM1ProtocolBacktest.js), et decoupe en:
//   - ENTRAINEMENT : tout l'historique disponible avant 2026-01-01 (sert de
//     contexte de warm-up pour les mecanismes a longue portee - H4 EMA200,
//     structure, profondeur CBDR - et de reference, PAS de reglage ici)
//   - TEST / FORWARD : 2026-01-01 -> derniere bougie disponible (~2026-09-21),
//     la fenetre demandee par Esdras, jamais vue par aucun reglage anterieur
//     du combo (tous les reglages historiques s'arretent a 2025).
// Combo = celui EN PRODUCTION aujourd'hui (CONFIG.symbols = US100, US500,
// XAUUSD, EURUSD - GER40 deja retire, decision du 2026-09-21).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols; // combo EN PRODUCTION aujourd'hui (GER40 deja retire)
const STARTING_BALANCE = 10000;
const CUT = Date.UTC(2026, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS; // 2026-01-01 en temps moteur
const fmtDate = (ms) => new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const fmtMoney = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 });
  }
  return out;
}
function toM15(m1) {
  const out = [];
  let cur = null;
  for (const c of m1) {
    const b = Math.floor(c.time / 900000) * 900000;
    if (!cur || cur.time !== b) {
      if (cur) out.push(cur);
      cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}
function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}

// --- Phase 1 : un seul warmUp() sur TOUT l'historique real-m1-full disponible ---
function runPhase1(riskPctPerTrade) {
  const m15BySymbol = {};
  for (const s of SYMBOLS) m15BySymbol[s] = toM15(loadGz(s));
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
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
    riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
  });

  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      const exitPrice = signal.outcome === 'win' ? open.targetPrice : signal.outcome === 'loss' ? open.stopPrice : candle.close;
      trades.push({
        symbol: signal.symbol, source: open.source, direction: open.direction,
        entryTime: open.entryTime, exitTime: signal.exitTime,
        netRMultiple: netRMultipleOf(open.direction, open.entryPrice, open.distance, exitPrice, signal.symbol),
      });
    },
  });

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

// --- Compte continu (pas de reset a chaque cycle FTMO) : le vrai garde-fou du bot ---
function runContinuousAccount(trades, riskPctPerTrade) {
  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
  guardrail.setBalance(STARTING_BALANCE, trades.length ? trades[0].entryTime : Date.now());
  let balance = STARTING_BALANCE, peak = STARTING_BALANCE, maxDD = 0, vetoed = 0;
  const taken = [];
  for (const t of trades) {
    if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const riskAmount = balance * (riskPctPerTrade / 100);
    const pnl = riskAmount * t.netRMultiple;
    balance += pnl;
    peak = Math.max(peak, balance);
    maxDD = Math.max(maxDD, (peak - balance) / peak * 100);
    guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: balance, symbol: t.symbol });
    taken.push({ ...t, pnl, balanceAfter: balance });
  }
  return { balance, pctReturn: (balance - STARTING_BALANCE) / STARTING_BALANCE * 100, maxDD, taken, vetoed, n: taken.length };
}

// --- Vrais cycles FTMO 1-Step (reset a chaque +10% ou -10% trailing) ---
function runFtmoCycles(trades, riskPctPerTrade) {
  const effective = buildEffectiveConfig({ id: 'ftmo-1step-2026-train-test-forward', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade });
  const cycles = [];
  let cycle = null, vetoedByGuardrail = 0;
  function startCycle(startTime) {
    const guardrail = new GuardrailEngine({ ...effective.guardrails });
    guardrail.setBalance(STARTING_BALANCE, startTime);
    cycle = { n: cycles.length + 1, startTime, endTime: null, outcome: 'en cours', trades: [], balance: STARTING_BALANCE, guardrail };
  }
  startCycle(trades.length > 0 ? trades[0].entryTime : Date.now());
  for (const t of trades) {
    if (!cycle.guardrail.canTakeNewTrade(t.entryTime, t.symbol)) { vetoedByGuardrail++; continue; }
    const riskAmount = cycle.balance * (riskPctPerTrade / 100);
    const pnl = riskAmount * t.netRMultiple;
    cycle.balance += pnl;
    cycle.trades.push({ ...t, pnl, balanceAfter: cycle.balance });
    cycle.guardrail.recordTrade({ pnl, time: t.exitTime, balanceAfter: cycle.balance, symbol: t.symbol });
    const status = cycle.guardrail.getStatus(t.exitTime, t.symbol);
    if (status.targetReached || status.overallDrawdownBreached) {
      cycle.endTime = t.exitTime;
      cycle.outcome = status.targetReached ? 'RÉUSSI (+10%)' : 'RATÉ (drawdown -10%)';
      cycles.push(cycle);
      startCycle(t.exitTime);
    }
  }
  if (cycle.trades.length > 0 || cycles.length === 0) {
    cycle.endTime = trades.length > 0 ? trades[trades.length - 1].exitTime : Date.now();
    cycle.outcome = `en cours (${fmtPct((cycle.balance - STARTING_BALANCE) / STARTING_BALANCE * 100)})`;
    cycles.push(cycle);
  }
  const passes = cycles.filter((c) => c.outcome.startsWith('RÉUSSI'));
  const busts = cycles.filter((c) => c.outcome.startsWith('RATÉ'));
  const inProgress = cycles.filter((c) => c.outcome.startsWith('en cours'));
  return { cycles, passes, busts, inProgress, vetoedByGuardrail };
}

function main() {
  const md = [];
  const RISK_LEVELS = [0.25, 0.3, 0.5];
  console.log(`Phase 1 (une seule fois par risque%, warm-up sur tout ${SYMBOLS.join('/')}) ...`);

  md.push('# Combo actuel (US100/US500/XAUUSD/EURUSD, GER40 retiré) — entraînement / test-forward 2026-01-01 → aujourd\'hui, sur M1 réel sans trous', '');
  md.push('Données : `data/real-m1-full/*.csv.gz` (FP Markets, M1 réel, EURUSD/XAUUSD dès 2022-05-19, US100/US500 dès 2023-01-11, jusqu\'à ~2026-09-21), M15 reconstruits du M1. Un seul `warmUp()` sur tout l\'historique disponible par risque% testé (mécanismes réels, `LiveStrategyEngine`), puis rejeu dans un vrai `GuardrailEngine` (garde-fous du combo en prod : 3 trades/jour, pause 30 min après perte, arrêt du jour à -2%). **Entraînement** = avant 2026-01-01 (contexte + référence, aucun réglage fait ici). **Test/forward** = 2026-01-01 → dernière bougie dispo, jamais vu par aucun réglage antérieur du combo (tous arrêtés à 2025).', '');
  md.push('**Lecture :** garde-fous réels mais coûts partiels (spread mesuré par paire, sans commission/swap/glissement réel ni le correctif de géométrie d\'ordre au marché encore non déployé — voir `order-geometry-live-vs-backtest.md`) : niveau absolu encore surestimé par rapport à la démo réelle (~+31 % du vrai moteur sur 7 mois de suivi réel). Lire les écarts relatifs entre configurations, pas les dollars comme une promesse.', '');

  for (const risk of RISK_LEVELS) {
    console.log(`  risque ${risk}%/trade...`);
    const trades = runPhase1(risk);
    const trainTrades = trades.filter((t) => t.entryTime < CUT);
    const forwardTrades = trades.filter((t) => t.entryTime >= CUT);

    const trainCont = runContinuousAccount(trainTrades, risk);
    const fwdCont = runContinuousAccount(forwardTrades, risk);
    const trainCycles = runFtmoCycles(trainTrades, risk);
    const fwdCycles = runFtmoCycles(forwardTrades, risk);

    md.push(`## Risque ${risk}%/trade`, '');
    md.push('| Fenêtre | Trades | Vétos garde-fou | Compte continu $10k (résultat en %) | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |');
    md.push('|---|---|---|---|---|---|');
    md.push(`| Entraînement (< 2026-01-01) | ${trainTrades.length} | ${trainCont.vetoed} | ${fmtPct(trainCont.pctReturn)} ($${trainCont.balance.toFixed(0)}) | ${trainCont.maxDD.toFixed(1)}% | ${trainCycles.passes.length}/${trainCycles.busts.length}/${trainCycles.inProgress.length} |`);
    md.push(`| **Test/forward (2026-01-01 → ${fmtDate(forwardTrades.length ? forwardTrades[forwardTrades.length - 1].exitTime : trades[trades.length - 1].exitTime)})** | **${forwardTrades.length}** | **${fwdCont.vetoed}** | **${fmtPct(fwdCont.pctReturn)} ($${fwdCont.balance.toFixed(0)})** | **${fwdCont.maxDD.toFixed(1)}%** | **${fwdCycles.passes.length}/${fwdCycles.busts.length}/${fwdCycles.inProgress.length}** |`);
    md.push('', '### Détail des cycles FTMO 1-Step — fenêtre test/forward (2026-01-01 → aujourd\'hui)', '', '| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |', '|---|---|---|---|---|---|---|');
    for (const c of fwdCycles.cycles) {
      const days = Math.round((c.endTime - c.startTime) / 86400000);
      md.push(`| ${c.n} | ${fmtDate(c.startTime)} | ${fmtDate(c.endTime)} | ${days} | ${c.trades.length} | ${c.outcome} | $${c.balance.toFixed(2)} |`);
    }
    md.push('');

    if (risk === 0.3) {
      console.log(`\n=== RÉFÉRENCE (risque réel live actuel, 0,3%) — fenêtre test/forward 2026-01-01 → ${fmtDate(forwardTrades[forwardTrades.length - 1].exitTime)} ===`);
      console.log(`Trades: ${forwardTrades.length} | Compte continu $10k: ${fmtPct(fwdCont.pctReturn)} (solde $${fwdCont.balance.toFixed(2)}) | pire baisse ${fwdCont.maxDD.toFixed(1)}%`);
      console.log(`Cycles FTMO 1-Step: ${fwdCycles.passes.length} réussis / ${fwdCycles.busts.length} ratés / ${fwdCycles.inProgress.length} en cours`);
    }
  }

  fs.writeFileSync('data/backtest-input/full-history-train-test-forward-2026.md', md.join('\n'));
  console.log('\nRapport complet écrit dans data/backtest-input/full-history-train-test-forward-2026.md');
}

main();
