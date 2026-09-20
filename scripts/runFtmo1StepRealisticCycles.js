#!/usr/bin/env node
// runFtmo1StepRealisticCycles.js
// Usage: node scripts/runFtmo1StepRealisticCycles.js
//
// Esdras (2026-09-19): "fais le test avec les vrais regles ftmo 1 step pour voir si j'aurais passe le challenge
// avec ces nouvelles donnees, et regarde aussi s'il y a des cycles de 10%".
//
// The trades come from the SAME machinery as runComboVsPyramidAccountImpact.js: LiveStrategyEngine.warmUp() on the
// real broker candles (shifted to engine time, -5 h), the 8 live mechanisms, the real guardrails and the bot's own
// viability filter (stop >= 3x spread). What is different, on purpose, is how a trade is SETTLED, because that
// script (and the older cycle scripts) skip the candle a trade opens on: a trade entered at that candle's open whose
// own candle already touches the stop is a loss in real life, but was counted as a win when the target came later
// (28 of 347 trades, all of them +3R winners; see HANDOFF.md 2026-09-19). Three conventions are run side by side:
//   - "script"    : the old convention (entry candle skipped) - reproduces the earlier numbers;
//   - "prudent"   : any stop touched in the entry candle is a loss (stop wins ties, the project's rule);
//   - "mi-chemin" : only trades entered exactly AT the candle open are corrected (certain); limit entries (FVG,
//                   where the order of fill and stop inside the candle is unknown) keep the script's outcome.
//
// FTMO 1-Step rules used: +10 % target, 3 % daily loss, 10 % trailing (end of day) max loss - the project's own
// GuardrailEngine with src/propFirms/ftmo.js. Each attempt starts at 10 000 $; an attempt ends when the target is
// reached (PASS) or a limit is breached (FAIL), then a new attempt starts with the next trade. Per-attempt P&L is
// recomputed from each trade's net R at 0.5 % risk of the attempt's own balance (the trade list itself was selected
// on one continuous 7-month run - an approximation, said plainly in the report).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const START = 10000;
const RISK = 0.5;
const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';
const SYMBOLS = ['US500', 'US100', 'XAUUSD', 'EURUSD', 'GER40'];

