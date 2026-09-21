#!/usr/bin/env node
// runM1Backtest16Months.js
// Usage: node --max-old-space-size=4096 scripts/runM1Backtest16Months.js
//
// Esdras (2026-09-21): le broker (FP Markets via cTrader) a livre 245 jours de M1 de plus (mai 2025 -> janv. 2026, data/real-m1-2025) en plus des
// 7 mois deja la (data/real-m1). Ici : combo INCHANGE, ~16 mois reels en M1 EXACT, decoupe chronologique.
// Les M15 sont reconstruits depuis le M1 (agregation par tranche UTC de 15 min) pour tout le periode : un seul pipeline, pas de raccord.
// Memes hypotheses de simulation que scripts/runFinalBacktestReport.js (garde-fous approximes) : lire les DIFFERENCES entre periodes,
// pas le niveau absolu (le vrai moteur donne environ +31 % sur 7 mois, cette simulation +53 %).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const shift = (cs) => cs.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));

const m1Real = {};
for (const s of SYMBOLS) {
  const m = new Map();
  for (const dir of ['data/real-m1-2025', 'data/real-m1']) for (const c of loadCandlesFromCsv(path.join(dir, `${s}.csv`)).candles) m.set(c.time, c);
  m1Real[s] = shift([...m.values()].sort((a, b) => a.time - b.time));
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
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Real[s])]));
const m1 = {};
for (const s of SYMBOLS) { const cs = m1Real[s]; m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }

const real = buildTrades(SYMBOLS, (s) => m15[s], () => {});
const sim = makeSimulator(real);
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function resolveM1(t, d) {
  const S = m1[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const c0 = real.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
  let fill = -1;
  if (Math.abs(t.entry - c0.open) <= 1e-9 * Math.max(1, Math.abs(c0.open))) fill = start < S.n ? start : -1; else for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) { if (t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop) return { r: -1, exit: S.t[i] }; if (t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp) return { r: t.rr, exit: S.t[i] }; }
  return { r: (t.dir * (S.c[maxI - 1] - t.entry)) / d, exit: S.t[maxI - 1] };
}
function summarize(list) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, win: list.length ? list.filter((t) => t.net > 0).length / list.length * 100 : 0, bal, dd, f: ftmoAttempts(list) };
}
const row = (l, r) => `| ${l} | ${r.n} | ${r.win.toFixed(0)} % | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} |`;
const first = Math.max(...SYMBOLS.map((s) => m1Real[s][0].time));
const from = first + 30 * 86400000; // 30 jours de chauffe (biais H4/EMA200, divergence)
const all = sim(() => 0, null, { fromTime: from, resolver: resolveM1 });
const last = Math.max(...all.map((t) => t.exit));
const day = (t) => new Date(t + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const md = ['# Combo inchangé sur ~16 mois réels, M1 exact', '', `Données : bougies M1 réelles FP Markets (2025-05-16 → 2026-09-18), M15 reconstruits du M1, 30 jours de chauffe ignorés (${day(from)} → ${day(last)}). Mêmes garde-fous approximés que \`runFinalBacktestReport.js\` : lire les différences entre périodes, le niveau absolu est surestimé (~+53 % ici contre ~+31 % pour le vrai moteur sur les 7 derniers mois).`, '',
  '| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
md.push(row('**Tout**', summarize(all)));
const cut = Date.UTC(2026, 0, 16) - FIXED_EST_TO_UTC_OFFSET_MS;
md.push(row('Période NOUVELLE (avant 16 janv. 2026)', summarize(all.filter((t) => t.time < cut))));
md.push(row('Période déjà vue (16 janv. → sept. 2026)', summarize(all.filter((t) => t.time >= cut))));
md.push('', '## Mois par mois', '', '| Mois | Trades | R net | R / trade |', '|---|---|---|---|');
const months = new Map();
for (const t of all) { const k = new Date(t.time + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 7); (months.get(k) ?? months.set(k, []).get(k)).push(t); }
let pos = 0;
for (const [k, l] of [...months.entries()].sort()) { const r = summarize(l); if (r.sum > 0) pos++; md.push(`| ${k} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} |`); }
md.push('', `Mois positifs : ${pos} sur ${months.size}.`, '', '## Par paire', '', '| Paire | Trades | R net | R / trade |', '|---|---|---|---|');
for (const s of SYMBOLS) { const r = summarize(all.filter((t) => t.symbol === s)); md.push(`| ${s} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} |`); }
md.push('', '## Limites', '', '- Combo inchangé, rien n\'est choisi sur cette période : la partie mai 2025 → janvier 2026 est un vrai échantillon hors de tout réglage récent (mais 2010-2025 avait servi à bâtir le combo).', '- Non modélisés : commissions, swap, glissement, spread réel variable. Garde-fous approximés.', '- Aucune borne M15 ici : les M15 viennent du M1, le règlement est exact à la minute.');
fs.writeFileSync('data/backtest-input/combo-m1-16-months.md', md.join('\n'));
console.log(md.join('\n'));
