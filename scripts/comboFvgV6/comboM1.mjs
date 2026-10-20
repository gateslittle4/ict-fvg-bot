// comboM1.mjs - rejeu minute par minute des trades de F2 (descriptif d'exécution, pas une nouvelle variante).
// Mêmes trades que le moteur M15 ; seul change l'ordre des événements DANS la bougie M15 (remplissage, stop, TP), lu sur les M1.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadAll, RULES, summarize, fmt } from './comboG.mjs';
import { backtest, h4SweepFilter } from './lib/krysBacktest.js';

export function readM1Typed(path) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('latin1'); let n = 0; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++;
  const ms = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n); let pos = txt.indexOf('\n') + 1, k = 0;
  while (pos > 0 && pos < txt.length) { let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length; const p = txt.slice(pos, end).split(','); if (p.length >= 5) { ms[k] = +p[0]; h[k] = +p[2]; l[k] = +p[3]; c[k] = +p[4]; k++; } pos = end + 1; }
  return { ms: ms.subarray(0, k), h: h.subarray(0, k), l: l.subarray(0, k), c: c.subarray(0, k) };
}
export function concatM1(a, b) { const f = (key) => { const o = new Float64Array(a[key].length + b[key].length); o.set(a[key]); o.set(b[key], a[key].length); return o; }; return { ms: f('ms'), h: f('h'), l: f('l'), c: f('c') }; }
const lower = (arr, x) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m] < x) a = m + 1; else b = m; } return a; };

/** Rejoue UN ordre d'achat sur les M1 à partir de startMs (fermeture de la bougie M15 de pose). Retourne { status: 'ok'|'annule'|'non_rempli', r, why }.
 * Conventions identiques au moteur M15 : rempli si low + spread <= entry ; stop testé dès la minute de remplissage ; TP seulement après ; stop avant TP dans une même minute ;
 * l'ordre est annulé si le stop ou le TP est touché avant le remplissage ; sortie au temps à la fin de la 96e bougie M15 après le remplissage (limitMs, compté en bougies M15 et non en temps mural : les week-ends n'ont pas de bougies). */
export function replayBuy(o, m1, spread) {
  let i = lower(m1.ms, o.startMs), filled = false, fillMs = 0;
  for (; i < m1.ms.length; i++) {
    const L = m1.l[i], Hh = m1.h[i];
    if (!filled) {
      if (L + spread <= o.entry) { filled = true; fillMs = m1.ms[i]; if (L <= o.stop) return { status: 'ok', r: -1, why: 'stop', fillMs }; continue; }
      if (L <= o.stop || Hh >= o.tp) return { status: 'annule', r: 0, why: L <= o.stop ? 'stop_avant_fill' : 'tp_avant_fill' };
      if (m1.ms[i] - o.startMs > 3 * 86400000) return { status: 'non_rempli', r: 0, why: 'trop_tard' };
      continue;
    }
    if (L <= o.stop) return { status: 'ok', r: (o.stop - o.entry) / o.risk, why: 'stop', fillMs };
    if (Hh >= o.tp) return { status: 'ok', r: (o.tp - o.entry) / o.risk, why: 'tp', fillMs };
    if (m1.ms[i] >= o.limitMs) return { status: 'ok', r: (m1.c[i - 1] - o.entry) / o.risk, why: 'temps', fillMs };
  }
  return { status: 'non_rempli', r: 0, why: 'fin_donnees' };
}

const t0 = (y, m = 0) => Date.UTC(y, m, 1);
const lowerRaw = (c, ms) => { let a = 0, b = c.length; while (a < b) { const m = (a + b) >> 1; if (c[m].raw < ms) a = m + 1; else b = m; } return a; };

