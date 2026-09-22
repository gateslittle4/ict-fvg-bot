#!/usr/bin/env node
// runRsi2Generalization.js
// Usage: node scripts/runRsi2Generalization.js
// Applique la règle RSI(2) DÉJÀ FIGÉE du lot 3 (aucun réglage) à GER40, UKX, AUX - voir
// data/backtest-input/rsi2-generalization-check-2026-09-22.md. Contrôle de robustesse, pas une nouvelle recherche de paramètres.
import fs from 'node:fs';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const DAY = 86400000, H17 = 17 * 3600000;
const SWAP = 0.0001;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

function daily(m15) {
  const bars = []; let cur = null;
  for (const c of m15) { const key = Math.floor((c.time - H17) / DAY); if (!cur || cur.key !== key) { if (cur) bars.push(cur); cur = { key, time: key * DAY + H17, open: c.open, high: c.high, low: c.low, close: c.close }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } }
  if (cur) bars.push(cur); return bars;
}
function atrSeries(bars, n) { const a = new Array(bars.length).fill(null); const tr = []; for (let i = 0; i < bars.length; i++) { const p = i > 0 ? bars[i - 1].close : bars[i].close; tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - p), Math.abs(bars[i].low - p))); if (i >= n) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += tr[j]; a[i] = s / n; } } return a; }
function smaSeries(bars, n) { const a = new Array(bars.length).fill(null); let s = 0; for (let i = 0; i < bars.length; i++) { s += bars[i].close; if (i >= n) s -= bars[i - n].close; if (i >= n - 1) a[i] = s / n; } return a; }
function rsi2Series(bars) { const r = new Array(bars.length).fill(null); let ag = 0, al = 0; for (let i = 1; i < bars.length; i++) { const d = bars[i].close - bars[i - 1].close; const g = Math.max(d, 0), l = Math.max(-d, 0); if (i === 1) { ag = g; al = l; } else { ag = (ag + g) / 2; al = (al + l) / 2; } if (i >= 2) r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } return r; }

function run(sym, bars) {
  const atr14 = atrSeries(bars, 14), sma200 = smaSeries(bars, 200), sma5 = smaSeries(bars, 5), rsi = rsi2Series(bars);
  const trades = []; let pos = null;
  const spread2 = 2 * (DEFAULT_SPREADS[sym] ?? 0);
  for (let i = 250; i < bars.length - 1; i++) {
    const b = bars[i], nxt = bars[i + 1];
    if (pos && b.low <= pos.stop) { const days = (b.time - pos.entryTime) / DAY; trades.push({ r: -1 - spread2 / pos.dist - SWAP * days * pos.entry / pos.dist, exit: b.time }); pos = null; }
    let exitNext = false;
    if (pos) exitNext = b.close > sma5[i] || i - pos.entered >= 10;
    if (exitNext) { const days = (nxt.time - pos.entryTime) / DAY; const gross = (nxt.open - pos.entry) / pos.dist; trades.push({ r: gross - spread2 / pos.dist - SWAP * days * pos.entry / pos.dist, exit: nxt.time }); pos = null; }
    if (!pos) { if (rsi[i] !== null && rsi[i] < 10 && sma200[i] !== null && b.close > sma200[i]) { const dist = 3 * atr14[i]; if (dist > 0) pos = { entry: nxt.open, entryTime: nxt.time, entered: i + 1, dist, stop: nxt.open - dist }; } }
  }
  return trades;
}
const stats = (l) => { const n = l.length, sum = l.reduce((a, t) => a + t.r, 0), mean = n ? sum / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - mean) ** 2, 0) / (n - 1)) : 0; return { n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0 }; };

const SYMS = ['GER40', 'UKX', 'AUX'];
const md = ['# RSI(2) journalier, règle figée du lot 3, généralisation à d\'autres indices', '', 'Aucun paramètre changé. Coûts : 2× le spread par défaut + swap 0,01 %/jour (même hypothèse que le lot 3).', '', '| Indice | Trades | R net/trade | R total | t | 1re moitié | 2e moitié |', '|---|---|---|---|---|---|---|'];
for (const s of SYMS) {
  const bars = daily(loadCandlesFromCsv(`data/backtest-input/${s}.csv`).candles);
  const trades = run(s, bars);
  const mid = trades.length ? trades[Math.floor(trades.length / 2)].exit : 0;
  const a = trades.filter((t) => t.exit < mid), b = trades.filter((t) => t.exit >= mid);
  const st = stats(trades);
  md.push(`| ${s} | ${st.n} | ${fmt(st.mean, 3)} | ${fmt(st.sum, 1)} | ${st.t.toFixed(2)} | ${fmt(stats(a).sum, 1)} (${a.length}) | ${fmt(stats(b).sum, 1)} (${b.length}) |`);
  console.error(s, JSON.stringify(st));
}
md.push('', '## Limites', '', '- Contrôle de robustesse d\'une règle déjà décidée, pas une nouvelle recherche de paramètres.', '- Historique plus court pour UKX (2018-2025) et AUX (2019-2025) que pour US500/GER40.', '- Swap supposé, non mesuré ; règlement M15 « stop d\'abord ».');
fs.writeFileSync('data/backtest-input/rsi2-generalization-results-2026-09-22.md', md.join('\n'));
console.log(md.join('\n'));
