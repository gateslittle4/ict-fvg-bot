#!/usr/bin/env node
// runAdaptiveRiskAndEurusdDrop2026.js
// Usage: node --max-old-space-size=4096 scripts/runAdaptiveRiskAndEurusdDrop2026.js
//
// Esdras (suite directe de runFtmo1StepFullHistoryTrainTestForward2026.js):
// deux questions sur la meme fenetre test/forward (2026-01-01 -> aujourd'hui,
// M1 exact) :
//   1. "si je commence a 0.5% et je descends a 0.25% des que j'atteins -4%
//      de baisse, ca aide?" -> simulateur de risque adaptatif (palier bas
//      tant que le compte reste sous son dernier sommet, retour au risque
//      normal a un nouveau sommet).
//   2. "peux-tu modifier le combo pour l'obtenir, la paire qui ne performe
//      pas" -> EURUSD est la seule paire nette negative en M1 exact sur les
//      ~4 ans (voir engine-m1-vs-m15-reconciliation.md, -13 R sur 5 paires ;
//      confirme ici sur les 4 paires en prod). Meme discipline que le
//      retrait de GER40 : lue sur l'ENTRAINEMENT (< 2026) d'abord, retenue
//      seulement si son R net y est <= 0, puis le test est lu UNE fois.
// Reutilise exactement la meme liste canonique de trades (meme warmUp, meme
// reglement M1 exact) que le script precedent.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols; // US100, US500, XAUUSD, EURUSD (GER40 deja retire)
const STARTING_BALANCE = 10000;
const CUT = Date.UTC(2026, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
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
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  if (cur) out.push(cur);
  return out;
}
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => { const g = (dir === 'bullish' ? exit - entry : entry - exit) / d; const s = DEFAULT_SPREADS[sym] ?? 0; return g - (s > 0 ? s / d : 0); };

console.log('Chargement M1 réel + reconstruction M15...');
const m1Bars = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of SYMBOLS) {
  const cs = m1Bars[s];
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}
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

function runPhase1() {
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15[s];
  const warmupGuardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  warmupGuardrail.setBalance(STARTING_BALANCE, ordered[orderedSymbols[0]][0].time);
  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: warmupGuardrail, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS,
  });
  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, { symbol: signal.symbol, source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      const m1exit = settleM1(open);
      if (!m1exit) return;
      trades.push({ symbol: open.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime, m1: { netR: netR(open.direction, open.entryPrice, open.distance, m1exit.exitPrice, open.symbol), exitTime: m1exit.exitTime } });
    },
  });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

console.log('Phase 1 : un seul warmUp() du vrai moteur, réglé en M1 exact...');
const allTrades = runPhase1();
const trainTrades = allTrades.filter((t) => t.entryTime < CUT);
const forwardTrades = allTrades.filter((t) => t.entryTime >= CUT);
console.log(`Trades: ${allTrades.length} (entraînement ${trainTrades.length}, test/forward ${forwardTrades.length})\n`);

// --- 1) Par paire : ENTRAÎNEMENT d'abord (décision), test lu une fois ensuite ---
const sumR = (l) => l.reduce((a, t) => a + t.m1.netR, 0);
console.log('=== R net par paire, M1 exact ===');
console.log('| Paire | Entraînement (< 2026) | Test/forward (2026-01-01 → fin) |');
for (const s of SYMBOLS) {
  const tr = trainTrades.filter((t) => t.symbol === s);
  const fw = forwardTrades.filter((t) => t.symbol === s);
  console.log(`| ${s} | ${fmt(sumR(tr))} R (${tr.length}) | ${fmt(sumR(fw))} R (${fw.length}) |`);
}
const eurusdTrainR = sumR(trainTrades.filter((t) => t.symbol === 'EURUSD'));
const us500TrainR = sumR(trainTrades.filter((t) => t.symbol === 'US500'));
console.log(`\nEURUSD entraînement: ${fmt(eurusdTrainR)} R -> ${eurusdTrainR <= 0 ? 'retenue pour lecture du test' : 'NON retenue (Esdras visait EURUSD, mais elle est légèrement POSITIVE à l\'entraînement — protocole refuse de la retirer)'}`);
console.log(`US500 entraînement: ${fmt(us500TrainR)} R -> ${us500TrainR <= 0 ? 'retenue pour lecture du test (c\'est la vraie paire négative ici, pas EURUSD)' : 'NON retenue'}\n`);
const dropSymbol = us500TrainR <= 0 ? 'US500' : eurusdTrainR <= 0 ? 'EURUSD' : null;

