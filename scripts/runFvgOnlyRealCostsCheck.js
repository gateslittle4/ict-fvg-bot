#!/usr/bin/env node
// runFvgOnlyRealCostsCheck.js
// Usage: node --max-old-space-size=4096 scripts/runFvgOnlyRealCostsCheck.js
//
// Suite de runFvgOnlyFtmoRiskAnalysis.js (2026-09-22). Esdras : "regle tout ici". Les trois trous de cette analyse :
//   1. Coût réel du swap - l'analyse d'origine n'en comptait AUCUN, alors qu'un trade FVG peut rester ouvert jusqu'à
//      480 bougies M15 (5 jours). Taux RÉELS du broker lus le 2026-09-22 sur /admin/swap-check (pips par lot et par jour,
//      prélevés à 21:00 UTC, triplés le vendredi sur les indices, le mercredi sur l'or et EURUSD, rien le week-end).
//   2. Biais de sélection - "FVG = meilleure stratégie" avait été décidé en regardant tout l'historique. Contrôle : chaque
//      mécanisme SEUL, classé sur l'ENTRAÎNEMENT SEUL (< 2025). Si FVG y est aussi premier, le choix n'utilise pas 2025/2026
//      et ces deux fenêtres deviennent un vrai hors échantillon pour la décision "FVG seul".
//   3. Commission - lue sur les trades réels de la démo (bot_trade_events) : voir le rapport, pas de calcul ici.
//
// Taille du pip (10^-pipPosition) : NON transmise par la route en production au moment de la mesure (corrigé dans le
// code le même jour, visible après le prochain déploiement). Déduite ici : indices 0,1, or 0,01, EURUSD 0,0001 - la
// seule lecture qui donne des taux annuels plausibles (~-5,2 %/an à l'achat sur US100, US500 ET l'or, ~+2 à +3 %/an à
// la vente, soit un taux USD ~3,7 % +/- la marge du broker ; toute autre position de pip donne 0,5 %/an ou 50 %/an).
// LIMITE : taux d'aujourd'hui appliqués à tout l'historique (les taux USD étaient plus hauts en 2023-2024, ~5,3 %) -
// le coût passé est donc plutôt SOUS-estimé ici.
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
const DAY = 86400000;
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - FIXED_EST_TO_UTC_OFFSET_MS;
const CUT_TEST = eng(2025);
const CUT_FWD = eng(2026);
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + ' %';
const sgn = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

// Relevé réel du 2026-09-22 (/admin/swap-check) : pips par lot et par jour ; pip déduit (voir en-tête).
const SWAP = {
  US100: { long: -43.7, short: 18.4, pip: 0.1, triple: 5 },
  US500: { long: -11, short: 4.4, pip: 0.1, triple: 5 },
  XAUUSD: { long: -63.88, short: 39.45, pip: 0.01, triple: 3 },
  EURUSD: { long: -0.65, short: 0.28, pip: 0.0001, triple: 3 },
};
const ROLLOVER_ENGINE_HOUR = 21 - FIXED_EST_TO_UTC_OFFSET_MS / 3600000; // 21:00 UTC réel -> 16:00 en temps moteur

/** Swap d'un trade en R : somme, sur chaque rollover franchi entre le remplissage et la sortie, de taux x pip x multiplicateur / distance du stop. */
function swapR(tr, fillTime, exitTime) {
  const sw = SWAP[tr.symbol];
  if (!sw) return 0;
  const perUnitPerDay = (tr.direction === 'bullish' ? sw.long : sw.short) * sw.pip;
  let nights = 0;
  let tau = Math.floor(fillTime / DAY) * DAY + ROLLOVER_ENGINE_HOUR * 3600000;
  if (tau <= fillTime) tau += DAY;
  for (; tau <= exitTime; tau += DAY) {
    const dow = new Date(tau + FIXED_EST_TO_UTC_OFFSET_MS).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    nights += dow === sw.triple ? 3 : 1;
  }
  return { r: (nights * perUnitPerDay) / tr.distance, nights };
}

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
const spreadR = (sym, d) => { const s = DEFAULT_SPREADS[sym] ?? 0; return s > 0 ? s / d : 0; };

console.log('Chargement M1 réel + reconstruction M15...');
const m15 = {}; const M1 = {};
for (const s of SYMBOLS) {
  const cs = loadGz(s);
  m15[s] = toM15(cs);
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}