export function f2Trades(all, Y) {
  const i0 = lowerRaw(all, t0(Y - 1, 9)), i1 = lowerRaw(all, t0(Y + 1)), c = all.slice(i0, i1), start = lowerRaw(c, t0(Y)); if (c.length - start < 1000) return null;
  const px = c.slice(start).reduce((s, x) => s + x.c, 0) / (c.length - start), k = px / RULES.REF, spread = RULES.spread * k;
  const o = { start, spread, stopMargin: RULES.stopMargin * k, minRR: RULES.minRR, tpMode: RULES.tpMode, stopMode: RULES.stopMode, maxAge: RULES.maxAge, hourFrom: RULES.hourFrom, hourTo: RULES.hourTo, entryFraction: RULES.entryFraction };
  const sw = h4SweepFilter(c, { N: RULES.N, W: RULES.W });
  const T = backtest(c, { ...o, filter: (a) => a.z.dir > 0 && sw(a) }).trades.filter((t) => t.fillIdx >= start && c[t.fillIdx].raw < t0(Y + 1));
  return { spread, trades: T.map((t) => ({ r15: t.r, why15: t.why, entry: t.entry, stop: t.stop, tp: t.tp, risk: t.risk, startMs: c[t.placedIdx].raw + 900000, limitMs: t.fillIdx + 96 < c.length ? c[t.fillIdx + 96].raw + 900000 : Infinity })) };
}

if (process.argv[1].endsWith('comboM1.mjs') && process.argv[3] !== 'noop') {
  const D = process.argv[2], all = loadAll();
  const hist = readM1Typed(`${D}/histdata-m1/US100.csv.gz`), brk = readM1Typed(`${D}/real-m1-full/US100.csv.gz`), cut = brk.ms[0], hn = lower(hist.ms, cut);
  const m1 = concatM1({ ms: hist.ms.subarray(0, hn), h: hist.h.subarray(0, hn), l: hist.l.subarray(0, hn), c: hist.c.subarray(0, hn) }, brk);
  console.error('M1 :', m1.ms.length);
  const rows = [];
  for (let Y = 2011; Y <= 2026; Y++) { const r = f2Trades(all, Y); if (!r) continue; for (const t of r.trades) rows.push({ Y, ...t, m1: replayBuy(t, m1, r.spread) }); }
  const mat = {}; for (const x of rows.filter((x) => x.Y <= 2022)) { const k = x.why15 + ' -> ' + (x.m1.why); mat[k] ??= { n: 0, d: 0 }; mat[k].n++; mat[k].d += (x.m1.status === 'ok' ? x.m1.r : 0) - x.r15; }
  console.log('Transitions 2011-2022 (M15 -> M1) : n, écart de R cumulé M1 - M15'); for (const [k, v] of Object.entries(mat)) console.log(' ', k.padEnd(28), String(v.n).padStart(5), v.d.toFixed(2).padStart(8));
  const blocks = { '2011-2016': [2011, 2016], '2017-2022': [2017, 2022], '2011-2022': [2011, 2022], '2023-2025': [2023, 2025], '2026 (au 21/09)': [2026, 2026] };
  for (const [nm, [a, b]] of Object.entries(blocks)) {
    const S = rows.filter((x) => x.Y >= a && x.Y <= b), ok = S.filter((x) => x.m1.status === 'ok');
    console.log(`\n## ${nm}  trades M15 : ${S.length} | annulés en M1 : ${S.filter((x) => x.m1.status !== 'ok').length}`);
    console.log('M15 pessimiste'.padEnd(18), fmt(summarize(S.map((x) => x.r15))));
    console.log('M1 minute par minute'.padEnd(18), fmt(summarize(ok.map((x) => x.m1.r))));
    const sw = (f) => S.filter(f).length;
    console.log(`  M15 stop -> M1 tp : ${sw((x) => x.why15 === 'stop' && x.m1.why === 'tp')} | M15 tp -> M1 stop : ${sw((x) => x.why15 === 'tp' && x.m1.why === 'stop')} | annulés tp_avant_fill : ${sw((x) => x.m1.why === 'tp_avant_fill')} stop_avant_fill : ${sw((x) => x.m1.why === 'stop_avant_fill')}`);
  }
}
