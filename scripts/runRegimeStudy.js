#!/usr/bin/env node
// runRegimeStudy.js
// Usage: node --max-old-space-size=4096 scripts/runRegimeStudy.js
//
// Esdras (2026-09-20, "lance le test") - the one experiment kept from the friend's "AI trading lab" brainstorm: does the
// bot's edge depend on the MARKET REGIME? Pre-registered, deliberately small, to keep data snooping low:
//   dimensions (each known BEFORE the entry, terciles cut on the training years <= 2023 only):
//     V  volatility     = ATR14 / long-run true range (last 20 days)      -> low / mid / high
//     T  trend strength = |5-day move| / (ATR14 x sqrt(480))              -> range / mixed / trending
//     A  alignment      = the trade's direction vs the 5-day move          -> with-trend / counter-trend
//   => 8 buckets. A bucket only counts as a FINDING when, cumulatively: |t| >= 2.6 on the training years (Bonferroni-like
//   for 8 buckets), the SAME sign on 2024+, and the same sign under BOTH tie rules below.
// The 15-year trade lists come from the bot's 8 mechanisms (raw entries, own stops). Because the M15 series cannot say
// whether the stop or the target came first inside one candle (the M1 check of 2026-09-20 showed this rule moves results),
// every trade is settled TWICE: "stop first" and "target first" - the truth lies between; a regime effect that only
// exists under one rule is not trusted.
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { buildTrades, unitOf } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2024, 0, 1);
const { all, cache } = buildTrades(SYMBOLS, (s) => loadCandlesFromCsv(path.join('data/backtest-input', `${s}.csv`)).candles, () => {});

// prefix sums of the true range per symbol
const pre = {};
for (const s of SYMBOLS) { const cs = cache[s]; const p = new Float64Array(cs.length + 1); for (let i = 0; i < cs.length; i++) { const tr = i ? Math.max(cs[i].high - cs[i].low, Math.abs(cs[i].high - cs[i - 1].close), Math.abs(cs[i].low - cs[i - 1].close)) : cs[i].high - cs[i].low; p[i + 1] = p[i] + tr; } pre[s] = p; }
const avgTr = (s, a, b) => (pre[s][b + 1] - pre[s][a]) / (b - a + 1); // inclusive indices

// settle a trade under both tie rules (same path)
function settle(t) {
  const cs = cache[t.symbol]; const stop = t.entry - t.dir * t.dist; const tp = t.entry + t.dir * t.dist * t.rr;
  for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
    const c = cs[i]; const hs = t.dir === 1 ? c.low <= stop : c.high >= stop; const ht = t.dir === 1 ? c.high >= tp : c.low <= tp;
    if (hs && ht) return { stopFirst: -1, targetFirst: t.rr, exit: c.time };
    if (hs) return { stopFirst: -1, targetFirst: -1, exit: c.time };
    if (ht) return { stopFirst: t.rr, targetFirst: t.rr, exit: c.time };
  }
  const c = cs[Math.min(cs.length - 1, t.i0 + 479)]; const r = (t.dir * (c.close - t.entry)) / t.dist;
  return { stopFirst: r, targetFirst: r, exit: c.time };
}

