#!/usr/bin/env node
// runEsdrasFvgV2Study.js
// Usage: [SYMBOL=US500] node --max-old-space-size=6144 scripts/runEsdrasFvgV2Study.js   (US100 par défaut)
//
// Le FVG d'Esdras v2, exactement tel que pré-enregistré dans
// data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md (commité AVANT ce script) :
// règles v1 (M15, impulsion >= 2 x ATR14 + BMS, prix parti à 2x la zone, LIMIT au bord, 8h-12h NY) + contexte 4h
// (creux/sommet 4h pris ou FVG 4h touché dans les 5 jours, et retournement depuis cette zone), cible = liquidité 4h
// la plus proche, trade seulement si >= 3R. US100 seul. Réglé minute par minute sur M1.
// Entraînement 2010-2022 = data/histdata-m1 ; test 2023-2025 et 2026 = data/real-m1-full.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = [process.env.SYMBOL || 'US100'];
const M15 = 900000; const MIN = 60000; const DAY = 86400000;
const MIN_RR = 3, IMPULSE_ATR = 2, AWAY_MULT = 2, ATR_N = 14, PIVOT = 5, MAX_HOLD = 480 * M15;
const START = 10000;
const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: Y(2010), to: Y(2023), src: 'hist' },
  { id: 'test', label: 'Test 2023-2025', from: Y(2023), to: Y(2026), src: 'broker' },
  { id: 'fwd', label: '2026 (→ fin des données)', from: Y(2026), to: Y(2027), src: 'broker' },
];
const HALVES = [[Y(2010), Y(2017)], [Y(2017), Y(2023)]];

// --- Heure de New York réelle (règles US depuis 2007) ---
const sundayOf = (y, m, nth) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d) % 7) + 7 * (nth - 1); };
const dstCache = new Map();
function nyOffsetMs(utc) {
  const y = new Date(utc).getUTCFullYear();
  if (!dstCache.has(y)) dstCache.set(y, [Date.UTC(y, 2, sundayOf(y, 2, 2), 7), Date.UTC(y, 10, sundayOf(y, 10, 1), 6)]);
  const [a, b] = dstCache.get(y);
  return (utc >= a && utc < b ? -4 : -5) * 3600000;
}
const nyHour = (utc) => { const l = utc + nyOffsetMs(utc); return ((l % DAY) + DAY) % DAY / 3600000; };
const nyNoonAfter = (utc) => { const off = nyOffsetMs(utc); const l = utc + off; const noonLocal = Math.floor(l / DAY) * DAY + 12 * 3600000; return noonLocal - off; };

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
function toM15(S) {
  const out = [];
  let cur = null;
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / M15) * M15;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i] }; }
    else { if (S.h[i] > cur.high) cur.high = S.h[i]; if (S.l[i] < cur.low) cur.low = S.l[i]; cur.close = S.c[i]; }
  }
  if (cur) out.push(cur);
  return out;
}
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };

// --- Structures 4h (bougies alignées sur New York + 7 h = heure serveur FTMO), tables de plus haut/plus bas M15 ---
const H4 = 4 * 3600000;
function toH4(S) {
  const out = []; let cur = null, key = null;
  for (let i = 0; i < S.n; i++) {
    const k = Math.floor((S.t[i] + nyOffsetMs(S.t[i]) + 7 * 3600000) / H4);
    if (key !== k) { if (cur) out.push(cur); key = k; cur = { open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i], closeTime: S.t[i] + MIN }; }
    else { if (S.h[i] > cur.high) cur.high = S.h[i]; if (S.l[i] < cur.low) cur.low = S.l[i]; cur.close = S.c[i]; cur.closeTime = S.t[i] + MIN; }
  }
  if (cur) out.push(cur);
  return out;
}
function sparse(arr, fn) {
  const n = arr.length, lv = [Float64Array.from(arr)];
  for (let p = 1; (1 << p) <= n; p++) { const prev = lv[p - 1], w = 1 << (p - 1), cur = new Float64Array(n - (1 << p) + 1); for (let i = 0; i < cur.length; i++) cur[i] = fn(prev[i], prev[i + w]); lv.push(cur); }
  return (a, b) => { const p = 31 - Math.clz32(b - a + 1); return fn(lv[p][a], lv[p][b - (1 << p) + 1]); }; // inclusif
}

