#!/usr/bin/env node
// runCandidates2026Analysis.js
// Usage: node --max-old-space-size=4096 scripts/runCandidates2026Analysis.js [année, défaut 2026]
// Autres modes : --histdata [--optimiste] (historique long 2011-2025), --troisieme (3e jambe à ajouter à FVG ; combinable avec --histdata)
// Une autre année (ex. 2024) écrit candidates-<année>-analysis.md ; le RRR reste choisi sur l'entraînement (< 2025),
// donc une année d'avant 2025 est DANS l'échantillon d'entraînement (signalé dans le rapport).
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
const HIST = process.argv.includes('--histdata');
// --optimiste (avec --histdata) : la bougie M15 d'entrée n'est pas regardée pour le stop/la cible (borne haute) ; par
// défaut elle l'est, stop d'abord (borne basse). Le M1 exact est entre les deux.
const OPT = HIST && process.argv.includes('--optimiste');
const YEAR = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 2026);
const Y = String(YEAR);
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

// --histdata : historique long HistData.com (data/backtest-input/<paire>.csv, M15 seulement, déjà à l'heure du moteur
// « EST sans heure d'été »). Pas de M1 : le règlement se fait sur les bougies M15 (stop d'abord si stop et cible
// sont dans la même bougie), plus pessimiste que le M1 exact - calibré dans le rapport sur les années communes.
function loadHist(sym) {
  const lines = fs.readFileSync(`data/backtest-input/${sym}.csv`, 'utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    out.push({ time: +p[0], open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 });
  }
  return out;
}
const BAR_MS = HIST ? 900000 : 60000;

console.log(HIST ? 'Chargement HistData M15...' : 'Chargement M1 réel + reconstruction M15...');
const m15 = {}; const M1 = {};
for (const s of SYMBOLS) {
  const cs = HIST ? loadHist(s) : loadGz(s);
  m15[s] = HIST ? cs : toM15(cs);
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}

