#!/usr/bin/env node
// runFvgOnlyFtmoRiskAnalysis.js
// Usage: node --max-old-space-size=4096 scripts/runFvgOnlyFtmoRiskAnalysis.js
//
// Esdras (2026-09-22) : "et si on tradait uniquement la meilleure strategie, mais on augmentait le risque sur
// FTMO 1-Step ? train, test, annee 2026, nombre de R, %, drawdown, nombre de cycles en 2026, date de fin de
// challenge". La "meilleure strategie" = FVG (+184 R sur tout l'historique M1 dans engine-m1-vs-m15-reconciliation.md,
// loin devant les autres).
//
// Meme methode que runFtmo1StepFullHistoryTrainTestForward2026.js (vrai LiveStrategyEngine sur tout
// data/real-m1-full reconstruit en M15, reglement M1 exact minute par minute, rejeu dans un vrai GuardrailEngine,
// vrais cycles FTMO 1-Step via buildEffectiveConfig) - mais UN warmUp() PAR variante, parce que retirer des
// mecanismes change le netting (un slot par symbole n'est plus occupe par Divergence/Silver Bullet/...), donc les
// trades FVG ne sont pas un simple sous-ensemble de ceux du combo.
//
// Variantes :
//   A. Combo actuel (reference)
//   B. FVG seul, ses 3 paires configurees (US100, US500, XAUUSD)
//   C. FVG seul sans US500 - retenue SEULEMENT si FVG US500 est <= 0 R net a l'entrainement (< 2025), meme
//      regle que le retrait de GER40 ; sinon affichee comme biaisee (choisie en regardant la periode de test).
//
// Fenetres : entrainement < 2025-01-01 ; test = 2025 ; forward = 2026-01-01 -> derniere bougie.
// BIAIS DECLARE : le choix "FVG" a ete fait sur tout l'historique, test et 2026 compris. Ce n'est donc PAS un
// test hors echantillon propre de la decision "garder seulement FVG" - seule l'entrainement (< 2025) est
// independant de ce choix... et encore, FVG a ete selectionne en partie dessus.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols;
const START = 10000;
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - FIXED_EST_TO_UTC_OFFSET_MS;
const CUT_TEST = eng(2025);
const CUT_FWD = eng(2026);
const RISKS = [0.3, 0.5, 0.75, 1.0, 1.5, 2.0];
const fmtDate = (ms) => new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + ' %';
const sgn = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

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
  const out = []; let cur = null;
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
const m15 = {}; const M1 = {};
for (const s of SYMBOLS) {
  const cs = loadGz(s);
  m15[s] = toM15(cs);
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}

// Same settlement as runEngineM1Backtest.js / runFtmo1StepFullHistoryTrainTestForward2026.js.
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

function buildTrades({ fvgSymbols, fvgOnly, withDivergence = false }) {
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15[s];
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(START, ordered[orderedSymbols[0]][0].time);
  const fvgConfig = Object.fromEntries(Object.entries(CONFIG.fvg.perSymbol).filter(([s]) => fvgSymbols.includes(s)));
  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols,
    fvgConfig,
    // divergenceConfig DEFAULTS to CONFIG.divergence when undefined - must be null explicitly for "FVG only".
    divergenceConfig: fvgOnly && !withDivergence ? null : CONFIG.divergence,
    nwogConfig: fvgOnly ? null : CONFIG.nwog,
    judasSwingConfig: fvgOnly ? null : CONFIG.judasSwing,
    weeklySweepConfig: fvgOnly ? null : CONFIG.weeklySweep,
    breakerBlockConfig: fvgOnly ? null : CONFIG.breakerBlock,
    silverBulletConfig: fvgOnly ? null : CONFIG.silverBullet,
    cbdrConfig: fvgOnly ? null : CONFIG.cbdr,
    guardrail,
    riskPctPerTrade: 0.5,
    spreads: DEFAULT_SPREADS,
  });
  const pending = new Map(); const trades = [];
  engine.warmUp(ordered, {
    completeDivergencePair: true,
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pending.set(signal.symbol, { symbol: signal.symbol, source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pending.get(signal.symbol); pending.delete(signal.symbol);
      if (!open) return;
      const x = settleM1(open);
      if (!x) return;
      trades.push({ symbol: open.symbol, source: open.source, entryTime: open.entryTime, exitTime: x.exitTime, outcome: x.outcome, r: netR(open.direction, open.entryPrice, open.distance, x.exitPrice, open.symbol) });
    },
  });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

// Continuous account through the real bot guardrail (no FTMO reset).
function continuous(trades, risk) {
  const g = new GuardrailEngine({ ...CONFIG.guardrails });
  g.setBalance(START, trades.length ? trades[0].entryTime : 0);
  let bal = START, peak = START, dd = 0, n = 0, rSum = 0, wins = 0; const rs = [];
  for (const t of trades) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const pnl = bal * (risk / 100) * t.r; bal += pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100);
    g.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol });
    n++; rSum += t.r; rs.push(t.r); if (t.r > 0) wins++;
  }
  const mean = n ? rSum / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, rSum, perTrade: mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0, winRate: n ? wins / n * 100 : 0, ret: (bal - START) / START * 100, dd };
}

