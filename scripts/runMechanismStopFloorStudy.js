#!/usr/bin/env node
// runMechanismStopFloorStudy.js
// Usage: node --max-old-space-size=4096 scripts/runMechanismStopFloorStudy.js
//
// Esdras (2026-09-20): "fais le test sur toutes les annees, c'est le moment decisif pour voir si on va continuer
// avec le trading ou non". The 7 real months suggested that a WIDER stop (floor of k x ATR14 on M15, same R:R)
// beats the structure stop the mechanisms use today (+7 % -> +26 % / +40 %), but that was 7 months, 7 variants
// tried, no train/test split. This runs the same question on the whole 2010-2025 history.
//
// What is run: the bot's 8 mechanisms on the pairs where each really trades (replaySignals.js BOT_MECHANISMS ->
// raw trades: entry time/price, structure stop, target). Every trade is then RE-RESOLVED here with one honest
// rule for every variant:
//   - entry at the trade's entry price, judged from its OWN candle on (a stop touched in the entry candle is a
//     loss; when stop and target are in the same candle the stop wins - the project's rule);
//   - stop distance d = max(structure stop distance, k x ATR14(M15) before the entry); target = same R:R as the
//     mechanism's own (target distance scales with d); a trade is only taken if d >= 3 x spread (the bot's own
//     viability filter); spread paid once as spread / d (the project's cost convention);
//   - a light version of the live guardrails, identical for every variant: one open position per symbol, at most
//     3 trades a day, 30 min pause after a loss, no new trade once the day is at -4R (= -2 % at 0.5 % risk).
// k = 0 is today's stop. Results: trades, win rate, total net R, R per year, train (<= 2023) vs test (2024+),
// max drawdown in R, and the account at 0.5 % risk compounded (no ceiling).
//
// Limits (also printed): raw entries come from the backtest modules (a limit entry is assumed filled at its price);
// constant spreads; concurrency/guard is approximate; results are net of nothing else (no slippage/rollover
// widening).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { BOT_MECHANISMS, runReplayStrategy } from '../src/backtest/replaySignals.js';
import { CONFIG } from '../src/config.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';

const DIR = 'data/backtest-input';
const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const KS = [0, 1, 1.5, 2, 3];
const CUT = Date.UTC(2024, 0, 1);
const DAY = 86400000;
const PRIORITY = Object.fromEntries(BOT_MECHANISMS.map((m, i) => [`bot-${m.id.replace('bot-', '')}`, i]));

const rrOf = (id) => ({ 'bot-fvg': null, 'bot-divergence': CONFIG.divergence?.rrMultiple ?? 3 }[id] ?? null);

const effective = buildEffectiveConfig({ id: 'stop-floor', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: 0.5 });
// FTMO 1-Step attempts over the trade list (project GuardrailEngine: +10 % target, trailing end-of-day 10 % max loss), 10 000 $ each, 0.5 % risk
function ftmoAttempts(list) {
  let g = null, bal = 10000, pass = 0, fail = 0, cur = null; const durations = [];
  for (const t of list) {
    if (!g) { g = new GuardrailEngine({ ...effective.guardrails, targetPct: 10 }); bal = 10000; g.setBalance(bal, t.exit); cur = t.exit; }
    const pnl = bal * 0.005 * t.net; bal += pnl;
    g.recordTrade({ pnl, time: t.exit, balanceAfter: bal, symbol: t.symbol });
    const st = g.getStatus(t.exit, t.symbol);
    if (st.targetReached) { pass++; durations.push((t.exit - cur) / DAY); g = null; }
    else if (st.overallDrawdownBreached) { fail++; g = null; }
  }
  durations.sort((a, b) => a - b);
  return { pass, fail, medDays: durations.length ? durations[Math.floor(durations.length / 2)] : null };
}
const load = (s) => loadCandlesFromCsv(path.join(DIR, `${s}.csv`)).candles;

// ---- 1) raw trades per symbol, with the ATR14 at entry and the entry candle index
const all = [];
const cache = {};
for (const symbol of SYMBOLS) {
  cache[symbol] ??= load(symbol);
  const candles = cache[symbol];
  const ids = BOT_MECHANISMS.filter((m) => m.symbolsOf().includes(symbol));
  const tr = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  const atrAt = (i) => { let a = 0, k = 0; for (let j = Math.max(1, i - 13); j <= i; j++) { a += tr[j]; k++; } return k ? a / k : 0; };
  const indexOf = new Map(candles.map((c, i) => [c.time, i]));
  for (const m of ids) {
    let partner = null;
    if (m.needsPartner) { const p = m.partnerOf(symbol); cache[p] ??= load(p); partner = cache[p]; }
    const list = runReplayStrategy(m.id, candles, symbol, partner) ?? [];
    let kept = 0;
    for (const t of list) {
      const i0 = indexOf.get(t.entryTime);
      if (i0 === undefined || i0 < 20) continue;
      const dist = Math.abs(t.entryPrice - t.stopPrice);
      if (!(dist > 0)) continue;
      let tdist = Number.isFinite(t.targetPrice) && t.targetPrice !== null ? Math.abs(t.targetPrice - t.entryPrice) : null;
      if (tdist === null) { const rr = rrOf(m.id) ?? 3; tdist = rr * dist; }
      all.push({ symbol, id: m.id, dir: t.direction === 'bullish' ? 1 : -1, time: t.entryTime, i0, entry: t.entryPrice, dist, rr: tdist / dist, atr: atrAt(i0 - 1) });
      kept++;
    }
    console.error(`  ${symbol} ${m.id}: ${list.length} raw trades, ${kept} usable`);
  }
}
all.sort((a, b) => a.time - b.time || PRIORITY[a.id] - PRIORITY[b.id]);
console.error(`total raw trades: ${all.length}`);