// Même règlement M1 exact que runFvgOnlyFtmoRiskAnalysis.js, qui renvoie aussi la minute de remplissage.
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
const fvgOf = (syms) => Object.fromEntries(Object.entries(CONFIG.fvg.perSymbol).filter(([s]) => syms.includes(s)));

function buildTrades(configs) {
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
      const open = pending.get(signal.symbol); pending.delete(signal.symbol);
      if (!open) return;
      const x = settleM1(open);
      if (!x) return;
      const gross = (open.direction === 'bullish' ? x.exitPrice - open.entryPrice : open.entryPrice - x.exitPrice) / open.distance;
      const rNoSwap = gross - spreadR(open.symbol, open.distance);
      const sw = swapR(open, x.fillTime, x.exitTime);
      trades.push({ symbol: open.symbol, source: open.source, direction: open.direction, entryTime: open.entryTime, exitTime: x.exitTime, rNoSwap, swap: sw.r, nights: sw.nights, r: rNoSwap + sw.r });
    },
  });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

function continuous(trades, risk, key = 'r') {
  const g = new GuardrailEngine({ ...CONFIG.guardrails });
  g.setBalance(START, trades.length ? trades[0].entryTime : 0);
  let bal = START, peak = START, dd = 0; const rs = [];
  for (const t of trades) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const pnl = bal * (risk / 100) * t[key]; bal += pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100);
    g.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol });
    rs.push(t[key]);
  }
  const n = rs.length; const sum = rs.reduce((a, x) => a + x, 0); const mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0, ret: (bal - START) / START * 100, dd };
}

function ftmo(trades, risk) {
  const eff = buildEffectiveConfig({ id: 'fvg-real-costs', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk });
  let pass = 0, fail = 0; let c = null;
  const start = (t) => { const g = new GuardrailEngine({ ...eff.guardrails }); g.setBalance(START, t); c = { bal: START, g, trades: 0 }; };
  start(trades.length ? trades[0].entryTime : 0);
  for (const t of trades) {
    if (!c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const pnl = c.bal * (risk / 100) * t.r; c.bal += pnl; c.trades++;
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached) { pass++; start(t.exitTime); } else if (st.overallDrawdownBreached) { fail++; start(t.exitTime); }
  }
  return { pass, fail, open: c.trades > 0 ? 1 : 0, openPct: (c.bal - START) / START * 100 };
}