// Real FTMO 1-Step cycles (reset at +10 % target or trailing end-of-day -10 %, real daily-loss rule).
function ftmo(trades, risk) {
  const eff = buildEffectiveConfig({ id: 'fvg-only-ftmo', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk });
  const cycles = []; let c = null;
  const start = (t) => { const g = new GuardrailEngine({ ...eff.guardrails }); g.setBalance(START, t); c = { startTime: t, endTime: null, outcome: null, trades: 0, bal: START, g }; };
  start(trades.length ? trades[0].entryTime : 0);
  for (const t of trades) {
    if (!c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const pnl = c.bal * (risk / 100) * t.r; c.bal += pnl; c.trades++;
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) {
      c.endTime = t.exitTime; c.outcome = st.targetReached ? 'RÉUSSI' : 'RATÉ'; cycles.push(c); start(t.exitTime);
    }
  }
  if (c.trades > 0) { c.endTime = trades[trades.length - 1].exitTime; c.outcome = `en cours (${pct((c.bal - START) / START * 100)})`; cycles.push(c); }
  return { cycles, pass: cycles.filter((x) => x.outcome === 'RÉUSSI').length, fail: cycles.filter((x) => x.outcome === 'RATÉ').length, open: cycles.filter((x) => x.outcome.startsWith('en cours')).length };
}

function perPairR(trades) {
  const m = {};
  for (const t of trades) { m[t.symbol] ??= { n: 0, r: 0 }; m[t.symbol].n++; m[t.symbol].r += t.r; }
  return m;
}

