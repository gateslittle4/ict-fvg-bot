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
// v2 (meme jour, plus tard) : la premiere version reglait chaque trade en
// M15 "stop d'abord" (comme LiveStrategyEngine.warmUp() tout seul) - une
// autre session a entre-temps demontre (engine-m1-vs-m15-reconciliation.md)
// que ce reglement est structurellement pessimiste par rapport au vrai
// M1 (ex. +88.9 R en M15 contre +220 R en M1 exact sur tout l'historique,
// production sans GER40, 0.3%/trade). Reprend donc EXACTEMENT la methode de
// reconciliation de scripts/runEngineM1Backtest.js (meme fonction settleM1,
// un seul warmUp() du VRAI moteur pour la liste canonique, regle ensuite
// aux DEUX conventions - M15 et M1 exact - pour ne pas cacher l'ecart),
// mais decoupee ici en entrainement (< 2026-01-01) / test-forward
// (2026-01-01 -> aujourd'hui) avec en plus le comptage des cycles FTMO
// 1-Step reels (que l'autre script ne faisait pas), pour repondre a "combien
// de challenge perdu ou gagne" sur la fenetre demandee par Esdras.
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
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

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
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => { const g = (dir === 'bullish' ? exit - entry : entry - exit) / d; const s = DEFAULT_SPREADS[sym] ?? 0; return g - (s > 0 ? s / d : 0); };

console.log('Chargement M1 réel (real-m1-full) + reconstruction M15...');
const m1Bars = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of SYMBOLS) {
  const cs = m1Bars[s];
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}

// Reglement M1 exact d'un trade valide par le moteur (meme fonction que runEngineM1Backtest.js) :
// remplissage a l'interieur de la bougie M15 d'entree, puis minute par minute jusqu'au premier
// contact du stop ou de la cible.
function settleM1(tr) {
  const S = M1[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], outcome: 'loss' };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], outcome: 'win' };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], outcome: 'timeout' };
}

// --- Phase 1 : UN SEUL warmUp() du vrai moteur (risque n'affecte pas la génération de signal,
// seulement le sizing en phase 2 - même simplification que runEngineM1Backtest.js) ---
function runPhase1() {
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15[s];

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
    riskPctPerTrade: 0.5,
    spreads: DEFAULT_SPREADS,
  });

  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          symbol: signal.symbol, source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      const exit15 = signal.outcome === 'win' ? open.targetPrice : signal.outcome === 'loss' ? open.stopPrice : candle.close;
      const m1exit = settleM1(open);
      if (!m1exit) return;
      trades.push({
        symbol: open.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime,
        m15: { netR: netR(open.direction, open.entryPrice, open.distance, exit15, open.symbol), exitTime: signal.exitTime },
        m1: { netR: netR(open.direction, open.entryPrice, open.distance, m1exit.exitPrice, open.symbol), exitTime: m1exit.exitTime },
      });
    },
  });

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

// --- Compte continu (pas de reset a chaque cycle FTMO) : le vrai garde-fou du bot ---
function runContinuousAccount(trades, riskPctPerTrade, mode) {
  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails });
  guardrail.setBalance(STARTING_BALANCE, trades.length ? trades[0].entryTime : Date.now());
  let balance = STARTING_BALANCE, peak = STARTING_BALANCE, maxDD = 0, vetoed = 0, n = 0;
  for (const t of trades) {
    if (!guardrail.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const r = t[mode].netR;
    const pnl = balance * (riskPctPerTrade / 100) * r;
    balance += pnl;
    peak = Math.max(peak, balance);
    maxDD = Math.max(maxDD, (peak - balance) / peak * 100);
    guardrail.recordTrade({ pnl, time: t[mode].exitTime, balanceAfter: balance, symbol: t.symbol });
    n++;
  }
  return { balance, pctReturn: (balance - STARTING_BALANCE) / STARTING_BALANCE * 100, maxDD, vetoed, n };
}

// --- Vrais cycles FTMO 1-Step (reset a chaque +10% ou -10% trailing) ---
function runFtmoCycles(trades, riskPctPerTrade, mode) {
  const effective = buildEffectiveConfig({ id: 'ftmo-1step-2026-train-test-forward', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade });
  const cycles = [];
  let cycle = null, vetoedByGuardrail = 0;
  function startCycle(startTime) {
    const guardrail = new GuardrailEngine({ ...effective.guardrails });
    guardrail.setBalance(STARTING_BALANCE, startTime);
    cycle = { n: cycles.length + 1, startTime, endTime: null, outcome: 'en cours', trades: 0, balance: STARTING_BALANCE, guardrail };
  }
  startCycle(trades.length > 0 ? trades[0].entryTime : Date.now());
  for (const t of trades) {
    if (!cycle.guardrail.canTakeNewTrade(t.entryTime, t.symbol)) { vetoedByGuardrail++; continue; }
    const r = t[mode].netR;
    const pnl = cycle.balance * (riskPctPerTrade / 100) * r;
    cycle.balance += pnl;
    cycle.trades++;
    cycle.guardrail.recordTrade({ pnl, time: t[mode].exitTime, balanceAfter: cycle.balance, symbol: t.symbol });
    const status = cycle.guardrail.getStatus(t[mode].exitTime, t.symbol);
    if (status.targetReached || status.overallDrawdownBreached) {
      cycle.endTime = t[mode].exitTime;
      cycle.outcome = status.targetReached ? 'RÉUSSI (+10%)' : 'RATÉ (drawdown -10%)';
      cycles.push(cycle);
      startCycle(t[mode].exitTime);
    }
  }
  if (cycle.trades > 0 || cycles.length === 0) {
    cycle.endTime = trades.length > 0 ? trades[trades.length - 1][mode].exitTime : Date.now();
    cycle.outcome = `en cours (${fmtPct((cycle.balance - STARTING_BALANCE) / STARTING_BALANCE * 100)})`;
    cycles.push(cycle);
  }
  const passes = cycles.filter((c) => c.outcome.startsWith('RÉUSSI'));
  const busts = cycles.filter((c) => c.outcome.startsWith('RATÉ'));
  const inProgress = cycles.filter((c) => c.outcome.startsWith('en cours'));
  return { cycles, passes, busts, inProgress, vetoedByGuardrail };
}