function main() {
  const windows = [
    ['Entraînement (< 2025)', (t) => t.entryTime < CUT_TEST],
    ['Test (2025)', (t) => t.entryTime >= CUT_TEST && t.entryTime < CUT_FWD],
    ['2026', (t) => t.entryTime >= CUT_FWD],
    ['Hors échantillon (2025 + 2026)', (t) => t.entryTime >= CUT_TEST],
  ];
  const fvgSymbols = Object.keys(CONFIG.fvg.perSymbol).filter((s) => SYMBOLS.includes(s));

  console.log('Mécanismes seuls (contrôle de sélection sur l\'entraînement)...');
  const mechanisms = [
    ['fvg', { fvgConfig: fvgOf(fvgSymbols) }],
    ['divergence', { divergenceConfig: CONFIG.divergence }],
    ['nwog', { nwogConfig: CONFIG.nwog }],
    ['judaswing', { judasSwingConfig: CONFIG.judasSwing }],
    ['weeklysweep', { weeklySweepConfig: CONFIG.weeklySweep }],
    ['silverbullet', { silverBulletConfig: CONFIG.silverBullet }],
    ['cbdr', { cbdrConfig: CONFIG.cbdr }],
  ];
  const alone = {};
  for (const [name, cfg] of mechanisms) { alone[name] = buildTrades(cfg); console.log(`  ${name}: ${alone[name].length} trades`); }

  console.log('Variantes A / C...');
  const combo = buildTrades({ fvgConfig: fvgOf(fvgSymbols), divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr });
  const fvgC = buildTrades({ fvgConfig: fvgOf(fvgSymbols.filter((s) => s !== 'US500')) });
  const variants = [['A. Combo actuel', combo], ['B. FVG seul (US100/US500/XAUUSD)', alone.fvg], ['C. FVG seul sans US500 (US100/XAUUSD)', fvgC]];

  const md = ['# FVG seul : coûts réels (swap mesuré) et contrôle du biais de sélection', ''];
  md.push('Suite de `fvg-only-ftmo-risk-2026.md`. Même méthode (vrai `LiveStrategyEngine`, `data/real-m1-full` reconstruit en M15, règlement M1 exact, rejeu dans le vrai `GuardrailEngine`, cycles FTMO 1-Step réels), avec en plus le **swap réel du broker** relevé le 2026-09-22 sur `/admin/swap-check` (pips/lot/jour, 21:00 UTC, triple vendredi indices / mercredi or et EURUSD, rien le week-end). Taille du pip déduite (indices 0,1 ; or 0,01 ; EURUSD 0,0001 : seule lecture plausible, voir en-tête du script). Taux d\'aujourd\'hui appliqués à tout l\'historique : coût passé plutôt sous-estimé (taux USD plus hauts en 2023-2024).', '');
  md.push('| Paire | Achat (pips/lot/jour) | Vente | ≈ %/an à l\'achat | ≈ %/an à la vente |', '|---|---|---|---|---|');
  const px = { US100: 30749.3, US500: 7769.7, XAUUSD: 4357.51, EURUSD: 1.14474 };
  for (const [s, v] of Object.entries(SWAP)) md.push(`| ${s} | ${v.long} | ${v.short} | ${sgn(v.long * v.pip / px[s] * 365 * 100, 2)} % | ${sgn(v.short * v.pip / px[s] * 365 * 100, 2)} % |`);
  md.push('');

  md.push('## 1. Contrôle du biais de sélection : chaque mécanisme SEUL, sur l\'entraînement SEUL (< 2025), swap réel inclus', '', '| Mécanisme | Trades | R net | R/trade | t |', '|---|---|---|---|---|');
  const trainRank = mechanisms.map(([name]) => [name, continuous(alone[name].filter(windows[0][1]), 0.5)]).sort((a, b) => b[1].mean - a[1].mean);
  for (const [name, r] of trainRank) md.push(`| ${name} | ${r.n} | ${sgn(r.sum)} | ${sgn(r.mean, 3)} | ${r.t.toFixed(2)} |`);
  const byTotal = [...trainRank].sort((a, b) => b[1].sum - a[1].sum);
  md.push('', `Premier par R/trade : **${trainRank[0][0]}** ; premier par R total : **${byTotal[0][0]}**.`, '');

  md.push('## 2. Effet du swap réel (R, rejoué dans le garde-fou du bot)', '', '| Variante | Fenêtre | Trades | Nuits moyennes | R/trade sans swap | R/trade avec swap | R net avec swap | t avec swap |', '|---|---|---|---|---|---|---|---|');
  for (const [name, trades] of variants) {
    for (const [wName, wf] of windows) {
      const w = trades.filter(wf);
      const a = continuous(w, 0.5, 'rNoSwap'); const b = continuous(w, 0.5, 'r');
      const nights = w.length ? w.reduce((s, t) => s + t.nights, 0) / w.length : 0;
      md.push(`| ${name} | ${wName} | ${b.n} | ${nights.toFixed(2)} | ${sgn(a.mean, 3)} | ${sgn(b.mean, 3)} | ${sgn(b.sum)} | ${b.t.toFixed(2)} |`);
    }
  }
  md.push('', '### Swap moyen par trade et par paire (variante C, tout l\'historique)', '', '| Paire | Trades | Swap moyen (R) | Nuits moyennes |', '|---|---|---|---|');
  for (const s of ['US100', 'XAUUSD']) {
    const l = fvgC.filter((t) => t.symbol === s);
    if (l.length) md.push(`| ${s} | ${l.length} | ${sgn(l.reduce((a, t) => a + t.swap, 0) / l.length, 3)} | ${(l.reduce((a, t) => a + t.nights, 0) / l.length).toFixed(2)} |`);
  }
  md.push('');

  md.push('## 3. FTMO 1-Step avec swap réel', '', '| Variante | Fenêtre | Risque | Compte continu | Pire baisse | FTMO réussis / ratés / en cours |', '|---|---|---|---|---|---|');
  for (const [name, trades] of variants) {
    for (const [wName, wf] of windows) {
      for (const risk of [0.5, 0.75, 1.0]) {
        const w = trades.filter(wf); const r = continuous(w, risk); const f = ftmo(w, risk);
        md.push(`| ${name} | ${wName} | ${risk} % | ${pct(r.ret)} | ${r.dd.toFixed(1)} % | ${f.pass} / ${f.fail} / ${f.open} (${pct(f.openPct)}) |`);
      }
    }
  }
  md.push('');

  const out = 'data/backtest-input/fvg-only-real-costs-check.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

main();
