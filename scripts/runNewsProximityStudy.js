#!/usr/bin/env node
// runNewsProximityStudy.js
// Usage: node --max-old-space-size=4096 scripts/runNewsProximityStudy.js
//
// Esdras (2026-09-21) - "étage 1" of the macro plan: does the bot's edge change around scheduled red news? Uses the official
// 2019-2025 calendar (CPI, NFP, FOMC, GDP advance, PCE; ECB and retail sales are left out because they only exist from 2024).
// Pre-registered, 3 buckets: POST (entry 0-2 h AFTER an event), PRE (entry within 2 h BEFORE an event), REST. Plus, for POST, the
// event kind (FOMC / CPI / NFP / other). A bucket is a FINDING only if |t| >= 2.6 on the training years (2019-2023), the same
// sign on 2024-2025, and the same sign under both stop/target tie rules (M15 cannot order them inside a candle).
// Trades: the bot's 8 mechanisms, own stops, one open position per mechanism, spread included, viability filter (stop >= 3x spread).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { newsCalendar } from '../src/backtest/newsCalendar.js';
import { buildTrades, unitOf } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2024, 0, 1), FROM = Date.UTC(2019, 0, 1);
const HOUR = 3600000;
const { all, cache } = buildTrades(SYMBOLS, (s) => loadCandlesFromCsv(path.join('data/backtest-input', `${s}.csv`)).candles, () => {});

const KINDS = new Set(['CPI', 'NFP', 'FOMC', 'PIB', 'PCE']);
// events in ENGINE time (real UTC - 5 h), the same clock as the trades
const events = newsCalendar().filter((e) => KINDS.has(e.label) && e.time - FIXED_EST_TO_UTC_OFFSET_MS >= FROM).map((e) => ({ t: e.time - FIXED_EST_TO_UTC_OFFSET_MS, kind: e.label })).sort((a, b) => a.t - b.t);
const lower = (x) => { let lo = 0, hi = events.length; while (lo < hi) { const m = (lo + hi) >> 1; if (events[m].t >= x) hi = m; else lo = m + 1; } return lo; };

function settle(t) {
  const cs = cache[t.symbol]; const stop = t.entry - t.dir * t.dist; const tp = t.entry + t.dir * t.dist * t.rr;
  for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
    const c = cs[i]; const hs = t.dir === 1 ? c.low <= stop : c.high >= stop; const ht = t.dir === 1 ? c.high >= tp : c.low <= tp;
    if (hs && ht) return { s: -1, tg: t.rr, exit: c.time };
    if (hs) return { s: -1, tg: -1, exit: c.time };
    if (ht) return { s: t.rr, tg: t.rr, exit: c.time };
  }
  const c = cs[Math.min(cs.length - 1, t.i0 + 479)]; const r = (t.dir * (c.close - t.entry)) / t.dist; return { s: r, tg: r, exit: c.time };
}
const openUntil = {}; const rows = [];
for (const t of all) {
  if (t.time < FROM) continue;
  const spread = DEFAULT_SPREADS[t.symbol] ?? 0; if (spread > 0 && t.dist < 3 * spread) continue;
  const u = unitOf(t); if ((openUntil[u] ?? -1) > t.time) continue;
  const res = settle(t); openUntil[u] = res.exit;
  const k = lower(t.time); const next = events[k], prev = events[k - 1];
  const sinceH = prev ? (t.time - prev.t) / HOUR : Infinity, untilH = next ? (next.t - t.time) / HOUR : Infinity;
  const bucket = sinceH >= 0 && sinceH < 2 ? 'POST' : untilH > 0 && untilH <= 2 ? 'PRE' : 'REST';
  const cost = spread / t.dist;
  rows.push({ time: t.time, unit: u, rS: res.s - cost, rT: res.tg - cost, bucket, kind: bucket === 'POST' ? prev.kind : bucket === 'PRE' ? next.kind : null });
}
const train = rows.filter((r) => r.time < CUT), test = rows.filter((r) => r.time >= CUT);
const stat = (a, k) => { const n = a.length; if (!n) return { n: 0, mean: 0, t: 0 }; const m = a.reduce((s, r) => s + r[k], 0) / n; const sd = Math.sqrt(a.reduce((s, r) => s + (r[k] - m) ** 2, 0) / Math.max(1, n - 1)); return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0 }; };
const fmt = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);
const groups = { 'Tous les trades': () => true, 'REST (loin des annonces)': (r) => r.bucket === 'REST', 'POST : 0-2 h après une annonce': (r) => r.bucket === 'POST', 'PRE : 2 h avant une annonce': (r) => r.bucket === 'PRE', 'POST · FOMC': (r) => r.bucket === 'POST' && r.kind === 'FOMC', 'POST · CPI': (r) => r.bucket === 'POST' && r.kind === 'CPI', 'POST · NFP': (r) => r.bucket === 'POST' && r.kind === 'NFP', 'POST · PIB/PCE': (r) => r.bucket === 'POST' && (r.kind === 'PIB' || r.kind === 'PCE') };
const md = ['# Les annonces macro changent-elles la performance du bot ? (étage 1)', '',
  `${rows.length} trades indépendants 2019-2025, stops d'origine, spread inclus, ${events.length} annonces officielles (CPI, emplois, Fed, PIB avancé, PCE ; sans BCE ni ventes au détail). **Trouvaille = |t| ≥ 2,6 sur 2019-2023, même signe sur 2024-2025, même signe avec les deux règles d'égalité stop/objectif.**`, '',
  '| Groupe | Trades (entr. / test) | R moyen entr. : stop d\'abord / objectif d\'abord | t (entr.) | R moyen test (stop d\'abord / objectif d\'abord) | Trouvaille ? |', '|---|---|---|---|---|---|'];
const found = [];
for (const [name, f] of Object.entries(groups)) {
  const a = train.filter(f), b = test.filter(f); const sS = stat(a, 'rS'), sT = stat(a, 'rT'), tS = stat(b, 'rS'), tT = stat(b, 'rT');
  const sg = Math.sign; const ok = name !== 'Tous les trades' && a.length >= 30 && Math.abs(sS.t) >= 2.6 && sg(sS.mean) === sg(sT.mean) && sg(tS.mean) === sg(sS.mean) && sg(tT.mean) === sg(sS.mean);
  if (ok) found.push(name);
  md.push(`| ${name} | ${a.length} / ${b.length} | ${fmt(sS.mean)} / ${fmt(sT.mean)} | ${sS.t.toFixed(1)} | ${fmt(tS.mean)} / ${fmt(tT.mean)} | ${name === 'Tous les trades' ? '—' : ok ? '**OUI**' : 'non'} |`);
}
md.push('', `**Trouvailles retenues : ${found.length ? found.join(', ') : 'aucune'}.**`, '', '## Limites', '', '- Calendrier 2019-2025 sans BCE (2024+ seulement) ni ventes au détail ; heures BEA supposées à 08:30 ET ; annonces non programmées absentes.', '- Règlement M15 borné par les deux règles d\'égalité ; entrées des modules de backtest ; pas de valeurs macro (chiffres publiés) ni de « surprise » : seulement la proximité temporelle.', '- 8 groupes définis à l\'avance ; toute nouvelle coupe ajoutée après coup augmenterait le risque de hasard.');
fs.writeFileSync('data/backtest-input/news-proximity-2019-2025.md', md.join('\n')); console.log(md.join('\n'));