// --- Détection v2 (pré-enregistrement v2) + réglage minute par minute ---
function findTrades(sym, S) {
  const C = toM15(S);
  const N = C.length;
  const spread = DEFAULT_SPREADS[sym] ?? 0;
  const ct = Float64Array.from(C, (b) => b.time);
  const maxH = sparse(C.map((b) => b.high), Math.max), minL = sparse(C.map((b) => b.low), Math.min);
  // premier indice >= from où pred(range) devient vrai (recherche dichotomique sur la plage)
  const firstBelow = (from, L, strict) => { if (from >= N) return -1; const ok = (b) => (strict ? minL(from, b) < L : minL(from, b) <= L); if (!ok(N - 1)) return -1; let lo = from, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (ok(m)) hi = m; else lo = m + 1; } return lo; };
  const firstAbove = (from, L, strict) => { if (from >= N) return -1; const ok = (b) => (strict ? maxH(from, b) > L : maxH(from, b) >= L); if (!ok(N - 1)) return -1; let lo = from, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (ok(m)) hi = m; else lo = m + 1; } return lo; };
  const G = toH4(S);
  const bullEv = [], bearEv = []; // événements de contexte {idx, level}
  const liqAbove = [], liqBelow = []; // cibles possibles {level, from, gone} : actives pour une requête q si from <= q et (gone < 0 ou gone >= q)
  for (let k = 2; k + 2 < G.length; k++) {
    const g = G[k];
    const isPH = G[k - 1].high < g.high && G[k - 2].high < g.high && G[k + 1].high < g.high && G[k + 2].high < g.high;
    const isPL = G[k - 1].low > g.low && G[k - 2].low > g.low && G[k + 1].low > g.low && G[k + 2].low > g.low;
    const from = lower(ct, N, G[k + 2].closeTime);
    if (isPH) { const gone = firstAbove(from, g.high, true); liqAbove.push({ level: g.high, from, gone }); if (gone >= 0) bearEv.push({ idx: gone, level: g.high }); }
    if (isPL) { const gone = firstBelow(from, g.low, true); liqBelow.push({ level: g.low, from, gone }); if (gone >= 0) bullEv.push({ idx: gone, level: g.low }); }
  }
  for (let k = 2; k < G.length; k++) {
    const a = G[k - 2], c = G[k];
    const from = lower(ct, N, c.closeTime);
    if (a.high < c.low) { const gone = firstBelow(from, c.low, false); liqBelow.push({ level: c.low, from, gone }); if (gone >= 0) bullEv.push({ idx: gone, level: c.low }); }
    if (a.low > c.high) { const gone = firstAbove(from, c.high, false); liqAbove.push({ level: c.high, from, gone }); if (gone >= 0) bearEv.push({ idx: gone, level: c.high }); }
  }
  bullEv.sort((x, y) => x.idx - y.idx); bearEv.sort((x, y) => x.idx - y.idx);
  const evIdx = (ev) => Float64Array.from(ev, (e) => e.idx);
  const bullIdx = evIdx(bullEv), bearIdx = evIdx(bearEv);
  const context = (bull, c2i, c1i) => {
    const ev = bull ? bullEv : bearEv, ix = bull ? bullIdx : bearIdx;
    const a = lower(ix, ix.length, lower(ct, N, ct[c2i] - 5 * DAY)), z = lower(ix, ix.length, c2i);
    if (a >= z) return 'none';
    const s = Math.max(0, c1i - 15);
    const ext = bull ? minL(s, c1i) : maxH(s, c1i);
    for (let e = a; e < z; e++) if (bull ? ext <= ev[e].level : ext >= ev[e].level) return 'ok';
    return 'far';
  };
  const nearestTarget = (bull, entry, q) => {
    let best = null;
    for (const x of bull ? liqAbove : liqBelow) {
      if (x.from > q || (x.gone >= 0 && x.gone < q)) continue;
      if (bull ? x.level > entry && (best === null || x.level < best) : x.level < entry && (best === null || x.level > best)) best = x.level;
    }
    return best;
  };

  const tr = new Float64Array(N);
  for (let i = 1; i < N; i++) tr[i] = Math.max(C[i].high - C[i].low, Math.abs(C[i].high - C[i - 1].close), Math.abs(C[i].low - C[i - 1].close));
  const isPH = (k) => { for (let j = 1; j <= PIVOT; j++) if (C[k - j].high >= C[k].high || C[k + j].high > C[k].high) return false; return true; };
  const isPL = (k) => { for (let j = 1; j <= PIVOT; j++) if (C[k - j].low <= C[k].low || C[k + j].low < C[k].low) return false; return true; };
  let lastPH = null, lastPL = null;
  const trades = [];
  const stats = { gaps: 0, impulse: 0, bos: 0, hours: 0, ctxAny: 0, ctx: 0, away: 0, target: 0, rr: 0, filled: 0, targetRs: [] };
  let busyUntil = 0;
  for (let i = 2; i < N; i++) {
    const k = i - 2 - PIVOT;
    if (k >= PIVOT) { if (isPH(k)) lastPH = C[k].high; if (isPL(k)) lastPL = C[k].low; }
    const c1 = C[i - 2], c2 = C[i - 1], c3 = C[i];
    if (c3.time - c1.time !== 2 * M15) continue;
    const bull = c1.high < c3.low, bear = c1.low > c3.high;
    if (!bull && !bear) continue;
    stats.gaps++;
    if (i - 1 < ATR_N + 1) continue;
    let atr = 0; for (let j = i - 1 - ATR_N; j < i - 1; j++) atr += tr[j]; atr /= ATR_N;
    if (!(Math.abs(c2.close - c2.open) >= IMPULSE_ATR * atr)) continue;
    stats.impulse++;
    if (bull ? !(lastPH !== null && c2.close > lastPH) : !(lastPL !== null && c2.close < lastPL)) continue;
    stats.bos++;
    const h = nyHour(c2.time);
    if (!(h >= 8 && h < 12)) continue;
    stats.hours++;
    const ctx = context(bull, i - 1, i - 2);
    if (ctx === 'none') continue;
    stats.ctxAny++;
    if (ctx !== 'ok') continue;
    stats.ctx++;
    const top = bull ? c3.low : c1.low, bottom = bull ? c1.high : c3.high;
    const d = top - bottom;
    if (!(d > 0) || (spread > 0 && d < 3 * spread)) continue;
    const entry = bull ? top : bottom, stop = bull ? bottom : top;
    const awayLevel = bull ? top + AWAY_MULT * d : bottom - AWAY_MULT * d;
    const cancelAt = nyNoonAfter(c2.time);
    let armedFrom = null;
    for (let j = i; j < N && C[j].time < cancelAt; j++) {
      const b = C[j];
      if (j > i && (bull ? b.low <= top : b.high >= bottom)) break;
      if (bull ? b.high >= awayLevel : b.low <= awayLevel) { armedFrom = b.time + M15; break; }
    }
    if (armedFrom === null || armedFrom >= cancelAt) continue;
    if (armedFrom < busyUntil) continue;
    stats.away++;
    const target = nearestTarget(bull, entry, lower(ct, N, armedFrom));
    if (target === null) continue;
    stats.target++;
    const tR = Math.abs(target - entry) / d;
    stats.targetRs.push(tR);
    if (tR < MIN_RR) continue;
    stats.rr++;
    const a = lower(S.t, S.n, armedFrom), z = lower(S.t, S.n, cancelAt);
    let fill = -1;
    for (let m = a; m < z; m++) { if (bull ? S.l[m] <= entry - spread : S.h[m] >= entry) { fill = m; break; } }
    if (fill < 0) continue;
    stats.filled++;
    const maxT = S.t[fill] + MAX_HOLD;
    let exitPrice = null, exitTime = null, outcome = 'timeout';
    let m = fill;
    for (; m < S.n && S.t[m] < maxT; m++) {
      if (bull ? S.l[m] <= stop : S.h[m] + spread >= stop) { exitPrice = stop; exitTime = S.t[m]; outcome = 'loss'; break; }
      if (m > fill && (bull ? S.h[m] >= target : S.l[m] + spread <= target)) { exitPrice = target; exitTime = S.t[m]; outcome = 'win'; break; }
    }
    if (exitPrice === null) { const last = Math.max(fill, m - 1); exitPrice = bull ? S.c[last] : S.c[last] + spread; exitTime = S.t[last]; }
    const r = (bull ? exitPrice - entry : entry - exitPrice) / d;
    trades.push({ symbol: sym, dir: bull ? 'buy' : 'sell', entryTime: S.t[fill], exitTime, r, outcome, targetR: tR, zone: [bottom, top] });
    busyUntil = exitTime;
  }
  return { trades, stats };
}


