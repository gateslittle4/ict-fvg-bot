#!/usr/bin/env node
// runCandidates2026Analysis.js
// Usage: node --max-old-space-size=4096 scripts/runCandidates2026Analysis.js
//
// Esdras (2026-09-22) : pour l'année 2026 et seulement les candidates les plus prometteuses analysées avec lui -
// nombre de cycles de +10 %, challenges gagnés/perdus, win rate, meilleur RRR, dates de passage/perte, meilleur % par
// trade, comparaison avec le combo actuel, puis une recommandation.
//
// Variantes :
//   A. Combo actuel (référence, config de production).
//   C. FVG seul sur US100 + XAUUSD (retrait de FVG US500 décidé sur l'entraînement - voir fvg-only-real-costs-check.md).
//      RRR testé 2 à 7 par paire ; le RRR retenu est choisi sur l'ENTRAÎNEMENT (< 2025) seul, 2026 est ensuite lu tel quel
//      pour tous les RRR (pour voir si 2026 confirme le choix, sans le faire à partir de 2026).
//   R. RSI(2) journalier US500 (règles pré-enregistrées du lot 3, rejouées par la vraie classe DailyAlertEngine du bot,
//      sans aucun réglage ; pas de cible fixe -> RRR réalisé = gain moyen / perte moyenne).
//   C+R. Les deux ensemble (pas le même instrument : aucun conflit de position ; même garde-fou partagé, comme en production).
//
// Même base que runFvgOnlyRealCostsCheck.js : vrai LiveStrategyEngine sur data/real-m1-full reconstruit en M15, règlement
// M1 exact, spread + swap réel du broker (relevé du 2026-09-22). RSI(2) : spread 2x le défaut (comme pré-enregistré).
// FTMO 1-Step simulé PAR ÉVÉNEMENTS (entrée à son heure, P&L à la SORTIE) : dates de passage/perte exactes, pas
// comptabilisées à l'entrée comme dans les scripts précédents. Un trade encore ouvert quand un cycle se termine est
// abandonné (en réalité on fermerait tout au passage de l'objectif).
// Limites : la perte quotidienne FTMO est calculée sur le P&L clôturé (pas l'équité flottante) ; pas de commission
// (≈ 0 sur les trades réels) ni de glissement réel ; taux de swap d'aujourd'hui appliqués au passé.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { DailyAlertEngine } from '../src/dailyAlertEngine.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols;
const START = 10000;
const DAY = 86400000;
const OFF = FIXED_EST_TO_UTC_OFFSET_MS;
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - OFF;
const CUT_TEST = eng(2025);
const CUT_FWD = eng(2026);
const RISKS = [0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const RRS = [2, 3, 4, 5, 6, 7];
const day = (ms) => new Date(ms + OFF).toISOString().slice(0, 10);
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + ' %';
const sgn = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

const SWAP = {
  US100: { long: -43.7, short: 18.4, pip: 0.1, triple: 5 },
  US500: { long: -11, short: 4.4, pip: 0.1, triple: 5 },
  XAUUSD: { long: -63.88, short: 39.45, pip: 0.01, triple: 3 },
  EURUSD: { long: -0.65, short: 0.28, pip: 0.0001, triple: 3 },
};
const ROLLOVER_ENGINE_MS = (21 - OFF / 3600000) * 3600000;
function swapR(symbol, direction, distance, fillTime, exitTime) {
  const sw = SWAP[symbol];
  if (!sw || !(distance > 0)) return 0;
  const perDay = (direction === 'bullish' ? sw.long : sw.short) * sw.pip;
  let nights = 0;
  let tau = Math.floor(fillTime / DAY) * DAY + ROLLOVER_ENGINE_MS;
  if (tau <= fillTime) tau += DAY;
  for (; tau <= exitTime; tau += DAY) {
    const dow = new Date(tau + OFF).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    nights += dow === sw.triple ? 3 : 1;
  }
  return (nights * perDay) / distance;
}

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    out.push({ time: +p[0] - OFF, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 });
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

console.log('Chargement M1 réel + reconstruction M15...');
const m15 = {}; const M1 = {};
for (const s of SYMBOLS) {
  const cs = loadGz(s);
  m15[s] = toM15(cs);
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
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], fillTime: S.t[fill] };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], fillTime: S.t[fill] };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], fillTime: S.t[fill] };
}

const NONE = { fvgConfig: {}, divergenceConfig: null, nwogConfig: null, judasSwingConfig: null, weeklySweepConfig: null, breakerBlockConfig: null, silverBulletConfig: null, cbdrConfig: null };

