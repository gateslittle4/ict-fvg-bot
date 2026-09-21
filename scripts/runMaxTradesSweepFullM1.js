#!/usr/bin/env node
// runMaxTradesSweepFullM1.js
// Usage: node --max-old-space-size=4096 scripts/runMaxTradesSweepFullM1.js
//
// Refait l'etude du plafond de trades par jour (data/backtest-input/max-trades-per-day-sweep.md, partie B) sur le M1 SANS TROUS
// (data/real-m1-full). L'ancienne partie B utilisait le M1 v1 (trous de 2 jours tous les 16 jours). Combo inchange, seul le plafond varie :
// 1, 2, 3 (actuel), 4, 5, 6, 8, illimite = 8 variantes, COMPTEES. Entrainement < 2025, test >= 2025, et tranches annuelles 2023-2026.
// Aucune variante n'est adoptee sur ce seul rapport : le combo reste a 3 jusqu'aux donnees de demo.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2025, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - FIXED_EST_TO_UTC_OFFSET_MS;

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
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
const m1Real = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const startOf = Object.fromEntries(SYMBOLS.map((s) => [s, m1Real[s][0].time + 30 * 86400000])); // 30 jours de chauffe par paire
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Real[s])]));
const m1 = {};
for (const s of SYMBOLS) { const cs = m1Real[s]; m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
console.error('donnees chargees');

const built = buildTrades(SYMBOLS, (s) => m15[s], () => {});
const mk = (drop) => makeSimulator({ all: built.all.filter((t) => t.time >= startOf[t.symbol] && !drop.includes(t.symbol)), cache: built.cache });
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function resolveM1(t, d) {
  const S = m1[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const c0 = built.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
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
const HEAD = ['| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
const run = (sim, o = {}) => sim(() => 0, null, { resolver: resolveM1, ...o });

const CAPS = [1, 2, 3, 4, 5, 6, 8, Infinity];
const sim = mk([]);
const runCap = (cap) => sim(() => 0, null, { resolver: resolveM1, maxPerDay: cap });
const key = (t) => `${t.symbol}|${t.id}|${t.time}`;
const lists = new Map(CAPS.map((c) => [c, runCap(c)]));
const base = lists.get(Infinity);
const md = ['# Plafond de trades par jour — refait sur le M1 réel sans trous', '', 'Combo inchangé ; seul le plafond quotidien varie (8 variantes testées, comptées). Données : `data/real-m1-full` (EURUSD/XAUUSD dès 2022-05, indices dès 2023-01), règlement à la minute. Garde-fous approximés, coûts non modélisés : lire les différences entre plafonds, pas les dollars. Remplace la partie B de `max-trades-per-day-sweep.md`, qui utilisait un M1 avec trous.', ''];
const section = (title, filt) => {
  md.push(`## ${title}`, '', ...HEAD.map((h, i) => i === 0 ? h.replace('| Période |', '| Plafond / jour |').replace('| Pire baisse |', '| Pire baisse |') : h), '');
  md.length -= 1;
  for (const cap of CAPS) {
    const l = lists.get(cap).filter(filt); const r = summarize(l);
    md.push(row(cap === 3 ? '**3 (actuel)**' : cap === Infinity ? 'illimité' : String(cap), r));
  }
  const taken = new Set(lists.get(3).filter(filt).map(key));
  const refused = base.filter(filt).filter((t) => !taken.has(key(t)));
  md.push('', `Trades refusés par le plafond de 3 (pris avec « illimité ») : ${refused.length}, R moyen ${refused.length ? fmt(refused.reduce((a, t) => a + t.net, 0) / refused.length, 3) : '—'}.`, '');
};
section('Tout l\'historique', () => true);
section('Entraînement (avant 2025)', (t) => t.time < CUT);
section('Test (2025-01-01 → fin)', (t) => t.time >= CUT);
md.push('## R par trade selon l\'année', '', `| Plafond | ${[2023, 2024, 2025, 2026].join(' | ')} |`, '|---|---|---|---|---|');
for (const cap of CAPS) md.push(`| ${cap === 3 ? '**3**' : cap === Infinity ? 'illimité' : cap} | ${[2023, 2024, 2025, 2026].map((y) => { const l = lists.get(cap).filter((t) => t.time >= eng(y) && t.time < eng(y + 1)); return `${fmt(l.reduce((a, t) => a + t.net, 0) / Math.max(1, l.length), 3)} (${fmt(l.reduce((a, t) => a + t.net, 0), 0)} R)`; }).join(' | ')} |`);
md.push('', '## Limites', '', '- Le vrai garde-fou compte les trades CLÔTURÉS du jour UTC ; ici c\'est le jour calendaire du moteur, approximation.', '- Un plafond protège aussi contre les séries de pertes du même jour : lire la pire baisse et FTMO, pas seulement le R total.', '- 8 variantes comparées : une différence de quelques centièmes de R par trade est dans le bruit.', '- Même période que celle qui a servi à bâtir le combo : remesure, pas preuve indépendante.');
fs.writeFileSync('data/backtest-input/max-trades-per-day-sweep-full-m1.md', md.join('\n'));
console.log(md.join('\n'));
