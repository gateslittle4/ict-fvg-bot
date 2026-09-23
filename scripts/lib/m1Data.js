// Données M1 partagées par les scripts de recherche (runCleanStudy.js, runLiveReplay.js) : HistData M1 2010-2022
// (data/histdata-m1, voir buildHistdataM1.js) et M1 du broker (data/real-m1-full). Heures converties en temps moteur
// (UTC - 5 h fixe). Tableaux typés : 13 ans de M1 tiennent en mémoire.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../../src/backtest/nySession.js';

export const OFF = FIXED_EST_TO_UTC_OFFSET_MS;
export const DAY = 86400000;
export const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - OFF;

export function readCsvGz(path) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('latin1');
  let n = 0; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++;
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  let k = 0; let pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(',');
    if (p.length >= 5) { t[k] = +p[0] - OFF; o[k] = +p[1]; h[k] = +p[2]; l[k] = +p[3]; c[k] = +p[4]; k++; }
    pos = end + 1;
  }
  return { t: t.subarray(0, k), o: o.subarray(0, k), h: h.subarray(0, k), l: l.subarray(0, k), c: c.subarray(0, k), n: k };
}
function concat(a, b) {
  const f = (x, y) => { const r = new Float64Array(x.length + y.length); r.set(x); r.set(y, x.length); return r; };
  return { t: f(a.t, b.t), o: f(a.o, b.o), h: f(a.h, b.h), l: f(a.l, b.l), c: f(a.c, b.c), n: a.n + b.n };
}
function slice(a, i, j) { return { t: a.t.subarray(i, j), o: a.o.subarray(i, j), h: a.h.subarray(i, j), l: a.l.subarray(i, j), c: a.c.subarray(i, j), n: j - i }; }
export const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };

/** 'hist' = HistData jusqu'à fin 2022 ; 'broker' = HistData 2022 (préchauffage) puis M1 du broker. */
export function loadM1(src, sym) {
  // Sans HistData (jamais commité, ex. un poste Windows fraîchement cloné), 'broker' se contente du M1 du broker (2023+) :
  // suffisant pour toute tranche qui commence au moins 90 jours après son début.
  if (src === 'broker' && !fs.existsSync(`data/histdata-m1/${sym}.csv.gz`)) return readCsvGz(`data/real-m1-full/${sym}.csv.gz`);
  const hist = readCsvGz(`data/histdata-m1/${sym}.csv.gz`);
  if (src === 'hist') return slice(hist, 0, lower(hist.t, hist.n, eng(2023)));
  const broker = readCsvGz(`data/real-m1-full/${sym}.csv.gz`);
  const i0 = lower(hist.t, hist.n, eng(2022)); const i1 = lower(hist.t, hist.n, broker.t[0]);
  return concat(slice(hist, i0, i1), broker);
}

/** Bougies M15 complètes depuis le M1, avec l'index M1 de leur première minute (`i0`). */
export function toM15(S) {
  const out = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / 900000) * 900000;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i], volume: 0, i0: i }; }
    else { if (S.h[i] > cur.high) cur.high = S.h[i]; if (S.l[i] < cur.low) cur.low = S.l[i]; cur.close = S.c[i]; }
  }
  if (cur) out.push(cur);
  return out;
}

const REF = {};
/** Dernier prix du broker (septembre 2026) : les coûts d'aujourd'hui (spread, swap en points) sont appliqués en % du prix. */
export function refPrice(sym) {
  if (REF[sym]) return REF[sym];
  const txt = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('latin1').trimEnd();
  return (REF[sym] = +txt.slice(txt.lastIndexOf('\n') + 1).split(',')[4]);
}

// Swap réel du broker (points par lot et par nuit, relevé 2026-09) et jour du triple swap.
export const SWAP = {
  US100: { long: -43.7, short: 18.4, pip: 0.1, triple: 5 },
  US500: { long: -11, short: 4.4, pip: 0.1, triple: 5 },
  XAUUSD: { long: -63.88, short: 39.45, pip: 0.01, triple: 3 },
  EURUSD: { long: -0.65, short: 0.28, pip: 0.0001, triple: 3 },
};
const ROLLOVER_ENGINE_MS = (21 - OFF / 3600000) * 3600000;
/** Swap en prix par unité entre deux instants (temps moteur), au niveau de prix d'aujourd'hui (multiplier par prix / refPrice). */
export function swapPerUnit(symbol, direction, fromTime, toTime) {
  const sw = SWAP[symbol];
  if (!sw) return 0;
  const perDay = (direction === 'bullish' ? sw.long : sw.short) * sw.pip;
  let nights = 0;
  let tau = Math.floor(fromTime / DAY) * DAY + ROLLOVER_ENGINE_MS;
  if (tau <= fromTime) tau += DAY;
  for (; tau <= toTime; tau += DAY) {
    const dow = new Date(tau + OFF).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    nights += dow === sw.triple ? 3 : 1;
  }
  return nights * perDay;
}