// ---- 2) resolve one trade under a stop distance
function resolve(t, d) {
  const cs = cache[t.symbol];
  const stop = t.entry - t.dir * d;
  const tp = t.entry + t.dir * d * t.rr;
  for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
    const c = cs[i];
    if (t.dir === 1 ? c.low <= stop : c.high >= stop) return { r: -1, exit: c.time };
    if (t.dir === 1 ? c.high >= tp : c.low <= tp) return { r: t.rr, exit: c.time };
  }
  const c = cs[Math.min(cs.length - 1, t.i0 + 479)];
  return { r: (t.dir * (c.close - t.entry)) / d, exit: c.time };
}

// ---- 3) a set of trades under a per-unit floor k, with the light guardrails (guards=false: a unit alone, only the
// one-open-position-per-symbol rule)
const unitOf = (t) => `${t.symbol} ${t.id.replace('bot-', '')}`;
function simulate(kOf, include = null, guards = true) {
  const openUntil = {};
  const dayCount = new Map(); const dayR = new Map();
  const closedLosses = [];
  const out = [];
  for (const t of all) {
    const u = unitOf(t);
    if (include && !include.has(u)) continue;
    const k = kOf(u);
    const d = k ? Math.max(t.dist, k * t.atr) : t.dist;
    const spread = DEFAULT_SPREADS[t.symbol] ?? 0;
    if (spread > 0 && d < 3 * spread) continue;
    const key = guards ? t.symbol : u;
    if ((openUntil[key] ?? -1) > t.time) continue;
    const day = Math.floor(t.time / DAY);
    if (guards) {
      if ((dayCount.get(day) ?? 0) >= 3) continue;
      if ((dayR.get(day) ?? 0) <= -4) continue;
      if (closedLosses.some((x) => x <= t.time && t.time < x + 30 * 60000)) continue;
    }
    const res = resolve(t, d);
    const net = res.r - spread / d;
    openUntil[key] = res.exit;
    if (guards) {
      dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
      dayR.set(day, (dayR.get(day) ?? 0) + (res.exit - t.time < DAY ? net : 0));
      if (net < 0) { closedLosses.push(res.exit); if (closedLosses.length > 400) closedLosses.splice(0, 200); }
    }
    out.push({ ...t, net, exit: res.exit, unit: u, k });
  }
  return out;
}