const toEngine = (cs) => cs.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
function merge(a, b) { const m = new Map(); for (const c of a) m.set(c.time, c); for (const c of b) m.set(c.time, c); return [...m.values()].sort((x, y) => x.time - y.time); }
const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(0)}`;
const day = (t) => new Date(t).toISOString().slice(0, 10);

const candles = {};
for (const s of SYMBOLS) candles[s] = toEngine(merge(loadCandlesFromCsv(path.join(DIR_A, `${s}.csv`)).candles, loadCandlesFromCsv(path.join(DIR_B, `${s}.csv`)).candles));
const byTime = Object.fromEntries(SYMBOLS.map((s) => [s, new Map(candles[s].map((c) => [c.time, c]))]));
const globalStart = Math.min(...SYMBOLS.map((s) => candles[s][0].time));
const globalEnd = Math.max(...SYMBOLS.map((s) => candles[s][candles[s].length - 1].time));

// 1) the trades, exactly as the live engine would take them (no target cap, so the list is not truncated by a pass)
const effective = buildEffectiveConfig({ id: 'ftmo-realistic', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: RISK });
const guard = new GuardrailEngine({ ...effective.guardrails, targetPct: null });
guard.setBalance(START, globalStart);
const engine = new LiveStrategyEngine({
  symbols: SYMBOLS, fvgConfig: effective.fvg.perSymbol, divergenceConfig: effective.divergence, nwogConfig: effective.nwog,
  judasSwingConfig: effective.judasSwing, weeklySweepConfig: effective.weeklySweep, breakerBlockConfig: effective.breakerBlock,
  silverBulletConfig: effective.silverBullet, cbdrConfig: effective.cbdr, pyramidConfig: null, guardrail: guard, riskPctPerTrade: RISK, spreads: DEFAULT_SPREADS,
});
engine.setBalance(START);
let balance = START;
const pending = new Map();
const trades = [];
engine.warmUp(candles, {
  onEvent: (signal, candle) => {
    if (signal.type === 'validated' && !signal.blockedReason) {
      pending.set(signal.symbol, { source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, riskAmount: signal.riskAmount, entryTime: candle.time });
      return;
    }
    if (signal.type !== 'closed') return;
    const open = pending.get(signal.symbol); pending.delete(signal.symbol);
    if (!open) return;
    const exitPrice = signal.outcome === "win" ? open.targetPrice : signal.outcome === 'loss' ? open.stopPrice : candle.close;
    const bull = open.direction === 'bullish';
    const gross = ((bull ? exitPrice - open.entryPrice : open.entryPrice - exitPrice) / open.distance);
    const cost = (DEFAULT_SPREADS[signal.symbol] ?? 0) / open.distance;
    const pnl = open.riskAmount * (gross - cost);
    balance += pnl; engine.setBalance(balance);
    guard.recordTrade({ pnl, time: signal.exitTime, balanceAfter: balance, symbol: signal.symbol });
    trades.push({ symbol: signal.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime, exitTime: signal.exitTime, entryPrice: open.entryPrice, stopPrice: open.stopPrice, distance: open.distance, outcome: signal.outcome, netR: gross - cost, cost });
  },
});
console.error(`engine trades: ${trades.length}, continuous balance ${money(balance)}`);

// 2) the three settlement conventions
function convention(kind) {
  return trades.map((t) => {
    if (kind === 'script' || t.outcome === 'loss') return { ...t };
    const c = byTime[t.symbol].get(t.entryTime);
    if (!c) return { ...t };
    const bull = t.direction === 'bullish';
    const stopTouched = bull ? c.low <= t.stopPrice : c.high >= t.stopPrice;
    const atOpen = Math.abs(t.entryPrice - c.open) <= 1e-9 * Math.max(1, Math.abs(c.open));
    if (stopTouched && (kind === 'prudent' || atOpen)) return { ...t, outcome: 'loss', netR: -1 - t.cost, exitTime: t.entryTime, corrected: true };
    return { ...t };
  }).sort((a, b) => a.exitTime - b.exitTime);
}

// 3) FTMO 1-Step attempts
function cycles(list) {
  const attempts = [];
  let g = null, bal = START, cur = null;
  const begin = (t) => { g = new GuardrailEngine({ ...effective.guardrails, targetPct: 10 }); bal = START; g.setBalance(START, t.exitTime); cur = { from: t.exitTime, trades: 0, peak: START, low: START }; };
  for (const t of list) {
    if (!g) begin(t);
    const pnl = bal * (RISK / 100) * t.netR;
    bal += pnl; cur.trades++; cur.peak = Math.max(cur.peak, bal); cur.low = Math.min(cur.low, bal);
    g.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol });
    const st = g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached) { attempts.push({ ...cur, to: t.exitTime, result: 'PASS', end: bal }); g = null; }
    else if (st.overallDrawdownBreached) { attempts.push({ ...cur, to: t.exitTime, result: 'FAIL (perte max 10 %)', end: bal }); g = null; }
  }
  if (g) attempts.push({ ...cur, to: list[list.length - 1].exitTime, result: 'EN COURS', end: bal });
  return attempts;
}

const md = [];
md.push('# FTMO 1-Step sur les 7 mois réels — cycles de +10 %, trois conventions de règlement', '');
md.push(`Données : vraies bougies du broker ${day(globalStart)} → ${day(globalEnd)} (décalées en temps moteur), 8 mécanismes du bot, garde-fous réels, filtre « stop ≥ 3× le spread », risque ${RISK} %/trade, ${START} $ par tentative. Règles FTMO 1-Step : cible +10 %, perte quotidienne 3 %, perte max 10 % trailing (fin de journée).`, '');
for (const kind of ['script', 'mi-chemin', 'prudent']) {
  const list = convention(kind);
  const att = cycles(list);
  const passes = att.filter((a) => a.result === 'PASS').length;
  const fails = att.filter((a) => a.result.startsWith('FAIL')).length;
  const corrected = list.filter((t) => t.corrected).length;
  const wins = list.filter((t) => t.netR > 0).length;
  const sumR = list.reduce((s, t) => s + t.netR, 0);
  md.push(`## Convention « ${kind} »`, '');
  md.push(`- ${list.length} trades${corrected ? ` (${corrected} gagnants du script corrigés en pertes)` : ''}, ${wins} gagnants, R net total ${sumR.toFixed(1)}`);
  md.push(`- **${passes} défi(s) réussi(s) (+10 %), ${fails} échec(s)**, ${att.length - passes - fails} tentative en cours`, '');
  md.push('| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |', '|---|---|---|---|---|---|---|');
  att.forEach((a, i) => md.push(`| ${i + 1} | ${day(a.from)} | ${day(a.to)} | ${a.trades} | ${a.result} | ${money(a.end)} | ${money(a.peak)} / ${money(a.low)} |`));
  md.push('');
  console.error(`[${kind}] trades=${list.length} passes=${passes} fails=${fails} enCours=${att.length - passes - fails}`);
  for (const a of att) console.error(`   ${day(a.from)} -> ${day(a.to)}  ${a.result}  ${money(a.end)}  (${a.trades} trades, haut ${money(a.peak)}, bas ${money(a.low)})`);
}
md.push('## Limites', '', '- La liste de trades vient d\'une seule course continue (les garde-fous ont vu ce solde-là) ; chaque tentative recalcule seulement le P&L en R net à 0,5 % de SON solde.', '- Le spread élargi autour de 17 h NY, le glissement et les rejets d\'ordre ne sont pas modélisés.', '- 7 mois = un échantillon, pas une garantie statistique.');
const out = path.join(DIR_A, 'ftmo-1step-realistic-cycles.md');
fs.writeFileSync(out, md.join('\n'));
console.error(`Wrote ${out}`);
