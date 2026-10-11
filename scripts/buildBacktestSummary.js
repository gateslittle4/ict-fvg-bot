#!/usr/bin/env node
// buildBacktestSummary.js
// Usage: node --max-old-space-size=4096 scripts/buildBacktestSummary.js
//
// Résumé compact chargé par le chat du dashboard (src/chatAssistant.js -> backtestM1).
// Référence : le VRAI moteur (LiveStrategyEngine) rejoué sur tout l'historique M1 réel du broker
// (data/real-m1-full), règlement M1 exact, garde-fous réels rejoués, symboles de production
// (CONFIG.symbols, sans GER40). Même méthode que scripts/runEngineM1Backtest.js.
//
// Remplace l'ancienne version (rejeu M15 2009-2025 sur data/backtest-input, GER40 inclus, R BRUT =
// rapport R:R sans coûts) : ses chiffres (~2964 R, 30,4 %) étaient périmés et surestimés.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const ENGINE_SYMBOLS = ['US500', 'US100', 'XAUUSD', 'EURUSD', 'GER40'];
const PROD_SYMBOLS = CONFIG.symbols;
const RISK_PCT = 0.3; // risque réel du bot (les rapports M1 de référence utilisent aussi 0,3 %)
const START = 10000;
const OUT_PATH = 'data/backtest-summary.json';
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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