const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const units = [...new Set(all.map(unitOf))];
const stat = (list) => {
  const n = list.length; if (!n) return { n: 0, sum: 0, mean: 0, t: 0, wr: 0 };
  const sum = list.reduce((s, x) => s + x.net, 0), mean = sum / n;
  const sd = Math.sqrt(list.reduce((s, x) => s + (x.net - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0, wr: list.filter((x) => x.net > 0).length / n * 100 };
};
const split = (list) => ({ all: stat(list), train: stat(list.filter((x) => x.time < CUT)), test: stat(list.filter((x) => x.time >= CUT)) });
const yearsPositive = (list) => { const by = {}; for (const x of list) { const y = new Date(x.time).getUTCFullYear(); by[y] = (by[y] ?? 0) + x.net; } const ys = Object.values(by); return { pos: ys.filter((v) => v > 0).length, of: ys.length }; };

// per unit x k, each unit ALONE
const table = {};
for (const u of units) { table[u] = {}; for (const k of KS) { const tr = simulate(() => k, new Set([u]), false); table[u][k] = { ...split(tr), yrs: yearsPositive(tr) }; } }

// decision rule, TRAIN ONLY (<= 2023): best floor = highest train mean R per trade; GARDER if that train mean > 0 and t >= 1.5;
// COUPER if the best train mean is <= 0 (no floor rescues it in training); otherwise A SURVEILLER
const verdict = {};
for (const u of units) {
  let bestK = 0, best = -Infinity;
  for (const k of KS) { const m = table[u][k].train.mean; if (table[u][k].train.n >= 30 && m > best) { best = m; bestK = k; } }
  const b = table[u][bestK].train;
  const label = b.n < 30 ? 'trop peu de trades' : b.mean > 0 && b.t >= 1.5 ? 'GARDER' : b.mean > 0 ? 'A SURVEILLER' : 'COUPER';
  verdict[u] = { bestK, label };
}

const md = [];
md.push('# Mécanisme par mécanisme : qui tire vers le bas, qui garde, quel plancher de stop', '');
md.push('Chaque mécanisme (paire + stratégie) est joué SEUL sur 2010-2025 (une position à la fois par mécanisme), avec 5 planchers de stop (0 = stop d\'origine, sinon k × ATR14 M15, même R:R), entrée jugée dès sa bougie, spread inclus, filtre « stop ≥ 3× le spread ». **Décision prise sur l\'entraînement seul (≤ 2023)** ; le test (2024+) sert à vérifier. Règle : meilleur plancher = plus haut R moyen par trade à l\'entraînement ; GARDER si ce R moyen > 0 avec t ≥ 1,5 ; COUPER s\'il est ≤ 0 pour tous les planchers ; sinon A SURVEILLER.', '');
md.push('| Mécanisme | Verdict (entraînement) | Meilleur plancher | Entraînement : trades / R total / R par trade / t | Test 2024+ : trades / R total / R par trade | Stop d\'origine : R total (entr. / test) | Années positives (meilleur plancher) |', '|---|---|---|---|---|---|---|');
for (const u of units) {
  const v = verdict[u], b = table[u][v.bestK], o = table[u][0];
  md.push(`| ${u} | **${v.label}** | ${v.bestK ? v.bestK + '× ATR' : 'origine'} | ${b.train.n} / ${fmt(b.train.sum)} / ${fmt(b.train.mean, 3)} / ${b.train.t.toFixed(1)} | ${b.test.n} / ${fmt(b.test.sum)} / ${fmt(b.test.mean, 3)} | ${fmt(o.train.sum)} / ${fmt(o.test.sum)} | ${b.yrs.pos}/${b.yrs.of} |`);
}
md.push('', '## Détail : R moyen par trade, par plancher (entraînement · test)', '', `| Mécanisme | ${KS.map((k) => (k ? k + '× ATR' : 'origine')).join(' | ')} |`, `|---|${KS.map(() => '---').join('|')}|`);
for (const u of units) md.push(`| ${u} | ${KS.map((k) => `${fmt(table[u][k].train.mean, 3)} · ${fmt(table[u][k].test.mean, 3)}`).join(' | ')} |`);

// portfolios, judged on the TEST window (2024+) only for the selected one
const keep = new Set(units.filter((u) => verdict[u].label === 'GARDER' || verdict[u].label === 'A SURVEILLER'));
const keepStrict = new Set(units.filter((u) => verdict[u].label === 'GARDER'));
const ports = [
  ['Tout, stop d\'origine (le bot aujourd\'hui)', () => 0, null],
  ['Tout, plancher 2× ATR partout', () => 2, null],
  ['Sans les mécanismes à COUPER, meilleur plancher par mécanisme', (u) => verdict[u].bestK, keep],
  ['Seulement les GARDER, meilleur plancher par mécanisme', (u) => verdict[u].bestK, keepStrict],
];
md.push('', '## Portefeuilles (garde-fous simplifiés du bot : 1 position par paire, 3 trades/jour, pause 30 min après perte)', '', '| Portefeuille | Mécanismes | Entraînement (R) | **Test 2024+ (R, trades)** | Compte 10 000 $ sur le test (0,5 %) | Pire baisse du test | Défis FTMO sur le test (réussis / échoués) |', '|---|---|---|---|---|---|---|');
const testCut = (list) => list.filter((t) => t.time >= CUT).sort((a, b) => a.exit - b.exit);
for (const [name, kOf, inc] of ports) {
  const tr = simulate(kOf, inc, true);
  const te = testCut(tr); const trn = tr.filter((t) => t.time < CUT);
  let bal = 10000, peak = 10000, dd = 0; for (const t of te) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const f = ftmoAttempts(te);
  md.push(`| ${name} | ${inc ? inc.size : units.length} | ${fmt(trn.reduce((s, t) => s + t.net, 0))} | **${fmt(te.reduce((s, t) => s + t.net, 0))}** (${te.length}) | $${bal.toFixed(0)} | ${dd.toFixed(0)} % | ${f.pass} / ${f.fail} |`);
}
md.push('', '## Limites', '', '- Un mécanisme joué seul ignore les interactions du portefeuille (il peut manquer de trades quand un autre occupe la paire).', '- Le test 2024-2025 ne contient que ~2 ans : quelques dizaines de trades par mécanisme, donc un verdict « test » sur un seul mécanisme est bruité.', '- Entrées issues des modules de backtest ; spread constant ; pas de glissement ni d\'élargissement du spread au rollover.');
const out = path.join('data', 'backtest-input', 'mechanisms-stop-floor-2010-2025.md');
fs.writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
console.error(`Wrote ${out}`);
