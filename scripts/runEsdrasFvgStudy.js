#!/usr/bin/env node
// runEsdrasFvgStudy.js
// Usage: node --max-old-space-size=6144 scripts/runEsdrasFvgStudy.js
//
// Le FVG d'Esdras ("deuxième vague" ICT), exactement tel que pré-enregistré dans
// data/backtest-input/preregistration-esdras-fvg-2026-09-23.md (commité AVANT ce script) :
// M15, US100 + XAUUSD, impulsion (corps de c2) >= 2 x ATR14, BOS (clôture de c2 au-delà du dernier pivot 5/5),
// prix parti à >= 2 x la hauteur de la zone avant tout retour, LIMIT au bord (ask touche), stop au bord opposé,
// cible 4R, stop >= 3 x spread, c2 entre 8:00 et 12:00 New York (heure réelle), ordre annulé à 12:00 NY,
// sortie au marché après 5 jours. Réglé minute par minute sur M1. Détecteur indépendant du moteur live
// (la règle n'existe pas dans LiveStrategyEngine).
// Entraînement 2010-2022 = data/histdata-m1 (scripts/buildHistdataM1.js) ; test 2023-2025 et 2026 = data/real-m1-full.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = ['US100', 'XAUUSD'];
const M15 = 900000; const MIN = 60000; const DAY = 86400000;
const RR = 4, IMPULSE_ATR = 2, AWAY_MULT = 2, ATR_N = 14, PIVOT = 5, MAX_HOLD = 480 * M15;
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

