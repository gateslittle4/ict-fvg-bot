#!/usr/bin/env node
// runCalmNightStudy.js
// Usage : node --max-old-space-size=6144 scripts/runCalmNightStudy.js      (il faut data/histdata-m1, voir buildHistdataM1.js)
//
// Idée d'Esdras « la nuit, le marché est calme » traduite en retour à la moyenne, EXACTEMENT telle que pré-enregistrée dans
// data/backtest-input/preregistration-calm-night-2026-09-24.md (commité AVANT ce script) : nuit 18:00 -> 02:00 NY (contrôles
// 20:00-01:00), contrôle identique en séance 9:30 -> 16:00 (contrôles 10:00-15:00). Clôture M15 à >= 1,5 x ATR14 de la moyenne
// des prix typiques depuis le début de la fenêtre -> pari de retour vers cette moyenne, stop 1,5 x ATR, un trade par fenêtre.
// Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 = M1 du broker. Rapport : data/backtest-input/calm-night-study.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { nyOffsetMs } from './lib/intradayMomentum.js';
import { OFF, refPrice, swapPerUnit } from './lib/m1Data.js';

const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD'];
const PRIMARY = ['US100', 'US500'];
const K = 1.5, ATR_N = 14, M15 = 900000, H = 3600000, DAY = 86400000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['train', 'Entraînement 2010-2022', Y(2010), Y(2023)], ['test', 'Test 2023-2025', Y(2023), Y(2026)], ['fwd', '2026 (→ fin des données)', Y(2026), Y(2027)]];
const HALVES = [[Y(2010), Y(2017)], [Y(2017), Y(2023)]];
// Fenêtres en heures locales NY depuis minuit du jour d'ancrage : début, premier et dernier contrôle, sortie forcée.
const MODES = {
  nuit: { start: 18, firstCheck: 20, lastCheck: 25, exit: 26 },
  seance: { start: 9.5, firstCheck: 10, lastCheck: 15, exit: 16 },
};

function readGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const t = [], o = [], h = [], l = [], c = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(','); pos = end + 1;
    if (p.length < 5) continue;
    t.push(+p[0]); o.push(+p[1]); h.push(+p[2]); l.push(+p[3]); c.push(+p[4]);
  }
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}

/** ATR14 (moyenne simple des vrais ranges) des bougies M15 closes, indexé par l'heure de clôture de la bougie (UTC). */
function atrByClose(S) {
  const bars = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / M15) * M15;
    if (!cur || cur.t !== b) { if (cur) bars.push(cur); cur = { t: b, h: S.h[i], l: S.l[i], c: S.c[i] }; }
    else { if (S.h[i] > cur.h) cur.h = S.h[i]; if (S.l[i] < cur.l) cur.l = S.l[i]; cur.c = S.c[i]; }
  }
  if (cur) bars.push(cur);
  const map = new Map(); const tr = [];
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k], pc = k ? bars[k - 1].c : b.c;
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    if (tr.length > ATR_N) tr.shift();
    if (tr.length === ATR_N) map.set(b.t + M15, { atr: tr.reduce((a, x) => a + x, 0) / ATR_N, close: b.c });
  }
  return map;
}

/** Trades d'une source pour un mode (nuit / séance). */
function tradesFor(sym, S, mode, keep) {
  const M = MODES[mode], atr = atrByClose(S), ref = refPrice(sym);
  const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const out = [];
  let i = 0;
  while (i < S.n) {
    // jour d'ancrage de la barre i et heure locale relative à ce jour
    const local = S.t[i] + nyOffsetMs(S.t[i]);
    let anchor = Math.floor(local / DAY) * DAY; let hr = (local - anchor) / H;
    if (mode === 'nuit' && hr < 2) { anchor -= DAY; hr += 24; }
    if (hr < M.start || hr >= M.exit) { i++; continue; }
    // barres de la fenêtre [start, exit) de ce jour d'ancrage
    const idx = [];
    let j = i;
    for (; j < S.n; j++) {
      const lj = S.t[j] + nyOffsetMs(S.t[j]); const rel = (lj - anchor) / H;
      if (rel < M.start || rel >= M.exit) break;
      idx.push(j);
    }
    i = j;
    if (!idx.length || !keep(S.t[idx[0]])) continue;
    // parcours : moyenne cumulée, contrôles aux clôtures M15, un seul trade
    let sum = 0, cnt = 0, trade = null;
    for (let q = 0; q < idx.length && !trade; q++) {
      const b = idx[q];
      sum += (S.h[b] + S.l[b] + S.c[b]) / 3; cnt++;
      const closeT = S.t[b] + 60000;
      if (closeT % M15 !== 0) continue;
      const rel = (closeT + nyOffsetMs(closeT) - anchor) / H;
      if (rel < M.firstCheck || rel > M.lastCheck) continue;
      const a = atr.get(closeT); if (!a || !(a.atr > 0)) continue;
      const mean = sum / cnt, px = S.c[b];
      const dir = px <= mean - K * a.atr ? 1 : px >= mean + K * a.atr ? -1 : 0;
      if (!dir || q + 1 >= idx.length) continue;
      const e = idx[q + 1], s = spreadAt(S.o[e]);
      const fill = dir > 0 ? S.o[e] + s : S.o[e];
      const stop = fill - dir * K * a.atr, target = mean;
      if (dir > 0 ? !(target > fill) : !(target < fill)) { trade = { skipped: true }; break; } // l'ouverture suivante a déjà dépassé la moyenne
      const R = K * a.atr;
      let exit = null, exitT = null, reason = 'fenêtre';
      for (let z = q + 1; z < idx.length; z++) {
        const m = idx[z];
        const lo = dir > 0 ? S.l[m] : S.l[m] + s, hi = dir > 0 ? S.h[m] : S.h[m] + s; // prix de sortie : bid (achat) / ask (vente)
        if (dir > 0 ? lo <= stop : hi >= stop) { exit = stop; exitT = S.t[m]; reason = 'stop'; break; }
        if (z > q + 1 && (dir > 0 ? hi >= target : lo <= target)) { exit = target; exitT = S.t[m]; reason = 'objectif'; break; }
      }
      if (exit === null) { const last = idx[idx.length - 1]; exit = dir > 0 ? S.c[last] : S.c[last] + s; exitT = S.t[last] + 60000; }
      const swap = swapPerUnit(sym, dir > 0 ? 'bullish' : 'bearish', S.t[e] - OFF, exitT - OFF) * (fill / ref);
      trade = { symbol: sym, mode, entryTime: S.t[e], r: ((exit - fill) * dir + swap) / R, reason };
    }
    if (trade && !trade.skipped) out.push(trade);
  }
  return out;
}