const m1Bars = Object.fromEntries(ENGINE_SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(ENGINE_SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of ENGINE_SYMBOLS) {
  const cs = m1Bars[s];
  M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
}
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => {
  const g = (dir === 'bullish' ? exit - entry : entry - exit) / d;
  const s = DEFAULT_SPREADS[sym] ?? 0;
  return g - (s > 0 ? s / d : 0);
};

function settleM1(tr) {
  const S = M1[tr.symbol];
  const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime);
  const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
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

const guard0 = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
guard0.setBalance(START, Math.min(...ENGINE_SYMBOLS.map((s) => m15[s][0].time)));
const engine = new LiveStrategyEngine({ symbols: ENGINE_SYMBOLS, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: guard0, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
const pending = new Map();
const canonical = [];
engine.warmUp(m15, {
  completeDivergencePair: true,
  onEvent: (sig, candle) => {
    if (sig.type === 'validated' && !sig.blockedReason) {
      pending.set(sig.symbol, { symbol: sig.symbol, source: sig.source, direction: sig.direction, entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice, distance: sig.distance, entryTime: candle.time });
      return;
    }
    if (sig.type !== 'closed') return;
    const o = pending.get(sig.symbol);
    pending.delete(sig.symbol);
    if (!o) return;
    const m1 = settleM1(o);
    if (!m1) return;
    canonical.push({ ...o, r: netR(o.direction, o.entryPrice, o.distance, m1.exitPrice, o.symbol), exitTime: m1.exitTime, outcome: m1.outcome });
  },
});
canonical.sort((a, b) => a.entryTime - b.entryTime);

const prod = canonical.filter((t) => PROD_SYMBOLS.includes(t.symbol));
const guard = new GuardrailEngine({ ...CONFIG.guardrails });
guard.setBalance(START, prod.length ? prod[0].entryTime : 0);
let bal = START, peak = START, maxDd = 0, vetoed = 0;
const taken = [];
for (const t of prod) {
  if (!guard.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
  const pnl = bal * (RISK_PCT / 100) * t.r;
  bal += pnl;
  peak = Math.max(peak, bal);
  maxDd = Math.max(maxDd, ((peak - bal) / peak) * 100);
  guard.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol });
  taken.push(t);
}

const bucket = () => ({ count: 0, wins: 0, losses: 0, timeouts: 0, totalR: 0 });
function add(b, t) {
  b.count++;
  if (t.outcome === 'win') b.wins++;
  else if (t.outcome === 'loss') b.losses++;
  else b.timeouts++;
  b.totalR += t.r;
}
function fin(b) {
  const decided = b.wins + b.losses;
  b.winRatePct = decided > 0 ? Math.round((b.wins / decided) * 1000) / 10 : null;
  b.totalR = Math.round(b.totalR * 10) / 10;
  b.rPerTrade = b.count > 0 ? Math.round((b.totalR / b.count) * 1000) / 1000 : null;
  return b;
}

const overall = bucket();
const byYear = {};
const byMonth = Array.from({ length: 12 }, bucket);
const bySymbol = {};
const bySource = {};
for (const t of taken) {
  const d = new Date(t.entryTime + FIXED_EST_TO_UTC_OFFSET_MS);
  add(overall, t);
  add((byYear[d.getUTCFullYear()] ??= bucket()), t);
  add(byMonth[d.getUTCMonth()], t);
  add((bySymbol[t.symbol] ??= bucket()), t);
  add((bySource[t.source] ??= bucket()), t);
}
fin(overall);
Object.values(byYear).forEach(fin);
byMonth.forEach(fin);
Object.values(bySymbol).forEach(fin);
Object.values(bySource).forEach(fin);
const byMonthNamed = {};
MONTH_NAMES.forEach((n, i) => { byMonthNamed[n] = byMonth[i]; });

const first = new Date(taken[0].entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const last = new Date(taken[taken.length - 1].entryTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const summary = {
  generatedAt: new Date().toISOString(),
  method: 'Vrai moteur LiveStrategyEngine rejoué sur l\'historique M1 réel du broker (data/real-m1-full), règlement M1 exact (minute par minute), garde-fous réels rejoués (3 trades/jour, pause 30 min, arrêt du jour), symboles de production sans GER40.',
  coverage: { from: first, to: last, years: Object.keys(byYear).map(Number) },
  symbols: PROD_SYMBOLS,
  riskPctPerTrade: RISK_PCT,
  rUnit: 'R NET : après déduction du spread, avant commission, swap et glissement (non modélisés).',
  caveats: [
    'Le niveau absolu est surestimé : commission, swap et glissement ne sont pas modélisés, les garde-fous sont approximés et le remplissage de l\'ordre est supposé au niveau du signal.',
    'Historique M1 réel disponible seulement depuis 2022-05 (EURUSD, XAUUSD) et 2023-01 (US100, US500) : 2022 est une année partielle sur 2 paires.',
    'Ce n\'est PAS de l\'argent réel : c\'est un rejeu. Les verdicts par mécanisme ou par paire sont instables d\'une période à l\'autre.',
    'PLAFOND OPTIMISTE pour le FVG : ce rejeu suppose l\'ordre LIMIT rempli au niveau du signal. Or le bot réel pose le LIMIT à la clôture et n\'est rempli que si le prix revient : avec ce modèle d\'exécution, le FVG US100 passe de +193 / +186 / +26 R simulés à -449 / -139 / -51 R (2010-2022 / 2023-2025 / 2026), et le combo actuel est négatif (research-memory `fvg-live-execution-gap-2026-09-23`). Ne jamais citer le total ou la ligne « fvg » ci-dessous sans ce point.',
    'Rejeu fidèle 2010-2026 de la config live (research-memory `live-replay-full-2010-2026`) : +326 R à l\'entraînement 2010-2022, mais environ 0 depuis 2023 (+21,6 R sur 2023-2025, -13,3 R en 2026). Les tableaux ci-dessous (M1 exact, remplissage au niveau du signal) donnent des chiffres bien plus hauts pour 2023-2026 : les deux modèles ne s\'accordent pas, donc ne pas les lire comme la performance attendue.',
    'Les anciens chiffres du résumé (2009-2025, ~7 200 trades, ~2 964 R, 30,4 %) étaient un rejeu M15 avec GER40 (retiré du bot le 2026-09-21, négatif dans le vrai moteur) et un R brut sans coûts : ils ne doivent plus être cités.',
  ],
  vetoedByGuardrails: vetoed,
  maxDrawdownPct: Math.round(maxDd * 10) / 10,
  overall,
  byYear,
  byMonth: byMonthNamed,
  bySymbol,
  bySource,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
console.log(`Résumé écrit dans ${OUT_PATH}`);
console.log(`${overall.count} trades, ${overall.totalR >= 0 ? '+' : ''}${overall.totalR} R net (${overall.rPerTrade} R/trade), ${overall.winRatePct} % de réussite, baisse max ${summary.maxDrawdownPct} %, ${vetoed} vétos.`);