// --- Détection + réglage d'une source (M1 + M15) ---
function findTrades(sym, S) {
  const C = toM15(S);
  const spread = DEFAULT_SPREADS[sym] ?? 0;
  const tr = new Float64Array(C.length);
  for (let i = 1; i < C.length; i++) tr[i] = Math.max(C[i].high - C[i].low, Math.abs(C[i].high - C[i - 1].close), Math.abs(C[i].low - C[i - 1].close));
  // Pivots 5/5 : un pivot à k n'est connu qu'à la clôture de k + PIVOT.
  const isPH = (k) => { for (let j = 1; j <= PIVOT; j++) if (C[k - j].high >= C[k].high || C[k + j].high > C[k].high) return false; return true; };
  const isPL = (k) => { for (let j = 1; j <= PIVOT; j++) if (C[k - j].low <= C[k].low || C[k + j].low < C[k].low) return false; return true; };
  let lastPH = null, lastPL = null; // derniers pivots CONFIRMÉS
  const trades = [];
  const stats = { gaps: 0, impulse: 0, bos: 0, hours: 0, away: 0, filled: 0 };
  let busyUntil = 0; // un seul ordre/position par paire côté détection (le compte gère aussi le netting)
  for (let i = 2; i < C.length; i++) {
    // pivots confirmés à la clôture de la bougie i-2 (avant c2 = i-1)
    const k = i - 2 - PIVOT;
    if (k >= PIVOT) { if (isPH(k)) lastPH = C[k].high; if (isPL(k)) lastPL = C[k].low; }
    const c1 = C[i - 2], c2 = C[i - 1], c3 = C[i];
    if (c3.time - c1.time !== 2 * M15) continue; // 3 bougies consécutives
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
    const top = bull ? c3.low : c1.low, bottom = bull ? c1.high : c3.high;
    const d = top - bottom;
    if (!(d > 0) || (spread > 0 && d < 3 * spread)) continue;
    const entry = bull ? top : bottom, stop = bull ? bottom : top, target = bull ? entry + RR * d : entry - RR * d;
    const awayLevel = bull ? top + AWAY_MULT * d : bottom - AWAY_MULT * d;
    const cancelAt = nyNoonAfter(c2.time);
    // distance, puis retour, en M15 (c3 compte pour la distance, pas pour le contact)
    let armedFrom = null;
    for (let j = i; j < C.length && C[j].time < cancelAt; j++) {
      const b = C[j];
      if (j > i && (bull ? b.low <= top : b.high >= bottom)) break; // retouchée avant d'être partie loin -> abandonnée
      if (bull ? b.high >= awayLevel : b.low <= awayLevel) { armedFrom = b.time + M15; break; }
    }
    if (armedFrom === null || armedFrom >= cancelAt) continue;
    if (armedFrom < busyUntil) continue;
    stats.away++;
    // exécution minute par minute : LIMIT actif de armedFrom à cancelAt
    const a = lower(S.t, S.n, armedFrom), z = lower(S.t, S.n, cancelAt);
    let fill = -1;
    for (let m = a; m < z; m++) { if (bull ? S.l[m] <= entry - spread : S.h[m] >= entry) { fill = m; break; } }
    if (fill < 0) continue;
    stats.filled++;
    const maxT = S.t[fill] + MAX_HOLD;
    let exitPrice = null, exitTime = null, outcome = 'timeout';
    let m = fill;
    for (; m < S.n && S.t[m] < maxT; m++) {
      // stop d'abord dans la même minute (prudent) ; vente : stop/cible déclenchés à l'ask = bid + spread
      if (bull ? S.l[m] <= stop : S.h[m] + spread >= stop) { exitPrice = stop; exitTime = S.t[m]; outcome = 'loss'; break; }
      if (m > fill && (bull ? S.h[m] >= target : S.l[m] + spread <= target)) { exitPrice = target; exitTime = S.t[m]; outcome = 'win'; break; }
    }
    if (exitPrice === null) { const last = Math.max(fill, m - 1); exitPrice = bull ? S.c[last] : S.c[last] + spread; exitTime = S.t[last]; }
    const r = (bull ? exitPrice - entry : entry - exitPrice) / d;
    trades.push({ symbol: sym, dir: bull ? 'buy' : 'sell', entryTime: S.t[fill], exitTime, r, outcome, zone: [bottom, top] });
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
      detail.push(`${sym} ${src} : FVG ${stats.gaps}, impulsion ${stats.impulse}, + BOS ${stats.bos}, + 8h-12h ${stats.hours}, + prix parti à 2x ${stats.away}, ordres remplis ${stats.filled}`);
      console.error(detail[detail.length - 1]);
    }
  }
  all.sort((a, b) => a.entryTime - b.entryTime);
  const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;

  const md = ['# Le FVG d\'Esdras (« deuxième vague » ICT) — résultat du pré-enregistrement', '',
    'Règles : `data/backtest-input/preregistration-esdras-fvg-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgStudy.js`. M15 US100 + XAUUSD, impulsion ≥ 2×ATR14 + BOS, prix parti à ≥ 2× la hauteur de la zone avant le retour, LIMIT au bord (ask), stop au bord opposé, cible 4R, 8h-12h New York, réglé à la minute.', '',
    '## Entonnoir de détection', '', ...detail.map((x) => `- ${x}`), '',
    '## R par trade (tous les trades détectés, sans garde-fou)', '', '| Période | Paire | Trades | Gagnants | R net | R/trade | t |', '|---|---|---|---|---|---|---|'];
  for (const p of PERIODS) for (const sym of [...SYMBOLS, 'les deux']) {
    const l = all.filter(inP(p)).filter((t) => sym === 'les deux' || t.symbol === sym); const s = rawStats(l);
    md.push(`| ${p.label} | ${sym} | ${s.n} | ${s.win.toFixed(0)} % | ${sgn(s.s)} | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} |`);
  }
  md.push('', '## Critère pré-enregistré', '');
  const trainAll = all.filter(inP(PERIODS[0])); const tr = rawStats(trainAll);
  const halves = HALVES.map(([a, b]) => rawStats(all.filter((t) => t.entryTime >= a && t.entryTime < b)));
  const trainOk = tr.n >= 60 && tr.s > 0 && tr.t >= 2 && halves.every((h) => h.s > 0);
  md.push(`- Entraînement : ${tr.n} trades, R net ${sgn(tr.s)}, t = ${tr.t.toFixed(2)} ; 2010-2016 ${sgn(halves[0].s)} R (${halves[0].n}), 2017-2022 ${sgn(halves[1].s)} R (${halves[1].n}) → ${trainOk ? '**RETENUE pour la lecture du test**' : '**ÉCHEC à l\'entraînement**'}`);
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
  md.push('', '## Limites', '', '- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.', '- « Stop d\'abord » dans une même minute (prudent).', '- Détecteur écrit pour cette étude : pas encore le code du bot live.');
  const out = 'data/backtest-input/esdras-fvg-study.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
}
main();