function main() {
  console.log('Phase 1 : un seul warmUp() du vrai moteur, réglé aux DEUX conventions (M15 et M1 exact)...');
  const trades = runPhase1();
  console.log(`Trades canoniques: ${trades.length}`);
  const trainTrades = trades.filter((t) => t.entryTime < CUT);
  const forwardTrades = trades.filter((t) => t.entryTime >= CUT);
  console.log(`  entraînement (< 2026-01-01): ${trainTrades.length} | test/forward (>= 2026-01-01): ${forwardTrades.length}\n`);

  const md = [];
  md.push('# Combo actuel (US100/US500/XAUUSD/EURUSD, GER40 retiré) — entraînement / test-forward 2026-01-01 → aujourd\'hui, réglement M15 (moteur) vs M1 exact', '');
  md.push('Données : `data/real-m1-full/*.csv.gz` (FP Markets, M1 réel, EURUSD/XAUUSD dès 2022-05-19, US100/US500 dès 2023-01-11, jusqu\'à ~2026-09-21), M15 reconstruits du M1. Un seul `warmUp()` du VRAI moteur (`LiveStrategyEngine`) sur tout l\'historique disponible, réglé aux DEUX conventions (M15 "stop d\'abord", comme le moteur en solo ; M1 exact, minute par minute — méthode identique à `scripts/runEngineM1Backtest.js`, la réconciliation de la session précédente qui a montré que le M15 sous-estime structurellement le résultat), puis rejeu dans un vrai `GuardrailEngine` (3 trades/jour, pause 30 min après perte, arrêt du jour à -2%). **Entraînement** = avant 2026-01-01 (contexte + référence). **Test/forward** = 2026-01-01 → dernière bougie dispo, jamais vu par aucun réglage antérieur du combo.', '');
  md.push('**Lecture :** coûts partiels (spread mesuré par paire, sans commission/swap/glissement réel ni le correctif de géométrie d\'ordre au marché, encore non déployé) : niveau absolu encore surestimé par rapport à la démo réelle. Le M1 exact est la convention de référence désormais (voir `engine-m1-vs-m15-reconciliation.md`) ; le M15 reste affiché pour comparaison, pas comme vérité.', '');

  const RISK_LEVELS = [0.25, 0.3, 0.5];
  for (const risk of RISK_LEVELS) {
    md.push(`## Risque ${risk}%/trade`, '');
    md.push('| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |');
    md.push('|---|---|---|---|---|---|---|');
    for (const mode of ['m15', 'm1']) {
      const trainCont = runContinuousAccount(trainTrades, risk, mode);
      const fwdCont = runContinuousAccount(forwardTrades, risk, mode);
      const trainCycles = runFtmoCycles(trainTrades, risk, mode);
      const fwdCycles = runFtmoCycles(forwardTrades, risk, mode);
      const label = mode === 'm1' ? 'M1 exact' : 'M15 (moteur)';
      md.push(`| Entraînement (< 2026-01-01) | ${label} | ${trainCont.n} | ${trainCont.vetoed} | ${fmtPct(trainCont.pctReturn)} | ${trainCont.maxDD.toFixed(1)}% | ${trainCycles.passes.length}/${trainCycles.busts.length}/${trainCycles.inProgress.length} |`);
      md.push(`| **Test/forward (2026-01-01 → fin)** | **${label}** | **${fwdCont.n}** | **${fwdCont.vetoed}** | **${fmtPct(fwdCont.pctReturn)}** | **${fwdCont.maxDD.toFixed(1)}%** | **${fwdCycles.passes.length}/${fwdCycles.busts.length}/${fwdCycles.inProgress.length}** |`);
      if (mode === 'm1') {
        md.push('', `### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque ${risk}%`, '', '| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |', '|---|---|---|---|---|---|---|');
        for (const c of fwdCycles.cycles) {
          const days = Math.round((c.endTime - c.startTime) / 86400000);
          md.push(`| ${c.n} | ${fmtDate(c.startTime)} | ${fmtDate(c.endTime)} | ${days} | ${c.trades} | ${c.outcome} | $${c.balance.toFixed(2)} |`);
        }
        md.push('');
        if (risk === 0.3) {
          console.log(`=== RÉFÉRENCE M1 exact, risque réel live 0.3%, test/forward 2026-01-01 → ${fmtDate(forwardTrades[forwardTrades.length - 1].m1.exitTime)} ===`);
          console.log(`Trades: ${fwdCont.n} | Compte continu $10k: ${fmtPct(fwdCont.pctReturn)} (pire baisse ${fwdCont.maxDD.toFixed(1)}%)`);
          console.log(`Cycles FTMO 1-Step: ${fwdCycles.passes.length} réussis / ${fwdCycles.busts.length} ratés / ${fwdCycles.inProgress.length} en cours\n`);
        }
      }
    }
  }

  fs.writeFileSync('data/backtest-input/full-history-train-test-forward-2026.md', md.join('\n'));
  console.log('Rapport écrit dans data/backtest-input/full-history-train-test-forward-2026.md');
}

main();