// one open position per mechanism (unit), no daily caps: regime analysis wants every independent signal
const openUntil = {}; const rows = [];
for (const t of all) {
  const i = t.i0 - 1; if (i < 1920 + 480) continue;
  const spread = DEFAULT_SPREADS[t.symbol] ?? 0; if (spread > 0 && t.dist < 3 * spread) continue;
  const u = unitOf(t); if ((openUntil[u] ?? -1) > t.time) continue;
  const res = settle(t); openUntil[u] = res.exit;
  const cs = cache[t.symbol]; const atr = avgTr(t.symbol, i - 13, i); const longTr = avgTr(t.symbol, i - 1919, i);
  const move = cs[i].close - cs[i - 480].close;
  const cost = spread / t.dist;
  rows.push({ time: t.time, unit: u, rS: res.stopFirst - cost, rT: res.targetFirst - cost, vol: atr / longTr, trend: Math.abs(move) / (atr * Math.sqrt(480)), aligned: Math.sign(move) === t.dir });
}
const train = rows.filter((r) => r.time < CUT), test = rows.filter((r) => r.time >= CUT);
const cuts = (arr, key) => { const v = arr.map((r) => r[key]).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]]; };
const vc = cuts(train, 'vol'), tc = cuts(train, 'trend');
const bucketOf = {
  'V basse': (r) => r.vol < vc[0], 'V moyenne': (r) => r.vol >= vc[0] && r.vol < vc[1], 'V haute': (r) => r.vol >= vc[1],
  'T range': (r) => r.trend < tc[0], 'T mixte': (r) => r.trend >= tc[0] && r.trend < tc[1], 'T tendance': (r) => r.trend >= tc[1],
  'A avec la tendance': (r) => r.aligned, 'A contre la tendance': (r) => !r.aligned,
};
const stat = (a, k) => { const n = a.length; if (!n) return { n: 0, mean: 0, t: 0 }; const m = a.reduce((s, r) => s + r[k], 0) / n; const sd = Math.sqrt(a.reduce((s, r) => s + (r[k] - m) ** 2, 0) / Math.max(1, n - 1)); return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0 }; };
const fmt = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);
const md = ['# Test de régime de marché : le bot marche-t-il différemment selon le contexte ?', '',
  `${rows.length} signaux indépendants (un par mécanisme à la fois), 2010-2025, stops d'origine, spread inclus. Seuils des régimes calés sur l'entraînement (≤ 2023) : volatilité ${vc.map((x) => x.toFixed(2)).join(' / ')}, force de tendance ${tc.map((x) => x.toFixed(2)).join(' / ')}.`,
  'Chaque trade est réglé deux fois (stop d\'abord / objectif d\'abord dans une même bougie M15) : la vérité est entre les deux. **Trouvaille = |t| ≥ 2,6 à l\'entraînement, même signe sur 2024+, même signe avec les deux règles.**', '',
  '| Régime | Trades (entr. / test) | R moyen entr. : stop d\'abord | R moyen entr. : objectif d\'abord | t (entr.) | R moyen test 2024+ (stop d\'abord / objectif d\'abord) | Trouvaille ? |', '|---|---|---|---|---|---|---|'];
const findings = [];
md.push(`| **Tous les trades** | ${train.length} / ${test.length} | ${fmt(stat(train, 'rS').mean)} | ${fmt(stat(train, 'rT').mean)} | ${stat(train, 'rS').t.toFixed(1)} | ${fmt(stat(test, 'rS').mean)} / ${fmt(stat(test, 'rT').mean)} | — |`);
for (const [name, f] of Object.entries(bucketOf)) {
  const a = train.filter(f), b = test.filter(f);
  const sS = stat(a, 'rS'), sT = stat(a, 'rT'), tS = stat(b, 'rS'), tT = stat(b, 'rT');
  const sign = (x) => Math.sign(x);
  const ok = Math.abs(sS.t) >= 2.6 && sign(sS.mean) === sign(sT.mean) && sign(tS.mean) === sign(sS.mean) && sign(tT.mean) === sign(sS.mean);
  if (ok) findings.push(name);
  md.push(`| ${name} | ${a.length} / ${b.length} | ${fmt(sS.mean)} | ${fmt(sT.mean)} | ${sS.t.toFixed(1)} | ${fmt(tS.mean)} / ${fmt(tT.mean)} | ${ok ? '**OUI**' : 'non'} |`);
}
// per year stability of the strongest candidates, and per mechanism for the alignment dimension
md.push('', `**Trouvailles retenues : ${findings.length ? findings.join(', ') : 'aucune'}.**`, '');
md.push('## Alignement avec la tendance sur 5 jours, par mécanisme (R moyen, stop d\'abord ; entraînement · test)', '', '| Mécanisme | Avec la tendance | Contre la tendance |', '|---|---|---|');
for (const u of [...new Set(rows.map((r) => r.unit))].sort()) {
  const cell = (al) => { const a = train.filter((r) => r.unit === u && r.aligned === al), b = test.filter((r) => r.unit === u && r.aligned === al); return `${fmt(stat(a, 'rS').mean, 2)} (${a.length}) · ${fmt(stat(b, 'rS').mean, 2)} (${b.length})`; };
  md.push(`| ${u} | ${cell(true)} | ${cell(false)} |`);
}
md.push('', '## Limites', '', '- Entrées des modules de backtest, règlement M15 (borné par les deux règles) : les niveaux absolus sont incertains, les DIFFÉRENCES entre régimes le sont moins.', '- Seulement 3 dimensions et 8 seaux, définis avant de regarder les résultats ; toute nouvelle dimension ajoutée après coup augmenterait le risque de trouver du hasard.', '- Un régime « défavorable » ne justifie pas d\'arrêter le bot avant une vérification en démo.');
const out = 'data/backtest-input/regime-study-2010-2025.md';
fs.writeFileSync(out, md.join('\n')); console.log(md.join('\n'));