function main() {
  const fvgSymbols = Object.keys(CONFIG.fvg.perSymbol).filter((s) => SYMBOLS.includes(s));
  console.log('Phase 1 : warmUp() du vrai moteur, une fois par variante...');
  const combo = buildTrades({ fvgSymbols, fvgOnly: false });
  console.log(`  A combo actuel : ${combo.length} trades`);
  const fvgAll = buildTrades({ fvgSymbols, fvgOnly: true });
  console.log(`  B FVG seul (${fvgSymbols.join('/')}) : ${fvgAll.length} trades`);

  const trainFvgPairs = perPairR(fvgAll.filter((t) => t.entryTime < CUT_TEST));
  const us500TrainR = trainFvgPairs.US500?.r ?? 0;
  const cQualifies = us500TrainR <= 0;
  const fvgNoUs500Symbols = fvgSymbols.filter((s) => s !== 'US500');
  const fvgNoUs500 = buildTrades({ fvgSymbols: fvgNoUs500Symbols, fvgOnly: true });
  console.log(`  C FVG seul sans US500 : ${fvgNoUs500.length} trades (FVG US500 à l'entraînement : ${sgn(us500TrainR)} R -> ${cQualifies ? 'retenue par la règle' : 'NON retenue par la règle, affichée comme biaisée'})\n`);

  const fvgPlusDiv = buildTrades({ fvgSymbols: fvgNoUs500Symbols, fvgOnly: true, withDivergence: true });
  console.log(`  D FVG sans US500 + Divergence : ${fvgPlusDiv.length} trades`);
  const variants = [
    ['A. Combo actuel (référence)', combo],
    ['B. FVG seul (US100/US500/XAUUSD)', fvgAll],
    [`C. FVG seul sans US500${cQualifies ? '' : ' ⚠️ biaisée'}`, fvgNoUs500],
    ['D. FVG sans US500 + Divergence', fvgPlusDiv],
  ];
  const windows = [
    ['Entraînement (< 2025)', (t) => t.entryTime < CUT_TEST],
    ['Test (2025)', (t) => t.entryTime >= CUT_TEST && t.entryTime < CUT_FWD],
    ['2026 (1er jan. → fin des données)', (t) => t.entryTime >= CUT_FWD],
  ];

  const md = [];
  md.push('# FVG seul vs combo, avec un risque plus élevé sur FTMO 1-Step — entraînement / test / 2026', '');
  md.push('Vrai `LiveStrategyEngine`, tout `data/real-m1-full` (EURUSD/XAUUSD dès 2022-05, indices dès 2023-01) reconstruit en M15, règlement **M1 exact**, rejeu dans le vrai `GuardrailEngine` (3 trades/jour, pause 30 min, -2 %/jour) ; cycles FTMO 1-Step réels via `buildEffectiveConfig` (+10 %, perte max 10 % trailing fin de journée, perte quotidienne FTMO). Un `warmUp()` par variante (retirer des mécanismes change le netting). Coûts : spread seulement (pas de commission/swap/glissement réel) → niveau absolu surestimé par rapport à la démo.', '');
  md.push('**Limite de méthode (héritée de `runFtmo1StepFullHistoryTrainTestForward2026.js`) :** le P&L de chaque trade est comptabilisé dans l\'ordre des ENTRÉES, pas des sorties ; quand deux trades se chevauchent, une date de fin de cycle peut précéder la date de début affichée (jours négatifs). Effet négligeable sur les totaux, mais les dates de cycle sont approximatives à quelques jours près.', '');
  md.push('**⚠️ Biais de sélection déclaré :** FVG a été désigné « meilleure stratégie » en regardant tout l\'historique, 2025 et 2026 compris. Les colonnes Test et 2026 ne sont donc PAS une validation hors échantillon de la décision « FVG seul ».', '');

  md.push('## FVG par paire à l\'entraînement (< 2025) — base de la règle pour la variante C', '', '| Paire | Trades | R net |', '|---|---|---|');
  for (const [s, v] of Object.entries(trainFvgPairs)) md.push(`| ${s} | ${v.n} | ${sgn(v.r)} |`);
  md.push('', `Règle (même que pour le retrait de GER40) : retirer une paire seulement si son R net d'entraînement est <= 0. FVG US500 : ${sgn(us500TrainR)} R → variante C ${cQualifies ? '**retenue**' : '**non retenue** (affichée à titre indicatif, choisie en regardant 2026)'}.`, '');

  md.push('## Résultats en R (indépendants du risque, rejoués dans le garde-fou du bot)', '', '| Variante | Fenêtre | Trades | Gagnants | R net | R/trade | t |', '|---|---|---|---|---|---|---|');
  for (const [name, trades] of variants) {
    for (const [wName, wf] of windows) {
      const r = continuous(trades.filter(wf), 0.5);
      md.push(`| ${name} | ${wName} | ${r.n} | ${r.winRate.toFixed(0)} % | ${sgn(r.rSum)} | ${sgn(r.perTrade, 3)} | ${r.t.toFixed(2)} |`);
    }
  }
  md.push('');

  for (const risk of RISKS) {
    md.push(`## Risque ${risk} % par trade`, '', '| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |', '|---|---|---|---|---|');
    for (const [name, trades] of variants) {
      for (const [wName, wf] of windows) {
        const w = trades.filter(wf);
        const r = continuous(w, risk); const f = ftmo(w, risk);
        md.push(`| ${name} | ${wName} | ${pct(r.ret)} | ${r.dd.toFixed(1)} % | ${f.pass} / ${f.fail} / ${f.open} |`);
      }
    }
    md.push('');
  }

  md.push('## Détail des cycles FTMO 1-Step en 2026', '');
  for (const [name, trades] of variants) {
    for (const risk of RISKS) {
      const f = ftmo(trades.filter(windows[2][1]), risk);
      md.push(`### ${name} — risque ${risk} %`, '', '| Cycle | Début | Fin | Jours | Trades | Résultat |', '|---|---|---|---|---|---|');
      f.cycles.forEach((c, i) => md.push(`| ${i + 1} | ${fmtDate(c.startTime)} | ${fmtDate(c.endTime)} | ${Math.round((c.endTime - c.startTime) / 86400000)} | ${c.trades} | ${c.outcome} |`));
      md.push('');
    }
  }

  const out = 'data/backtest-input/fvg-only-ftmo-risk-2026.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

main();