const stats = (vals) => { const n = vals.length, s = vals.reduce((a, x) => a + x, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(vals.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? vals.filter((x) => x > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 3) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = ([, , a, b]) => (t) => t.entryTime >= a && t.entryTime < b;

function main() {
  const all = [];
  for (const sym of SYMBOLS) {
    const hist = readGz(`data/histdata-m1/${sym}.csv.gz`), broker = readGz(`data/real-m1-full/${sym}.csv.gz`);
    for (const mode of Object.keys(MODES)) {
      all.push(...tradesFor(sym, hist, mode, (t) => t < Y(2023)), ...tradesFor(sym, broker, mode, (t) => t >= Y(2023)));
    }
    console.error(`${sym} : ${all.filter((t) => t.symbol === sym).length} trades`);
  }
  const md = ['# Retour à la moyenne la nuit (idée « nuit calme » d\'Esdras) — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-calm-night-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runCalmNightStudy.js`. Nuit : moyenne depuis 18:00 NY, contrôles M15 20:00-01:00, sortie 02:00 ; séance : moyenne depuis 9:30, contrôles 10:00-15:00, sortie 16:00. Écart ≥ 1,5 × ATR14 (M15) → pari de retour vers la moyenne, stop 1,5 × ATR, un trade par fenêtre, spread par défaut. Détail d\'exécution : si l\'ouverture de la minute suivante a déjà dépassé la moyenne, pas de trade.', '',
    '## Critère pré-enregistré (nuit, jambes principales)', '', '| Indice | Entraînement : trades, R moyen, t | 2010-2016 | 2017-2022 | Test 2023-2025 : trades, R moyen | Nuit − séance (entraînement / test) | Verdict |', '|---|---|---|---|---|---|---|'];
  const byKey = (sym, mode) => all.filter((t) => t.symbol === sym && t.mode === mode);
  for (const sym of PRIMARY) {
    const N = byKey(sym, 'nuit'), D = byKey(sym, 'seance');
    const tr = stats(N.filter(inP(PERIODS[0])).map((t) => t.r)), te = stats(N.filter(inP(PERIODS[1])).map((t) => t.r));
    const halves = HALVES.map(([a, b]) => stats(N.filter((t) => t.entryTime >= a && t.entryTime < b).map((t) => t.r)));
    const dTr = tr.m - stats(D.filter(inP(PERIODS[0])).map((t) => t.r)).m, dTe = te.m - stats(D.filter(inP(PERIODS[1])).map((t) => t.r)).m;
    const trainOk = tr.n >= 60 && tr.m > 0 && tr.t >= 2 && halves.every((h) => h.s > 0);
    const cand = trainOk && te.n >= 30 && te.m > 0;
    const verdict = !trainOk ? '**ÉCHEC à l\'entraînement**' : !cand ? '**ÉCHEC au test**' : (dTr > 0 && dTe > 0 ? '**CANDIDATE, idée confirmée** (démo d\'abord)' : '**CANDIDATE, mais la séance fait aussi bien** (idée non confirmée)');
    md.push(`| ${sym} | ${tr.n}, ${sgn(tr.m)} R, t ${tr.t.toFixed(2)} | ${sgn(halves[0].s, 1)} R | ${sgn(halves[1].s, 1)} R | ${te.n}, ${sgn(te.m)} R (total ${sgn(te.s, 1)}) | ${sgn(dTr)} / ${sgn(dTe)} | ${verdict} |`);
  }
  md.push('', '## Toutes les jambes (nuit et séance, contrôles compris)', '', '| Indice | Fenêtre | Période | Trades | Gagnants | R moyen | Total | t | Sorties à l\'objectif / stop / fin de fenêtre |', '|---|---|---|---|---|---|---|---|---|');
  for (const sym of SYMBOLS) for (const mode of ['nuit', 'seance']) for (const p of PERIODS) {
    const L = byKey(sym, mode).filter(inP(p)), s = stats(L.map((t) => t.r));
    const c = (r) => L.filter((t) => t.reason === r).length;
    md.push(`| ${sym} | ${mode === 'nuit' ? 'Nuit' : 'Séance NY'} | ${p[1]} | ${s.n} | ${s.win.toFixed(0)} % | ${sgn(s.m)} | ${sgn(s.s, 1)} | ${s.t.toFixed(2)} | ${c('objectif')} / ${c('stop')} / ${c('fenêtre')} |`);
  }
  md.push('', '## Limites', '', '- Spread constant (relevé réel de 4 jours : pas plus large la nuit, compte démo).', '- Paramètres choisis a priori, un seul essai ; 2 indices très corrélés.', '- HistData ≠ prix du broker.');
  fs.writeFileSync('data/backtest-input/calm-night-study.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
}
main();
