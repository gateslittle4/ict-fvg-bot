#!/usr/bin/env node
// runBtcExploration.js
// Usage: node scripts/runBtcExploration.js
//
// Esdras (2026-09-20, before going to sleep: "lance tout ce que tu peux") - the safe way to look at BTCUSD offered earlier:
// the 22 Labo strategies (default settings) on the broker's real BTCUSD M15 candles (~7 months, no order of any kind),
// split in TIME (first 2/3 = "train", last 1/3 = "test"), each trade settled with BOTH tie rules (stop first / target first).
// With 22 strategies on ~145 trading days this is EXPLORATION, not validation: a strategy is only listed as "worth a
// closer look" when it is positive in BOTH halves under BOTH rules and t >= 2 on the first half; expect false positives.
// Spread assumed 15 USD (BTCUSD spread not measured yet: the demo tracking will record it).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { LAB_STRATEGIES } from '../src/backtest/labRegistry.js';

const SPREAD = 15;
const candles = loadCandlesFromCsv(path.join('data/real-data-2026-09-20', 'BTCUSD.csv')).candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
const idx = new Map(candles.map((c, i) => [c.time, i]));
const splitTime = candles[Math.floor(candles.length * 2 / 3)].time;
const fmt = (x, d = 2) => (x >= 0 ? '+' : '') + x.toFixed(d);

function settle(t) {
  const i0 = idx.get(t.entryTime); if (i0 === undefined) return null;
  const dir = t.direction === 'bullish' ? 1 : -1; const dist = Math.abs(t.entryPrice - t.stopPrice);
  if (!(dist > SPREAD * 3)) return null; // the bot's own viability filter: stop >= 3 x spread
  if (!Number.isFinite(t.targetPrice)) return null;
  const tdist = Math.abs(t.targetPrice - t.entryPrice); const rr = tdist / dist;
  const stop = t.entryPrice - dir * dist, tp = t.entryPrice + dir * tdist;
  for (let i = i0; i < candles.length && i - i0 < 480; i++) {
    const c = candles[i]; const hs = dir === 1 ? c.low <= stop : c.high >= stop; const ht = dir === 1 ? c.high >= tp : c.low <= tp;
    if (hs && ht) return { time: t.entryTime, rS: -1 - SPREAD / dist, rT: rr - SPREAD / dist };
    if (hs) return { time: t.entryTime, rS: -1 - SPREAD / dist, rT: -1 - SPREAD / dist };
    if (ht) return { time: t.entryTime, rS: rr - SPREAD / dist, rT: rr - SPREAD / dist };
  }
  return null;
}
const stat = (a, k) => { const n = a.length; if (!n) return { n: 0, mean: 0, t: 0 }; const m = a.reduce((s, r) => s + r[k], 0) / n; const sd = Math.sqrt(a.reduce((s, r) => s + (r[k] - m) ** 2, 0) / Math.max(1, n - 1)); return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0 }; };

const rows = [];
for (const [id, s] of Object.entries(LAB_STRATEGIES)) {
  let trades = [];
  try { trades = s.run(candles) ?? []; } catch (e) { rows.push({ id, err: e.message }); continue; }
  const res = trades.map(settle).filter(Boolean);
  const tr = res.filter((r) => r.time < splitTime), te = res.filter((r) => r.time >= splitTime);
  const a = { S: stat(tr, 'rS'), T: stat(tr, 'rT') }, b = { S: stat(te, 'rS'), T: stat(te, 'rT') };
  const ok = a.S.n >= 20 && b.S.n >= 10 && a.S.mean > 0 && a.T.mean > 0 && b.S.mean > 0 && b.T.mean > 0 && a.S.t >= 2;
  rows.push({ id, label: s.label, raw: trades.length, used: res.length, a, b, ok });
}
const md = ['# BTCUSD : exploration des 22 stratégies du Labo (aucun ordre passé)', '',
  `Bougies M15 réelles du broker (${candles.length}), première partie (entraînement) jusqu'au ${new Date(splitTime + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10)}, puis test. Spread supposé ${SPREAD} $ (non mesuré), filtre « stop ≥ 3× le spread », chaque trade réglé avec les deux règles d'égalité. **Exploration, pas validation** : 22 stratégies sur ~145 jours de marché, attendre des faux positifs.`, '',
  '| Stratégie | Trades utilisés (entr. / test) | R moyen entr. (stop d\'abord / objectif d\'abord) | t entr. | R moyen test (stop d\'abord / objectif d\'abord) | A regarder ? |', '|---|---|---|---|---|---|'];
for (const r of rows.sort((x, y) => (y.a?.S.mean ?? -9) - (x.a?.S.mean ?? -9))) {
  if (r.err) { md.push(`| ${r.id} | erreur : ${r.err} | | | | |`); continue; }
  md.push(`| ${r.label} | ${r.a.S.n} / ${r.b.S.n} | ${fmt(r.a.S.mean)} / ${fmt(r.a.T.mean)} | ${r.a.S.t.toFixed(1)} | ${fmt(r.b.S.mean)} / ${fmt(r.b.T.mean)} | ${r.ok ? '**oui**' : 'non'} |`);
}
const worth = rows.filter((r) => r.ok).map((r) => r.label);
md.push('', `**A regarder de plus près (positif dans les deux moitiés et avec les deux règles, t ≥ 2) : ${worth.length ? worth.join(', ') : 'aucune'}.**`, '', 'Limites : environ 7 mois, une seule séparation temporelle, 22 essais (un « oui » peut être du hasard), spread supposé, entrées supposées remplies, BTCUSD ferme le week-end chez ce broker.');
fs.writeFileSync('data/backtest-input/btcusd-exploration-2026.md', md.join('\n'));
console.log(md.join('\n'));