function engineTrades(configs) {
  const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = m15[s];
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(START, ordered[orderedSymbols[0]][0].time);
  const engine = new LiveStrategyEngine({ symbols: orderedSymbols, ...NONE, ...configs, guardrail, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
  const pending = new Map(); const trades = [];
  engine.warmUp(ordered, {
    completeDivergencePair: true,
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pending.set(signal.symbol, { symbol: signal.symbol, source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const o = pending.get(signal.symbol); pending.delete(signal.symbol);
      if (!o) return;
      const x = settleM1(o);
      if (!x) return;
      const gross = (o.direction === 'bullish' ? x.exitPrice - o.entryPrice : o.entryPrice - x.exitPrice) / o.distance;
      const spread = DEFAULT_SPREADS[o.symbol] ?? 0;
      const r = gross - (spread > 0 ? spread / o.distance : 0) + swapR(o.symbol, o.direction, o.distance, x.fillTime, x.exitTime);
      trades.push({ symbol: o.symbol, source: o.source, entryTime: o.entryTime, exitTime: x.exitTime, r });
    },
  });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

// RSI(2) journalier US500 : la vraie classe du bot, alimentée bougie M15 par bougie M15.
function rsi2Trades() {
  const eng2 = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  const S = M1.US500; const spread2 = 2 * (DEFAULT_SPREADS.US500 ?? 0);
  const trades = []; let open = null;
  for (const c of m15.US500) {
    for (const e of eng2.ingest(c)) {
      if (e.event === 'entry') { open = e; continue; }
      if (e.event !== 'exit' || !open) continue;
      let exitTime = e.barTime;
      if (e.detail === 'stop') { // l'heure exacte du stop dans la journée, à la minute
        const a = lower(S.t, S.n, e.barTime), b = Math.min(S.n, lower(S.t, S.n, e.barTime + DAY));
        for (let i = a; i < b; i++) if (S.l[i] <= open.stopPrice) { exitTime = S.t[i]; break; }
      }
      const distance = open.price - open.stopPrice;
      const r = e.rMultiple - spread2 / distance + swapR('US500', 'bullish', distance, open.barTime, exitTime);
      trades.push({ symbol: 'US500', source: 'rsi2', entryTime: open.barTime, exitTime, r, exitReason: e.detail });
      open = null;
    }
  }
  return trades;
}

// Compte par événements : entrée à son heure (garde-fou consulté), P&L appliqué à la SORTIE.
function simulate(trades, risk, { ftmo }) {
  const evs = [];
  trades.forEach((t, i) => { evs.push({ time: t.entryTime, kind: 1, i }); evs.push({ time: t.exitTime, kind: 0, i }); });
  evs.sort((a, b) => a.time - b.time || a.kind - b.kind);
  const guard = ftmo ? buildEffectiveConfig({ id: 'cand-2026', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk }).guardrails : CONFIG.guardrails;
  const cycles = []; let c = null;
  const startCycle = (t) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, t); c = { start: t, end: null, outcome: null, bal: START, peak: START, dd: 0, g, open: new Map(), taken: [] }; };
  startCycle(evs.length ? evs[0].time : 0);
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.kind === 1) {
      if (t.entryTime < c.start) continue;
      if (!c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
      c.open.set(ev.i, c.bal * (risk / 100));
      continue;
    }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * t.r; c.open.delete(ev.i);
    c.bal += pnl; c.peak = Math.max(c.peak, c.bal); c.dd = Math.max(c.dd, (c.peak - c.bal) / c.peak * 100);
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    c.taken.push(t);
    if (!ftmo) continue;
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) {
      c.end = t.exitTime; c.outcome = st.targetReached ? 'RÉUSSI' : 'RATÉ'; cycles.push(c); startCycle(t.exitTime);
    }
  }
  if (c.taken.length > 0 || cycles.length === 0) { c.end = trades.length ? Math.max(...trades.map((t) => t.exitTime)) : c.start; c.outcome = `en cours (${pct((c.bal - START) / START * 100)})`; cycles.push(c); }
  const taken = cycles.flatMap((x) => x.taken);
  const n = taken.length; const sum = taken.reduce((a, t) => a + t.r, 0); const mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(taken.reduce((a, t) => a + (t.r - mean) ** 2, 0) / (n - 1)) : 0;
  const wins = taken.filter((t) => t.r > 0); const losses = taken.filter((t) => t.r <= 0);
  return {
    cycles, n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
    winRate: n ? wins.length / n * 100 : 0,
    payoff: wins.length && losses.length ? (wins.reduce((a, t) => a + t.r, 0) / wins.length) / Math.abs(losses.reduce((a, t) => a + t.r, 0) / losses.length) : 0,
    ret: (cycles[0].bal - START) / START * 100, dd: Math.max(...cycles.map((x) => x.dd)),
    pass: cycles.filter((x) => x.outcome === 'RÉUSSI').length, fail: cycles.filter((x) => x.outcome === 'RATÉ').length,
  };
}