function settleM1(tr) {
  const S = M1[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + Math.round(5 * DAY / BAR_MS));
  for (let i = OPT ? fill + 1 : fill; i < maxI; i++) {
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
  // Ordre à heure égale : sorties (0), puis entrées (1), puis les sorties des trades stoppés à l'heure même de leur entrée
  // (2). Sans ce dernier rang, la sortie d'un tel trade passait AVANT son entrée et le trade n'était jamais compté
  // (bug corrigé le 2026-09-22 : il gonflait FVG, dont beaucoup de pertes sont stoppées dans la minute d'entrée).
  trades.forEach((t, i) => { evs.push({ time: t.entryTime, kind: 1, i }); evs.push({ time: Math.max(t.exitTime, t.entryTime), kind: t.exitTime <= t.entryTime ? 2 : 0, i }); });
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
  const [, inTrain] = windows[0]; const [, in2025] = windows[1];
  const in2026 = (t) => t.entryTime >= eng(YEAR) && t.entryTime < eng(YEAR + 1);
  const md = [`# Candidates ${Y} : FVG US100+XAUUSD, RSI(2) US500, les deux ensemble, contre le combo actuel`, ''];
  md.push(`Vrai \`LiveStrategyEngine\` (FVG, combo) et vraie classe \`DailyAlertEngine\` (RSI(2)) sur \`data/real-m1-full\` reconstruit en M15, règlement M1 exact, spread + **swap réel du broker** (relevé du 2026-09-22). FTMO 1-Step réel (\`buildEffectiveConfig\` : +10 %, perte max 10 % trailing fin de journée, perte quotidienne), simulé **par événements** (P&L à la sortie : dates exactes). Garde-fou du bot (3 trades/jour, pause 30 min) partagé entre toutes les stratégies d'une variante. Limites : perte quotidienne sur P&L clôturé (pas l'équité flottante), pas de commission (≈ 0 sur les trades réels) ni de glissement réel, taux de swap d'aujourd'hui appliqués au passé, ${YEAR === 2026 ? '2026 = 1er janvier → 18 septembre.' : `${Y} = année complète.`}`, '');
  if (YEAR < 2025) md.push(`**Attention : ${Y} fait partie de l'entraînement (< 2025)** sur lequel FVG seul, le retrait de US500 et les RRR ont été choisis. Ce n'est donc PAS une année indépendante : elle dit si l'idée tenait déjà cette année-là, pas si elle marchera. La colonne 2025 reste, elle, hors échantillon.`, '');

  // --- RRR de FVG, choisi sur l'entraînement
  console.log('FVG US100 + XAUUSD : un warmUp par RRR...');
  const byRR = {};
  for (const rr of RRS) {
    const cfg = {};
    for (const s of ['US100', 'XAUUSD']) cfg[s] = { ...CONFIG.fvg.perSymbol[s], rrMultiple: rr };
    byRR[rr] = engineTrades({ fvgConfig: cfg });
    console.log(`  1:${rr} -> ${byRR[rr].length} trades`);
  }
  md.push(`## 1. Meilleur RRR pour FVG (choisi sur l'entraînement, ${Y} lu ensuite)`, '', 'Par paire, trades isolés (sans garde-fou), R net avec spread + swap. Le netting est par paire, donc le RRR d\'une paire ne change pas les trades de l\'autre.', '');
  md.push(`| Paire | RRR | Trades entr. | Gagnants entr. | R net entraînement | R net 2025 | R net ${Y} | R/trade ${Y} |`, '|---|---|---|---|---|---|---|---|');
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
  md.push(`## 2. ${Y} — trades (garde-fou du bot, compte continu)`, '', '| Variante | Trades | Win rate | RRR réalisé (gain moy. / perte moy.) | R net | R/trade | t |', '|---|---|---|---|---|---|---|');
  for (const [name, trades] of variants) {
    const s = simulate(trades.filter(in2026), 0.5, { ftmo: false });
    md.push(`| ${name} | ${s.n} | ${s.winRate.toFixed(0)} % | ${s.payoff > 0 ? s.payoff.toFixed(2) : '— (aucune perte)'} | ${sgn(s.sum)} | ${sgn(s.mean, 3)} | ${s.t.toFixed(2)} |`);
  }
  md.push('', `### Part de chaque paire dans FVG (variante C, ${Y}, trades isolés)`, '', '| Paire | Trades | Win rate | R net |', '|---|---|---|---|');
  for (const sym of ['US100', 'XAUUSD']) {
    const l = fvgC.filter((t) => t.symbol === sym && in2026(t));
    md.push(`| ${sym} | ${l.length} | ${l.length ? (l.filter((t) => t.r > 0).length / l.length * 100).toFixed(0) : 0} % | ${sgn(l.reduce((a, t) => a + t.r, 0))} |`);
  }
  md.push('');

  // --- 2026 : FTMO par risque, + contrôle sur 2025
  const score = (s) => [s.pass - s.fail, -s.fail, -s.contDd];
  const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  md.push(`## 3. ${Y} — cycles FTMO 1-Step (+10 %) par risque par trade`, '', 'Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.', '');
  md.push(`| Variante | Risque | Réussis | Ratés | En cours | Compte continu ${Y} | Pire baisse du compte continu | 2025 : réussis / ratés |`, '|---|---|---|---|---|---|---|---|');
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
  md.push('', `| Variante | Meilleur % en ${Y} | Meilleur % en 2025 |`, '|---|---|---|');
  for (const [name] of variants) md.push(`| ${name} | ${bestRisk[name].r26} % | ${bestRisk[name].r25} % |`);
  md.push('');

  // --- dates des cycles au meilleur risque 2026 (et au 0,5 % de référence)
  md.push(`## 4. ${Y} — dates de passage / perte`, '');
  for (const [name, trades] of variants) {
    for (const risk of [...new Set([bestRisk[name].r26, 0.5, 1.0])]) {
      const s = simulate(trades.filter(in2026), risk, { ftmo: true });
      md.push(`### ${name} — risque ${risk} %${risk === bestRisk[name].r26 ? ` (meilleur en ${Y})` : ''}`, '', '| Cycle | Début | Fin | Jours | Trades | Résultat |', '|---|---|---|---|---|---|');
      s.cycles.forEach((x, i) => md.push(`| ${i + 1} | ${day(x.start)} | ${day(x.end)} | ${Math.max(0, Math.round((x.end - x.start) / DAY))} | ${x.taken.length} | ${x.outcome} |`));
      md.push('');
    }
  }

  const out = `data/backtest-input/candidates-${Y}-analysis.md`;
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

// --- Mode --histdata : les mêmes idées sur l'historique long, année par année. Aucun réglage refait : RRR figés à
// US100 1:5 / XAUUSD 1:7 (C) et aux RRR actuels (C0), combo = config de production.
function mainHist() {
  const FIRST = 2011, LAST = 2025; // US100/US500 démarrent le 2010-11-14 : 2011 = première année complète
  const inY = (y) => (t) => t.entryTime >= eng(y) && t.entryTime < eng(y + 1);
  const inRange = (t) => t.entryTime >= eng(FIRST) && t.entryTime < eng(LAST + 1);
  const cur = { US100: CONFIG.fvg.perSymbol.US100.rrMultiple, XAUUSD: CONFIG.fvg.perSymbol.XAUUSD.rrMultiple };
  const fvgFor = (rrU, rrX) => engineTrades({ fvgConfig: { US100: { ...CONFIG.fvg.perSymbol.US100, rrMultiple: rrU }, XAUUSD: { ...CONFIG.fvg.perSymbol.XAUUSD, rrMultiple: rrX } } });
  console.log('FVG C (1:5 / 1:7)...'); const fvgC = fvgFor(5, 7);
  console.log('FVG C0 (RRR actuels)...'); const fvgC0 = fvgFor(cur.US100, cur.XAUUSD);
  console.log('Combo actuel...');
  const combo = engineTrades({ fvgConfig: Object.fromEntries(Object.entries(CONFIG.fvg.perSymbol).filter(([s]) => SYMBOLS.includes(s))), divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr });
  console.log('RSI(2) US500...'); const rsi2 = rsi2Trades();
  const both = [...fvgC, ...rsi2].sort((a, b) => a.entryTime - b.entryTime);
  const variants = [['A. Combo actuel', combo], [`C0. FVG US100 1:${cur.US100} + XAUUSD 1:${cur.XAUUSD} (RRR actuels)`, fvgC0], ['C. FVG US100 1:5 + XAUUSD 1:7', fvgC], ['R. RSI(2) US500', rsi2], ['C+R. FVG + RSI(2)', both]];
  const short = ['A', 'C0', 'C', 'R', 'C+R'];
  const years = []; for (let y = FIRST; y <= LAST; y++) years.push(y);

  const md = [`# Candidates sur l'historique long HistData (${FIRST}-${LAST}) : FVG US100+XAUUSD, RSI(2) US500, contre le combo actuel`, ''];
  if (OPT) md.push('**Borne OPTIMISTE** (`--optimiste`) : la bougie M15 d\'entrée est ignorée pour le stop et la cible. La borne pessimiste (stop d\'abord dans cette bougie) est dans `candidates-histdata-analysis.md` ; le M1 exact est entre les deux.', '');
  md.push(`Même script que \`candidates-2026-analysis.md\` (\`--histdata\`) : vrai \`LiveStrategyEngine\` et vraie classe \`DailyAlertEngine\`, garde-fou du bot, FTMO 1-Step réel simulé par événements, spread par défaut + swap réel d'aujourd'hui. **Aucun réglage refait** : RRR figés (C : US100 1:5 / XAUUSD 1:7 ; C0 : RRR actuels ${cur.US100}/${cur.XAUUSD}), combo = config de production.`, '');
  md.push('**Ce que vaut ce test.** Les filtres FVG et les RRR ont été mis au point sur 2019-2025 : **2011-2018 n\'a jamais servi à aucun choix**, c\'est le vrai test hors échantillon. 2019-2025 est montré pour la continuité (déjà vu pendant la mise au point).', '');
  md.push('**Limites propres à cette source** : prix HistData.com (pas le flux du broker) ; **bougies M15 seulement**, donc règlement M15 avec le stop d\'abord quand stop et cible sont touchés dans la même bougie - nettement plus pessimiste que le M1 exact (voir calibration en fin de rapport) : lire les écarts entre variantes plus que les niveaux ; swap d\'aujourd\'hui (taux proches de 0 en 2011-2021 : coût de l\'achat surestimé) ; perte quotidienne FTMO sur le P&L clôturé.', '');

  md.push('## 1. R net par année (garde-fou du bot, compte continu)', '');
  md.push(`| Année | ${short.map((x) => `${x} : trades`).join(' | ')} | ${short.map((x) => `${x} : R net`).join(' | ')} |`, `|---|${short.map(() => '---|').join('')}${short.map(() => '---|').join('')}`);
  const tot = variants.map(() => ({ n: 0, r: 0, pos: 0 }));
  for (const y of years) {
    const ss = variants.map(([, tr]) => simulate(tr.filter(inY(y)), 0.5, { ftmo: false }));
    ss.forEach((x, i) => { if (y <= 2018) { tot[i].n += x.n; tot[i].r += x.sum; if (x.sum > 0) tot[i].pos++; } });
    md.push(`| ${y}${y <= 2018 ? '' : ' (vu)'} | ${ss.map((x) => x.n).join(' | ')} | ${ss.map((x) => sgn(x.sum)).join(' | ')} |`);
  }
  md.push('', `### Hors échantillon ${FIRST}-2018 (jamais vu)`, '', '| Variante | Trades | Win rate | RRR réalisé | R net | R/trade | t | Années positives |', '|---|---|---|---|---|---|---|---|');
  variants.forEach(([name, tr], i) => {
    const s = simulate(tr.filter((t) => t.entryTime >= eng(FIRST) && t.entryTime < eng(2019)), 0.5, { ftmo: false });
    md.push(`| ${name} | ${s.n} | ${s.winRate.toFixed(0)} % | ${s.payoff > 0 ? s.payoff.toFixed(2) : '—'} | ${sgn(s.sum)} | ${sgn(s.mean, 3)} | ${s.t.toFixed(2)} | ${tot[i].pos} / 8 |`);
  });
  md.push('', '### Part de chaque paire (C, trades isolés, 2011-2018)', '', '| Paire | Trades | Win rate | R net |', '|---|---|---|---|');
  for (const sym of ['US100', 'XAUUSD']) {
    const l = fvgC.filter((t) => t.symbol === sym && t.entryTime >= eng(FIRST) && t.entryTime < eng(2019));
    md.push(`| ${sym} | ${l.length} | ${l.length ? (l.filter((t) => t.r > 0).length / l.length * 100).toFixed(0) : 0} % | ${sgn(l.reduce((a, t) => a + t.r, 0))} |`);
  }

  md.push('', '## 2. FTMO 1-Step (+10 %) : réussis / ratés par année (cycles remis à zéro le 1er janvier)', '');
  for (const risk of [0.5, 1.0]) {
    md.push(`### Risque ${risk} % par trade`, '', `| Année | ${short.join(' | ')} |`, `|---|${short.map(() => '---|').join('')}`);
    const sumPF = variants.map(() => ({ p: 0, f: 0 }));
    for (const y of years) {
      const ss = variants.map(([, tr]) => simulate(tr.filter(inY(y)), risk, { ftmo: true }));
      ss.forEach((x, i) => { if (y <= 2018) { sumPF[i].p += x.pass; sumPF[i].f += x.fail; } });
      md.push(`| ${y}${y <= 2018 ? '' : ' (vu)'} | ${ss.map((x) => `${x.pass} / ${x.fail}`).join(' | ')} |`);
    }
    md.push(`| **Total ${FIRST}-2018** | ${sumPF.map((x) => `**${x.p} / ${x.f}**`).join(' | ')} |`, '');
  }

  md.push(`## 3. FTMO enchaîné sur toute la période hors échantillon (${FIRST}-2018), par risque`, '', 'Les cycles s\'enchaînent sans remise à zéro annuelle. Meilleur % : réussis − ratés, puis le moins de ratés.', '', '| Variante | Risque | Réussis | Ratés | Durée médiane d\'un cycle réussi (jours) | Pire baisse du compte continu | Compte continu |', '|---|---|---|---|---|---|---|');
  const oos = (t) => t.entryTime >= eng(FIRST) && t.entryTime < eng(2019);
  for (const [name, tr] of variants) {
    for (const risk of RISKS) {
      const s = simulate(tr.filter(oos), risk, { ftmo: true }); const cont = simulate(tr.filter(oos), risk, { ftmo: false });
      const durs = s.cycles.filter((x) => x.outcome === 'RÉUSSI').map((x) => (x.end - x.start) / DAY).sort((a, b) => a - b);
      md.push(`| ${name} | ${risk} % | ${s.pass} | ${s.fail} | ${durs.length ? Math.round(durs[durs.length >> 1]) : '—'} | ${cont.dd.toFixed(1)} % | ${pct(cont.ret)} |`);
    }
  }

  md.push('', '## 4. RRR par année (trades isolés, R net) - le choix 1:5 / 1:7 tient-il avant 2019 ?', '');
  const rrs = {};
  for (const rr of RRS) { console.log(`RRR 1:${rr}...`); rrs[rr] = fvgFor(rr, rr); }
  for (const sym of ['US100', 'XAUUSD']) {
    md.push(`### ${sym}`, '', `| RRR | ${years.filter((y) => y <= 2018).join(' | ')} | Total ${FIRST}-2018 |`, `|---|${years.filter((y) => y <= 2018).map(() => '---|').join('')}---|`);
    for (const rr of RRS) {
      const l = rrs[rr].filter((t) => t.symbol === sym);
      const per = years.filter((y) => y <= 2018).map((y) => l.filter(inY(y)).reduce((a, t) => a + t.r, 0));
      md.push(`| 1:${rr} | ${per.map((x) => sgn(x)).join(' | ')} | **${sgn(per.reduce((a, b) => a + b, 0))}** |`);
    }
    md.push('');
  }

  // Chiffres broker M1 exact (après correction du bug d'ordre des événements), repris de candidates-<année>-analysis.md.
  const BROKER = { 2023: { A: 72.6, C0: 77.6, C: 67.4, R: null, 'C+R': 66.9 }, 2024: { A: 3.9, C0: 24.4, C: 35.5, R: 3.2, 'C+R': 38.7 }, 2025: { A: 79.5, C0: 62.6, C: 71.7, R: null, 'C+R': 73.5 } };
  md.push('## 5. Calibration : HistData M15 contre broker M1 exact (2023-2025)', '', 'Même moteur, mêmes années ; seules la source des prix et la façon de régler changent. R net au garde-fou du bot. Chiffres broker : `candidates-<année>-analysis.md`. Lancer les deux bornes (`--histdata` et `--histdata --optimiste`) pour situer le vrai chiffre.', '', '| Variante | Année | HistData M15 (cette borne) | Broker M1 exact |', '|---|---|---|---|');
  variants.forEach(([name, tr], i) => { for (const y of [2023, 2024, 2025]) { const b = BROKER[y][short[i]]; if (b === null) continue; md.push(`| ${name} | ${y} | ${sgn(simulate(tr.filter(inY(y)), 0.5, { ftmo: false }).sum)} | ${sgn(b)} |`); } });
  md.push('');

  const out = `data/backtest-input/candidates-histdata${OPT ? '-optimiste' : ''}-analysis.md`;
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

// --- Mode --troisieme : quelle 3e jambe ajouter à FVG US100 1:5 + XAUUSD 1:7 ? (Esdras, 2026-09-23)
// Chaque jambe = une stratégie du bot sur une paire, avec sa config de production. 1) jambe seule (trades isolés),
// 2) C + jambe dans le MÊME moteur (netting par paire réel) et le même garde-fou (3 trades/jour partagés), FTMO par année.
// Le classement se fait sur l'entraînement (< 2025) ; 2025-2026 est lu ensuite. Avec --histdata : 2011-2018 (jamais vu).
function mainThird() {
  const years = HIST ? [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018] : [2023, 2024, 2025, 2026];
  const inY = (y) => (t) => t.entryTime >= eng(y) && t.entryTime < eng(y + 1);
  const inAll = (t) => t.entryTime >= eng(years[0]) && t.entryTime < eng(years[years.length - 1] + 1);
  const inTrain = (t) => t.entryTime < CUT_TEST;
  const fvgC = { US100: { ...CONFIG.fvg.perSymbol.US100, rrMultiple: 5 }, XAUUSD: { ...CONFIG.fvg.perSymbol.XAUUSD, rrMultiple: 7 } };
  const legs = [
    ['FVG US500', { fvgConfig: { US500: CONFIG.fvg.perSymbol.US500 } }, { fvgConfig: { ...fvgC, US500: CONFIG.fvg.perSymbol.US500 } }],
    ['Divergence US100/US500', { divergenceConfig: CONFIG.divergence }],
    ['NWOG US100', { nwogConfig: { ...CONFIG.nwog, symbols: ['US100'] } }],
    ['Judas Swing EURUSD', { judasSwingConfig: CONFIG.judasSwing }],
    ['Weekly Sweep US500', { weeklySweepConfig: { ...CONFIG.weeklySweep, symbols: ['US500'] } }],
    ['Silver Bullet US100', { silverBulletConfig: { ...CONFIG.silverBullet, symbols: ['US100'] } }],
    ['Silver Bullet US500', { silverBulletConfig: { ...CONFIG.silverBullet, symbols: ['US500'] } }],
    ['CBDR US100', { cbdrConfig: CONFIG.cbdr }],
  ];
  const sum = (l) => l.reduce((a, t) => a + t.r, 0);
  console.log('C (FVG US100 1:5 + XAUUSD 1:7)...'); const C = engineTrades({ fvgConfig: fvgC });
  console.log('RSI(2) US500...'); const rsi2 = rsi2Trades();
  const rows = [];
  for (const [name, alone, withC] of legs) {
    console.log(`${name} : seule, puis avec C...`);
    rows.push({ name, alone: engineTrades(alone), withC: engineTrades(withC ?? { fvgConfig: fvgC, ...alone }) });
  }
  rows.push({ name: 'RSI(2) US500', alone: rsi2, withC: [...C, ...rsi2].sort((a, b) => a.entryTime - b.entryTime) });
  if (!HIST) rows.sort((a, b) => sum(b.alone.filter(inTrain)) - sum(a.alone.filter(inTrain)));
  else rows.sort((a, b) => sum(b.alone.filter(inAll)) - sum(a.alone.filter(inAll)));

  const md = [`# 3e jambe pour FVG US100 1:5 + XAUUSD 1:7 : ${HIST ? `HistData ${years[0]}-${years[years.length - 1]} (${OPT ? 'borne optimiste' : 'borne pessimiste'})` : 'broker M1 exact 2023-2026'}`, ''];
  md.push(`Même moteur et même règlement que \`candidates-${HIST ? 'histdata' : '2026'}-analysis.md\` (\`--troisieme\`). Chaque jambe = une stratégie du bot sur une paire, config de production, aucun réglage refait. « Avec C » = C et la jambe dans le **même moteur** (une seule position par paire, comme en production) et le **même garde-fou** (3 trades/jour partagés, pause 30 min), donc la jambe peut prendre la place d'un trade FVG.`, '');
  md.push(HIST ? '**2011-2018 n\'a servi à aucun choix** (ni FVG, ni les autres stratégies, mises au point sur 2019+). Règlement M15 : lire les deux bornes (`third-leg-histdata-analysis.md` / `-optimiste`), le vrai chiffre est entre les deux.' : `**Classement sur l'entraînement (< 2025)**, 2025-${years[years.length - 1]} lu ensuite : classer sur toutes les années choisirait la jambe qui a eu de la chance sur les années mêmes où on la juge. 2026 = 1er janvier → 18 septembre.`, '');

  md.push('## 1. Chaque jambe seule (trades isolés, R net avec spread + swap)', '', `| Jambe | ${years.map((y) => String(y)).join(' | ')} | Total | Trades | Win rate | R/trade | t |`, `|---|${years.map(() => '---|').join('')}---|---|---|---|---|`);
  const legRow = (name, l0) => {
    const l = l0.filter(inAll); const s = simulate(l, 0.5, { ftmo: false });
    return `| ${name} | ${years.map((y) => sgn(sum(l.filter(inY(y))))).join(' | ')} | **${sgn(sum(l))}** | ${l.length} | ${l.length ? (l.filter((t) => t.r > 0).length / l.length * 100).toFixed(0) : 0} % | ${l.length ? sgn(sum(l) / l.length, 3) : '—'} | ${s.t.toFixed(2)} |`;
  };
  md.push(legRow('*Réf. FVG US100 1:5*', C.filter((t) => t.symbol === 'US100')), legRow('*Réf. FVG XAUUSD 1:7*', C.filter((t) => t.symbol === 'XAUUSD')));
  for (const r of rows) md.push(legRow(r.name, r.alone));

  md.push('', '## 2. C + la jambe (même moteur, même garde-fou) : R net par année', '', `| Variante | ${years.map((y) => String(y)).join(' | ')} | Total | Écart avec C |`, `|---|${years.map(() => '---|').join('')}---|---|`);
  const rC = years.map((y) => simulate(C.filter(inY(y)), 0.5, { ftmo: false }).sum); const totC = rC.reduce((a, b) => a + b, 0);
  md.push(`| **C seul** | ${rC.map((x) => sgn(x)).join(' | ')} | **${sgn(totC)}** | — |`);
  for (const r of rows) {
    const rr = years.map((y) => simulate(r.withC.filter(inY(y)), 0.5, { ftmo: false }).sum); const tot = rr.reduce((a, b) => a + b, 0);
    md.push(`| C + ${r.name} | ${rr.map((x) => sgn(x)).join(' | ')} | **${sgn(tot)}** | ${sgn(tot - totC)} |`);
  }

  md.push('', '## 3. FTMO 1-Step (+10 %) : réussis / ratés, cycles remis à zéro le 1er janvier, total des années', '', 'Pire baisse = pire baisse du compte continu sur une année (au risque indiqué).', '');
  const risks = [0.5, 0.75, 1.0];
  md.push(`| Variante | ${risks.map((k) => `${k} % : réussis / ratés`).join(' | ')} | ${risks.map((k) => `${k} % : pire baisse`).join(' | ')} |`, `|---|${risks.map(() => '---|').join('')}${risks.map(() => '---|').join('')}`);
  const ftmoRow = (name, tr) => {
    const cells = risks.map((k) => { let p = 0, f = 0; for (const y of years) { const s = simulate(tr.filter(inY(y)), k, { ftmo: true }); p += s.pass; f += s.fail; } return `${p} / ${f}`; });
    const dds = risks.map((k) => Math.max(...years.map((y) => simulate(tr.filter(inY(y)), k, { ftmo: false }).dd)).toFixed(1) + ' %');
    return `| ${name} | ${cells.join(' | ')} | ${dds.join(' | ')} |`;
  };
  md.push(ftmoRow('**C seul**', C));
  for (const r of rows) md.push(ftmoRow(`C + ${r.name}`, r.withC));
  if (!HIST) {
    md.push('', '### Hors classement seulement (2025-2026)', '', `| Variante | ${risks.map((k) => `${k} %`).join(' | ')} | R net |`, `|---|${risks.map(() => '---|').join('')}---|`);
    const oos = [2025, 2026];
    const row = (name, tr) => `| ${name} | ${risks.map((k) => { let p = 0, f = 0; for (const y of oos) { const s = simulate(tr.filter(inY(y)), k, { ftmo: true }); p += s.pass; f += s.fail; } return `${p} / ${f}`; }).join(' | ')} | ${sgn(oos.reduce((a, y) => a + simulate(tr.filter(inY(y)), 0.5, { ftmo: false }).sum, 0))} |`;
    md.push(row('**C seul**', C)); for (const r of rows) md.push(row(`C + ${r.name}`, r.withC));
  }
  md.push('');
  const out = `data/backtest-input/third-leg${HIST ? `-histdata${OPT ? '-optimiste' : ''}` : ''}-analysis.md`;
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

if (process.argv.includes('--troisieme')) mainThird(); else if (HIST) mainHist(); else main();