// --- 2) Simulateurs : risque fixe vs risque adaptatif (0.5% -> 0.25% des que la baisse depuis le sommet atteint 4%, retour a 0.5% a un nouveau sommet) ---
function runFixed(trades, risk) {
  const g = new GuardrailEngine({ ...CONFIG.guardrails }); g.setBalance(STARTING_BALANCE, trades.length ? trades[0].entryTime : Date.now());
  let bal = STARTING_BALANCE, peak = STARTING_BALANCE, dd = 0, vetoed = 0, n = 0;
  for (const t of trades) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const pnl = bal * (risk / 100) * t.m1.netR; bal += pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100);
    g.recordTrade({ pnl, time: t.m1.exitTime, balanceAfter: bal, symbol: t.symbol }); n++;
  }
  return { bal, ret: (bal - STARTING_BALANCE) / STARTING_BALANCE * 100, dd, vetoed, n };
}
function runAdaptive(trades, { highRisk, lowRisk, ddTrigger }) {
  const g = new GuardrailEngine({ ...CONFIG.guardrails }); g.setBalance(STARTING_BALANCE, trades.length ? trades[0].entryTime : Date.now());
  let bal = STARTING_BALANCE, peak = STARTING_BALANCE, dd = 0, vetoed = 0, n = 0, switches = 0;
  let mode = 'high';
  for (const t of trades) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const currentDD = (peak - bal) / peak * 100;
    const wantMode = currentDD >= ddTrigger ? 'low' : 'high';
    if (wantMode !== mode) switches++;
    mode = wantMode;
    const risk = mode === 'low' ? lowRisk : highRisk;
    const pnl = bal * (risk / 100) * t.m1.netR; bal += pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100);
    g.recordTrade({ pnl, time: t.m1.exitTime, balanceAfter: bal, symbol: t.symbol }); n++;
  }
  return { bal, ret: (bal - STARTING_BALANCE) / STARTING_BALANCE * 100, dd, vetoed, n, switches };
}
function runFtmoCycles(trades, riskFn) {
  const effective = buildEffectiveConfig({ id: 'ftmo-adaptive-2026', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 });
  const cycles = []; let cycle = null;
  function start(t0) { const g = new GuardrailEngine({ ...effective.guardrails }); g.setBalance(STARTING_BALANCE, t0); cycle = { n: cycles.length + 1, startTime: t0, endTime: null, outcome: 'en cours', trades: 0, balance: STARTING_BALANCE, peak: STARTING_BALANCE, guardrail: g }; }
  start(trades.length ? trades[0].entryTime : Date.now());
  for (const t of trades) {
    if (!cycle.guardrail.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const risk = riskFn(cycle);
    const pnl = cycle.balance * (risk / 100) * t.m1.netR;
    cycle.balance += pnl; cycle.peak = Math.max(cycle.peak, cycle.balance); cycle.trades++;
    cycle.guardrail.recordTrade({ pnl, time: t.m1.exitTime, balanceAfter: cycle.balance, symbol: t.symbol });
    const status = cycle.guardrail.getStatus(t.m1.exitTime, t.symbol);
    if (status.targetReached || status.overallDrawdownBreached) {
      cycle.endTime = t.m1.exitTime; cycle.outcome = status.targetReached ? 'RÉUSSI' : 'RATÉ';
      cycles.push(cycle); start(t.m1.exitTime);
    }
  }
  if (cycle.trades > 0 || cycles.length === 0) { cycle.endTime = trades.length ? trades[trades.length - 1].m1.exitTime : Date.now(); cycle.outcome = `en cours (${fmtPct((cycle.balance - STARTING_BALANCE) / STARTING_BALANCE * 100)})`; cycles.push(cycle); }
  return { passes: cycles.filter((c) => c.outcome === 'RÉUSSI').length, busts: cycles.filter((c) => c.outcome === 'RATÉ').length, inProgress: cycles.filter((c) => c.outcome.startsWith('en cours')).length, cycles };
}
const adaptiveRiskFn = (highRisk, lowRisk, ddTrigger) => (cycle) => {
  const currentDD = (cycle.peak - cycle.balance) / cycle.peak * 100;
  return currentDD >= ddTrigger ? lowRisk : highRisk;
};

const md = [];
md.push('# Risque adaptatif (0,5 % -> 0,25 % à -4 % de baisse) et retrait d\'EURUSD — fenêtre test/forward 2026-01-01 → aujourd\'hui, M1 exact', '');
md.push('Question d\'Esdras : (1) un risque adaptatif (commencer à 0,5 %, redescendre à 0,25 % dès -4 % de baisse depuis le dernier sommet, remonter à 0,5 % au sommet suivant) aide-t-il ? (2) retirer la paire qui ne performe pas (EURUSD, seule paire nette négative en M1 exact) améliore-t-il le résultat ? Même liste canonique de trades que le rapport précédent (un seul `warmUp()` réel, réglement M1 exact). EURUSD lue sur l\'entraînement (< 2026) d\'abord (règle : retenue seulement si son R net y est ≤ 0), test lu une seule fois ensuite — même discipline que le retrait de GER40.', '');
md.push(`**EURUSD, R net entraînement (< 2026-01-01) : ${fmt(eurusdTrainR)} R → ${eurusdTrainR <= 0 ? 'retenue pour lecture du test' : 'NON retenue (légèrement positive, le protocole refuse de la retirer — Esdras visait EURUSD par erreur, la vraie paire négative ici est US500)'}.**`, '');
md.push(`**US500, R net entraînement (< 2026-01-01) : ${fmt(us500TrainR)} R → ${us500TrainR <= 0 ? 'retenue pour lecture du test' : 'NON retenue'}.**`, '');

if (dropSymbol) {
  const variants = [['Combo actuel (4 paires)', allTrades, forwardTrades], [`Sans ${dropSymbol} (3 paires)`, allTrades.filter((t) => t.symbol !== dropSymbol), forwardTrades.filter((t) => t.symbol !== dropSymbol)]];
  md.push('## Risque fixe : combo actuel vs sans EURUSD', '', '| Combo | Risque | Compte $10k | Pire baisse | FTMO (réussis/ratés/en cours) |', '|---|---|---|---|---|');
  for (const [name, , fw] of variants) {
    for (const risk of [0.25, 0.3, 0.5]) {
      const a = runFixed(fw, risk);
      const f = runFtmoCycles(fw, () => risk);
      md.push(`| ${name} | ${risk}% | ${fmtPct(a.ret)} | ${a.dd.toFixed(1)}% | ${f.passes}/${f.busts}/${f.inProgress} |`);
    }
  }
  md.push('', '## Risque adaptatif (haut 0,5 % / bas 0,25 % / déclenchement à -4 % de baisse)', '', '| Combo | Compte $10k | Pire baisse | Bascules haut↔bas | FTMO (réussis/ratés/en cours) |', '|---|---|---|---|---|');
  for (const [name, , fw] of variants) {
    const a = runAdaptive(fw, { highRisk: 0.5, lowRisk: 0.25, ddTrigger: 4 });
    const f = runFtmoCycles(fw, adaptiveRiskFn(0.5, 0.25, 4));
    md.push(`| ${name} | ${fmtPct(a.ret)} | ${a.dd.toFixed(1)}% | ${a.switches} | ${f.passes}/${f.busts}/${f.inProgress} |`);
    console.log(`${name} — adaptatif 0.5→0.25 à -4%: ${fmtPct(a.ret)}, pire baisse ${a.dd.toFixed(1)}%, ${a.switches} bascules, FTMO ${f.passes}/${f.busts}/${f.inProgress}`);
  }
  md.push('', '### Comparaison directe : 0,5 % fixe vs adaptatif (combo actuel)', '');
  const fixed05 = runFixed(forwardTrades, 0.5);
  const adapt = runAdaptive(forwardTrades, { highRisk: 0.5, lowRisk: 0.25, ddTrigger: 4 });
  md.push(`- 0,5 % fixe : ${fmtPct(fixed05.ret)}, pire baisse ${fixed05.dd.toFixed(1)}%`);
  md.push(`- Adaptatif 0,5→0,25 à -4% : ${fmtPct(adapt.ret)}, pire baisse ${adapt.dd.toFixed(1)}%, ${adapt.switches} bascules`);
}
md.push('', '## Limites', '', '- Même limites que le rapport précédent (coûts partiels, garde-fous réels mais pas de correctif de géométrie d\'ordre).', '- Le risque adaptatif est simulé au niveau du compte (bascule instantanée) : en réel, il faudrait surveiller la baisse et changer `RISK_PCT_PER_TRADE`/le réglage dashboard à la main (pas automatisé dans le bot aujourd\'hui).', '- EURUSD retirée seulement si le protocole ci-dessus le permet (voir la ligne en gras) : jamais adoptée sur un seul test, à confirmer en démo.');
fs.writeFileSync('data/backtest-input/adaptive-risk-eurusd-drop-2026.md', md.join('\n'));
console.log('\nRapport écrit dans data/backtest-input/adaptive-risk-eurusd-drop-2026.md');