function main() {
  const windows = [
    ['Entraînement (< 2025)', (t) => t.entryTime < CUT_TEST],
    ['2025', (t) => t.entryTime >= CUT_TEST && t.entryTime < CUT_FWD],
    ['2026', (t) => t.entryTime >= CUT_FWD],
  ];
  const [, inTrain] = windows[0]; const [, in2025] = windows[1]; const [, in2026] = windows[2];
  const md = ['# Candidates 2026 : FVG US100+XAUUSD, RSI(2) US500, les deux ensemble, contre le combo actuel', ''];
  md.push('Vrai `LiveStrategyEngine` (FVG, combo) et vraie classe `DailyAlertEngine` (RSI(2)) sur `data/real-m1-full` reconstruit en M15, règlement M1 exact, spread + **swap réel du broker** (relevé du 2026-09-22). FTMO 1-Step réel (`buildEffectiveConfig` : +10 %, perte max 10 % trailing fin de journée, perte quotidienne), simulé **par événements** (P&L à la sortie : dates exactes). Garde-fou du bot (3 trades/jour, pause 30 min) partagé entre toutes les stratégies d\'une variante. Limites : perte quotidienne sur P&L clôturé (pas l\'équité flottante), pas de commission (≈ 0 sur les trades réels) ni de glissement réel, taux de swap d\'aujourd\'hui appliqués au passé, 2026 = 1er janvier → 18 septembre.', '');

  // --- RRR de FVG, choisi sur l'entraînement
  console.log('FVG US100 + XAUUSD : un warmUp par RRR...');
  const byRR = {};
  for (const rr of RRS) {
    const cfg = {};
    for (const s of ['US100', 'XAUUSD']) cfg[s] = { ...CONFIG.fvg.perSymbol[s], rrMultiple: rr };
    byRR[rr] = engineTrades({ fvgConfig: cfg });
    console.log(`  1:${rr} -> ${byRR[rr].length} trades`);
  }
  md.push('## 1. Meilleur RRR pour FVG (choisi sur l\'entraînement, 2026 lu ensuite)', '', 'Par paire, trades isolés (sans garde-fou), R net avec spread + swap. Le netting est par paire, donc le RRR d\'une paire ne change pas les trades de l\'autre.', '');
  md.push('| Paire | RRR | Trades entr. | Gagnants entr. | R net entraînement | R net 2025 | R net 2026 | R/trade 2026 |', '|---|---|---|---|---|---|---|---|');
  const chosen = {};
  for (const s of ['US100', 'XAUUSD']) {
    let best = null;
    for (const rr of RRS) {
      const l = byRR[rr].filter((t) => t.symbol === s);
      const tr = l.filter(inTrain), a25 = l.filter(in2025), a26 = l.filter(in2026);
      const sum = (x) => x.reduce((a, t) => a + t.r, 0);
      if (!best || sum(tr) > best.r) best = { rr, r: sum(tr) };
      md.push(`| ${s} | 1:${rr}${rr === CONFIG.fvg.perSymbol[s].rrMultiple ? ' (actuel)' : ''} | ${tr.length} | ${tr.length ? (tr.filter((t) => t.r > 0).length / tr.length * 100).toFixed(0) : 0} % | ${sgn(sum(tr))} | ${sgn(sum(a25))} | ${sgn(sum(a26))} | ${a26.length ? sgn(sum(a26) / a26.length, 3) : '—'} |`);
    }
    chosen[s] = best.rr;
  }
  md.push('', `**RRR retenu sur l'entraînement : US100 1:${chosen.US100}, XAUUSD 1:${chosen.XAUUSD}** (actuellement 1:${CONFIG.fvg.perSymbol.US100.rrMultiple} et 1:${CONFIG.fvg.perSymbol.XAUUSD.rrMultiple}).`, '');

  const fvgC = [...byRR[chosen.US100].filter((t) => t.symbol === 'US100'), ...byRR[chosen.XAUUSD].filter((t) => t.symbol === 'XAUUSD')].sort((a, b) => a.entryTime - b.entryTime);
  console.log('Combo actuel...');
  const combo = engineTrades({ fvgConfig: Object.fromEntries(Object.entries(CONFIG.fvg.perSymbol).filter(([s]) => SYMBOLS.includes(s))), divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr });
  console.log('RSI(2) US500...');
  const rsi2 = rsi2Trades();
  const both = [...fvgC, ...rsi2].sort((a, b) => a.entryTime - b.entryTime);
  const cur = { US100: CONFIG.fvg.perSymbol.US100.rrMultiple, XAUUSD: CONFIG.fvg.perSymbol.XAUUSD.rrMultiple };
  const fvgC0 = [...byRR[cur.US100].filter((t) => t.symbol === 'US100'), ...byRR[cur.XAUUSD].filter((t) => t.symbol === 'XAUUSD')].sort((a, b) => a.entryTime - b.entryTime);
  const variants = [
    ['A. Combo actuel', combo],
    [`C0. FVG US100 (1:${cur.US100}) + XAUUSD (1:${cur.XAUUSD}) — RRR actuels`, fvgC0],
    [`C. FVG US100 (1:${chosen.US100}) + XAUUSD (1:${chosen.XAUUSD})`, fvgC],
    ['R. RSI(2) US500 journalier', rsi2],
    ['C+R. FVG + RSI(2)', both],
  ];

  // --- 2026 : statistiques de trades
  md.push('## 2. 2026 — trades (garde-fou du bot, compte continu)', '', '| Variante | Trades | Win rate | RRR réalisé (gain moy. / perte moy.) | R net | R/trade | t |', '|---|---|---|---|---|---|---|');
  for (const [name, trades] of variants) {
    const s = simulate(trades.filter(in2026), 0.5, { ftmo: false });
    md.push(`| ${name} | ${s.n} | ${s.winRate.toFixed(0)} % | ${s.payoff > 0 ? s.payoff.toFixed(2) : '— (aucune perte)'} | ${sgn(s.sum)} | ${sgn(s.mean, 3)} | ${s.t.toFixed(2)} |`);
  }
  md.push('', '### Part de chaque paire dans FVG (variante C, 2026, trades isolés)', '', '| Paire | Trades | Win rate | R net |', '|---|---|---|---|');
  for (const sym of ['US100', 'XAUUSD']) {
    const l = fvgC.filter((t) => t.symbol === sym && in2026(t));
    md.push(`| ${sym} | ${l.length} | ${l.length ? (l.filter((t) => t.r > 0).length / l.length * 100).toFixed(0) : 0} % | ${sgn(l.reduce((a, t) => a + t.r, 0))} |`);
  }
  md.push('');

  // --- 2026 : FTMO par risque, + contrôle sur 2025
  const score = (s) => [s.pass - s.fail, -s.fail, -s.contDd];
  const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  md.push('## 3. 2026 — cycles FTMO 1-Step (+10 %) par risque par trade', '', 'Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.', '');
  md.push('| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2026 | Pire baisse du compte continu | 2025 : réussis / ratés |', '|---|---|---|---|---|---|---|---|');
  const bestRisk = {};
  for (const [name, trades] of variants) {
    let b26 = null, b25 = null;
    for (const risk of RISKS) {
      const s26 = simulate(trades.filter(in2026), risk, { ftmo: true });
      const cont = simulate(trades.filter(in2026), risk, { ftmo: false });
      const s25 = simulate(trades.filter(in2025), risk, { ftmo: true });
      s26.contDd = cont.dd; s25.contDd = simulate(trades.filter(in2025), risk, { ftmo: false }).dd;
      if (!b26 || better(s26, b26.s)) b26 = { risk, s: s26 };
      if (!b25 || better(s25, b25.s)) b25 = { risk, s: s25 };
      const open = s26.cycles.filter((x) => x.outcome.startsWith('en cours'));
      md.push(`| ${name} | ${risk} % | ${s26.pass} | ${s26.fail} | ${open.length ? open[0].outcome.replace('en cours ', '') : '—'} | ${pct(cont.ret)} | ${cont.dd.toFixed(1)} % | ${s25.pass} / ${s25.fail} |`);
    }
    bestRisk[name] = { r26: b26.risk, r25: b25.risk };
  }
  md.push('', '| Variante | Meilleur % en 2026 | Meilleur % en 2025 |', '|---|---|---|');
  for (const [name] of variants) md.push(`| ${name} | ${bestRisk[name].r26} % | ${bestRisk[name].r25} % |`);
  md.push('');

  // --- dates des cycles au meilleur risque 2026 (et au 0,5 % de référence)
  md.push('## 4. 2026 — dates de passage / perte', '');
  for (const [name, trades] of variants) {
    for (const risk of [...new Set([bestRisk[name].r26, 0.5, 1.0])]) {
      const s = simulate(trades.filter(in2026), risk, { ftmo: true });
      md.push(`### ${name} — risque ${risk} %${risk === bestRisk[name].r26 ? ' (meilleur en 2026)' : ''}`, '', '| Cycle | Début | Fin | Jours | Trades | Résultat |', '|---|---|---|---|---|---|');
      s.cycles.forEach((x, i) => md.push(`| ${i + 1} | ${day(x.start)} | ${day(x.end)} | ${Math.max(0, Math.round((x.end - x.start) / DAY))} | ${x.taken.length} | ${x.outcome} |`));
      md.push('');
    }
  }

  const out = 'data/backtest-input/candidates-2026-analysis.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

main();