// --- Compte événementiel : entrée à l'exécution, P&L à la sortie, garde-fou réel, une position par paire ---
function simulate(trades, risk, ftmo) {
  const evs = [];
  trades.forEach((t, i) => { evs.push({ time: t.entryTime, kind: 1, i }); evs.push({ time: Math.max(t.exitTime, t.entryTime), kind: 0, i }); });
  evs.sort((a, b) => a.time - b.time || b.kind - a.kind);
  const guard = ftmo ? buildEffectiveConfig({ id: 'esdras-fvg', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk }).guardrails : CONFIG.guardrails;
  const cycles = []; let c = null; const openSym = new Map();
  const startCycle = (t) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, t); c = { start: t, end: null, outcome: null, bal: START, peak: START, dd: 0, g, open: new Map(), taken: [] }; };
  startCycle(evs.length ? evs[0].time : 0);
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.kind === 1) {
      if (t.entryTime < c.start || openSym.get(t.symbol)) continue;
      if (!c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
      c.open.set(ev.i, c.bal * (risk / 100)); openSym.set(t.symbol, true);
      continue;
    }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * t.r; c.open.delete(ev.i); openSym.set(t.symbol, false);
    c.bal += pnl; c.peak = Math.max(c.peak, c.bal); c.dd = Math.max(c.dd, (c.peak - c.bal) / c.peak * 100);
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    c.taken.push(t);
    if (!ftmo) continue;
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) {
      c.end = t.exitTime; c.outcome = st.targetReached ? 'RÉUSSI' : 'RATÉ'; cycles.push(c);
      for (const k of c.open.keys()) openSym.set(trades[k].symbol, false);
      startCycle(t.exitTime);
    }
  }
  if (c.taken.length > 0 || cycles.length === 0) { c.end = c.taken.length ? c.taken[c.taken.length - 1].exitTime : c.start; c.outcome = `en cours (${((c.bal - START) / START * 100).toFixed(1)} %)`; cycles.push(c); }
  const taken = cycles.flatMap((x) => x.taken);
  const n = taken.length, sum = taken.reduce((a, t) => a + t.r, 0), mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(taken.reduce((a, t) => a + (t.r - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, sum, mean, t: sd ? mean / (sd / Math.sqrt(n)) : 0, win: n ? taken.filter((t) => t.r > 0).length / n * 100 : 0, dd: Math.max(...cycles.map((x) => x.dd)),
    ret: ftmo ? null : (cycles[0].bal - START) / START * 100, cycles, pass: cycles.filter((x) => x.outcome === 'RÉUSSI').length, fail: cycles.filter((x) => x.outcome === 'RATÉ').length };
}
const rawStats = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const day = (t) => new Date(t).toISOString().slice(0, 10);

function main() {
  const all = [];
  const detail = [];
  for (const src of ['hist', 'broker']) {
    for (const sym of SYMBOLS) {
      const S = readGz(src === 'hist' ? `data/histdata-m1/${sym}.csv.gz` : `data/real-m1-full/${sym}.csv.gz`);
      const { trades, stats } = findTrades(sym, S);
      const keep = trades.filter((t) => (src === 'hist' ? t.entryTime < Y(2023) : t.entryTime >= Y(2023)));
      all.push(...keep);
      const tRs = stats.targetRs.slice().sort((a, b) => a - b); const med = tRs.length ? tRs[tRs.length >> 1].toFixed(1) : '-';
      detail.push(`${sym} ${src} : FVG ${stats.gaps}, impulsion ${stats.impulse}, + BMS ${stats.bos}, + 8h-12h ${stats.hours}, + événement 4h dans les 5 jours ${stats.ctxAny}, + retournement depuis la zone ${stats.ctx}, + prix parti à 2x ${stats.away}, + cible 4h trouvée ${stats.target} (médiane ${med} R), + cible ≥ 3R ${stats.rr}, ordres remplis ${stats.filled}`);
      console.error(detail[detail.length - 1]);
    }
  }
  all.sort((a, b) => a.entryTime - b.entryTime);
  const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;

  const md = ['# Le FVG d\'Esdras v2 (contexte 4h) — résultat du pré-enregistrement', '',
    `Règles : \`data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md\`${SYMBOLS[0] === 'US100' ? '' : ' appliquées telles quelles à ' + SYMBOLS[0] + ' (\`preregistration-esdras-fvg-v2-us500-2026-09-23.md\`)'} (commité avant ce calcul, rien changé depuis). Script : \`scripts/runEsdrasFvgV2Study.js\`. M15 ${SYMBOLS[0]} seul, règles v1 + creux/sommet 4h pris ou FVG 4h touché dans les 5 jours avec retournement depuis cette zone, cible = liquidité 4h la plus proche (≥ 3R exigé), 8h-12h New York, réglé à la minute.`, '',
    '## Entonnoir de détection', '', ...detail.map((x) => `- ${x}`), '',
    '## R par trade (tous les trades détectés, sans garde-fou)', '', '| Période | Paire | Trades | Gagnants | Cible moyenne | R net | R/trade | t |', '|---|---|---|---|---|---|---|---|'];
  for (const p of PERIODS) for (const sym of SYMBOLS) {
    const l = all.filter(inP(p)).filter((t) => sym === 'les deux' || t.symbol === sym); const s = rawStats(l);
    md.push(`| ${p.label} | ${sym} | ${s.n} | ${s.win.toFixed(0)} % | ${s.n ? (l.reduce((a, t) => a + t.targetR, 0) / s.n).toFixed(1) + ' R' : '-'} | ${sgn(s.s)} | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} |`);
  }
  md.push('', '## Critère pré-enregistré', '');
  const trainAll = all.filter(inP(PERIODS[0])); const tr = rawStats(trainAll);
  const halves = HALVES.map(([a, b]) => rawStats(all.filter((t) => t.entryTime >= a && t.entryTime < b)));
  const trainOk = tr.n >= 60 && tr.s > 0 && tr.t >= 2 && halves.every((h) => h.s > 0);
  md.push(`- Entraînement : ${tr.n} trades, R net ${sgn(tr.s)}, t = ${tr.t.toFixed(2)} ; 2010-2016 ${sgn(halves[0].s)} R (${halves[0].n}), 2017-2022 ${sgn(halves[1].s)} R (${halves[1].n}) → ${trainOk ? '**RETENUE pour la lecture du test**' : tr.n < 60 ? '**NON CONCLUANT** (moins de 60 trades)' : '**ÉCHEC à l\'entraînement**'}`);
  const te = rawStats(all.filter(inP(PERIODS[1])));
  md.push(`- Test 2023-2025 (lu une fois) : ${te.n} trades, R net ${sgn(te.s)}, t = ${te.t.toFixed(2)} → ${trainOk ? (te.n >= 30 && te.s > 0 ? '**CANDIDATE** (suivi en démo avant tout réel)' : '**ÉCHEC au test**') : 'non lu comme critère (échec à l\'entraînement)'}`);

  md.push('', '## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step', '', '| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |', '|---|---|---|---|---|---|---|');
  const RISKS = [0.25, 0.5, 0.75, 1.0];
  let best = null;
  for (const k of RISKS) for (const p of PERIODS) {
    const l = all.filter(inP(p)); const c = simulate(l, k, false); const f = simulate(l, k, true);
    if (p.id === 'train' && (!best || f.pass - f.fail > best.d)) best = { k, d: f.pass - f.fail };
    md.push(`| ${k} % | ${p.label} | ${c.n} | ${sgn(c.sum)} | ${sgn(c.ret)} % | ${c.dd.toFixed(1)} % | ${f.pass} / ${f.fail} |`);
  }
  md.push('', `Risque choisi sur l'entraînement (max réussis − ratés) : **${best.k} %**.`, '', `## Cycles FTMO en 2026 au risque choisi (${best.k} %)`, '', '| Cycle | Début | Fin | Trades | Résultat |', '|---|---|---|---|---|');
  simulate(all.filter(inP(PERIODS[2])), best.k, true).cycles.forEach((c, i) => md.push(`| ${i + 1} | ${day(c.start)} | ${day(c.end)} | ${c.taken.length} | ${c.outcome} |`));
  md.push('', '## Par année (R net, tous trades détectés)', '', '| Année | Trades | R net |', '|---|---|---|');
  for (let y = 2010; y <= 2026; y++) { const l = all.filter((t) => t.entryTime >= Y(y) && t.entryTime < Y(y + 1)); md.push(`| ${y} | ${l.length} | ${sgn(l.reduce((a, t) => a + t.r, 0))} |`); }
  md.push('', '## Mois (descriptif, pas un critère) : combien de mois à +25 R ou plus ?', '', 'À 1 % de risque par trade, +25 R dans un mois ≈ +25 % du compte.', '', '| Période | Mois avec trades | Mois ≥ +10 R | Mois ≥ +25 R | Meilleur mois | Pire mois |', '|---|---|---|---|---|---|');
  for (const p of PERIODS) {
    const byM = new Map(); for (const t of all.filter(inP(p))) { const k = new Date(t.entryTime).toISOString().slice(0, 7); byM.set(k, (byM.get(k) || 0) + t.r); }
    const v = [...byM.entries()].sort((a, b) => b[1] - a[1]);
    md.push(`| ${p.label} | ${v.length} | ${v.filter((x) => x[1] >= 10).length} | ${v.filter((x) => x[1] >= 25).length} | ${v.length ? `${v[0][0]} (${sgn(v[0][1])} R)` : '-'} | ${v.length ? `${v[v.length - 1][0]} (${sgn(v[v.length - 1][1])} R)` : '-'} |`);
  }
  md.push('', '## Limites', '', '- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.', '- « Stop d\'abord » dans une même minute (prudent).', '- Détecteur écrit pour cette étude : pas encore le code du bot live.', (SYMBOLS[0] === 'US100' ? '- US100 choisi après la v1 (biais de sélection déclaré dans le pré-enregistrement).' : `- ${SYMBOLS[0]} : 2e essai de la même règle sur un indice corrélé à US100.`), '- Le M1 du broker commence le 2023-01-11 : au début du test, les niveaux 4h plus anciens sont inconnus.');
  const out = SYMBOLS[0] === 'US100' ? 'data/backtest-input/esdras-fvg-v2-study.md' : `data/backtest-input/esdras-fvg-v2-${SYMBOLS[0].toLowerCase()}-study.md`;
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
}
main();
