// esdrasMethod.js - la méthode d'Esdras telle qu'il la décrit (data/backtest-input/preregistration-esdras-method-2026-09-27.md) :
// sens H4 par prise de PD arrays (sommets/creux H4 à 1 bougie, FVG H4 vierges), BMS M15, n'importe quel FVG M15 du sens après le BMS
// (D hors de la zone) entre 7 h-11 h ou 20 h-23 h NY, objectif = niveau H4 opposé le plus proche (le 2e s'il est « proche »), échelle
// d'entrée pour avoir au moins 3R, annulation à 11 h / 7 h le lendemain, sortie 17 h NY, au plus 3 trades remplis par jour.
import { nyMin, dayKey, MIN, lastDoneBar } from './nightLab.js';
import { nextNyTime } from './eyeRule.js';

export const WINDOWS = [{ from: 420, to: 660, expiry: 660 }, { from: 1200, to: 1380, expiry: 420 }];
export const EXIT_MIN = 1020, MIN_RR = 3, MAX_TRADES_PER_DAY = 3;

const lowerT = (S, t) => { let lo = 0, hi = S.n; while (lo < hi) { const m = (lo + hi) >> 1; if (S.t[m] < t) lo = m + 1; else hi = m; } return lo; };
const barEnd = (S, b) => S.t[b.i1] + MIN;

/**
 * Sens H4 pas à pas. À la fermeture de chaque bougie H4 m : prises (mèche au-delà, fermeture en deçà) et cassures (fermeture au-delà)
 * des sommets/creux intacts et des FVG H4 vierges connus avant m. Renvoie, pour chaque bougie, { t: fermeture, bias, since, highs,
 * lows, bearFvg, bullFvg } où highs/bearFvg sont les niveaux au-dessus encore intacts (objectifs d'achat) et lows/bullFvg ceux du dessous.
 */
export function h4Bias(X) {
  const { S, b4h: b } = X, H4F = X.fvg[2];
  let highs = [], lows = [], bullF = [], bearF = [], f = 0, bias = 0, since = -Infinity, why = null;
  const out = new Array(b.length);
  for (let m = 0; m < b.length; m++) {
    const bar = b[m];
    let bull = false, bear = false; const w = { 1: null, '-1': null }; // cause du signal (descriptif) : prise de liquidité, FVG H4, cassure
    const mark = (d, kind) => { if (d > 0) bull = true; else bear = true; if (!w[d] || kind === 'sweep') w[d] = kind; };
    if (m >= 1) {
      highs = highs.filter((h) => { if (bar.h <= h) return true; if (bar.c <= h) mark(-1, 'sweep'); else mark(1, 'break'); return false; });
      lows = lows.filter((l) => { if (bar.l >= l) return true; if (bar.c >= l) mark(1, 'sweep'); else mark(-1, 'break'); return false; });
      bullF = bullF.filter((z) => { if (bar.l > z.top) return true; if (bar.c >= z.bot) mark(1, 'fvg'); else mark(-1, 'break'); return false; });
      bearF = bearF.filter((z) => { if (bar.h < z.bot) return true; if (bar.c <= z.top) mark(-1, 'fvg'); else mark(1, 'break'); return false; });
      const nb = bull && !bear ? 1 : bear && !bull ? -1 : bias;
      if (nb !== bias) { bias = nb; since = barEnd(S, bar); why = w[nb]; }
    }
    // sommet / creux de la bougie m-1, confirmé à la fermeture de m ; FVG H4 dont la bougie C est m
    if (m >= 2) {
      const p = b[m - 1];
      if (p.h > b[m - 2].h && p.h > bar.h) highs.push(p.h);
      if (p.l < b[m - 2].l && p.l < bar.l) lows.push(p.l);
    }
    while (f < H4F.length && H4F[f].k <= m) { const z = H4F[f++]; if (z.k === m) (z.dir > 0 ? bullF : bearF).push(z); }
    out[m] = { t: barEnd(S, bar), bias, since, why, highs: highs.slice(), lows: lows.slice(), bearFvg: bearF.map((z) => z.bot), bullFvg: bullF.map((z) => z.top) };
  }
  return out;
}

/** BMS M15 : fermeture au-delà du dernier sommet (creux) M15 confirmé (bougie plus haute que ses deux voisines). [{ t, dir }] */
export function m15Bms(X) { return bmsOf(X.S, X.b15); }

/** Même définition sur n'importe quelles bougies (M3 : Daily). */
export function bmsOf(S, b) {
  const out = [];
  let hi = null, lo = null;
  for (let q = 2; q < b.length; q++) {
    const bar = b[q];
    if (hi !== null && bar.c > hi) { out.push({ t: barEnd(S, bar), dir: 1 }); hi = null; }
    if (lo !== null && bar.c < lo) { out.push({ t: barEnd(S, bar), dir: -1 }); lo = null; }
    const p = b[q - 1];
    if (p.h > b[q - 2].h && p.h > bar.h) hi = p.h;
    if (p.l < b[q - 2].l && p.l < bar.l) lo = p.l;
  }
  return out;
}

/** Objectif : niveau le plus proche au-delà de `from` dans le sens `dir` ; le 2e si l'écart 1er→2e < la moitié de from→1er. */
export function pickTarget(levels, from, dir) {
  const beyond = levels.filter((x) => (dir > 0 ? x > from : x < from)).sort((a, c) => (dir > 0 ? a - c : c - a));
  if (!beyond.length) return null;
  const [t1, t2] = beyond;
  return t2 !== undefined && Math.abs(t2 - t1) < 0.5 * Math.abs(t1 - from) ? t2 : t1;
}

/** Échelle d'entrée (section 4) : liste d'ordres [{ entry, stop }] (le 2e seulement après un stop du 1er), ou null. */
export function entryPlan(z, A, target, dir) {
  const E = dir > 0 ? z.top : z.bot, M = (z.top + z.bot) / 2, SA = dir > 0 ? A.l : A.h;
  const rr = (e, s) => (dir > 0 ? (target - e) / (e - s) : (e - target) / (s - e));
  const ok = (e, s) => (dir > 0 ? e > s : e < s) && rr(e, s) >= MIN_RR;
  if (ok(E, SA)) return [{ entry: E, stop: SA }];
  if (ok(E, M)) return ok(M, SA) ? [{ entry: E, stop: M }, { entry: M, stop: SA }] : [{ entry: E, stop: M }];
  if (ok(M, SA)) return [{ entry: M, stop: SA }];
  return null;
}

/**
 * Un ordre limite puis la position, minute par minute (mêmes conventions que simulate : stop d'abord, y compris dans la minute
 * d'entrée ; objectif à partir de la minute suivante ; sortie au marché à exitAt). `updates` : [{ t, stop }] triés (stop suiveur).
 * @returns {{ missed, until } | { entryTime, fill, exitTime, exit, reason, risk, r }}
 */
export function runOrder(S, { dir, i, entry, stop, target, expiry, exitAt, spread = 0, swap = () => 0, updates = [], beAt = null, gapExit = false }) {
  const buy = dir > 0;
  let fill = null;
  for (; i < S.n && S.t[i] < expiry; i++) {
    if (buy ? S.l[i] + spread <= entry : S.h[i] >= entry) { fill = buy ? Math.min(entry, S.o[i] + spread) : Math.max(entry, S.o[i]); break; }
    if (buy ? S.h[i] >= target : S.l[i] + spread <= target) return { missed: 'target-first', until: S.t[i] };
  }
  if (fill === null) return { missed: 'expired', until: expiry };
  if (buy ? fill <= stop : fill >= stop) return { missed: 'stop-crossed', until: S.t[i] };
  const risk = Math.abs(fill - stop), t0 = S.t[i];
  let sl = stop, u = 0, j = i, exit = null, reason = 'time', best = 0;
  while (u < updates.length && updates[u].t <= t0) u++;
  for (; j < S.n; j++) {
    if (j > i && S.t[j] >= exitAt) {
      // gapExit (LY) : si l'heure de sortie tombe pendant une fermeture (week-end), sortie à la dernière clôture avant, pas à la réouverture
      if (gapExit && S.t[j] - S.t[j - 1] > 30 * MIN && j - 1 > i) { j--; exit = buy ? S.c[j] : S.c[j] + spread; } else exit = buy ? S.o[j] : S.o[j] + spread;
      break;
    }
    for (; u < updates.length && updates[u].t <= S.t[j]; u++) if (buy ? updates[u].stop > sl : updates[u].stop < sl) sl = updates[u].stop;
    if (buy ? S.l[j] <= sl : S.h[j] + spread >= sl) { exit = j > i ? (buy ? Math.min(S.o[j], sl) : Math.max(S.o[j] + spread, sl)) : sl; reason = sl === stop ? 'stop' : sl === fill ? 'breakeven' : 'trail'; break; }
    if (j > i && (buy ? S.h[j] >= target : S.l[j] + spread <= target)) { exit = target; reason = 'target'; break; }
    best = Math.max(best, buy ? S.h[j] - fill : fill - (S.l[j] + spread));
    if (beAt != null && best >= beAt * risk && (buy ? sl < fill : sl > fill)) sl = fill; // M4 : breakeven, actif la minute suivante
  }
  if (exit === null) { j = S.n - 1; exit = buy ? S.c[j] : S.c[j] + spread; reason = 'end'; }
  const pnl = (buy ? exit - fill : fill - exit) + swap(dir, t0, S.t[j], fill);
  return { entryTime: t0, fill, exitTime: S.t[j], exit, reason, risk, r: pnl / risk };
}

/**
 * Signaux (FVG M15 qualifiés) de la méthode. opts.useBias = false donne la référence B0 (sens = celui du dernier BMS M15).
 * @returns [{ tau, dir, z, A, i, target, plan, expiry, exitAt, win }]
 */
export function signals(X, bias, bms, { useBias = true, discount = false, daily = null, why = null } = {}) {
  const { S, b15, b4h } = X, out = [];
  let dq = 0, dDir = 0;
  let q = 0, lastBull = -Infinity, lastBear = -Infinity;
  const fv = X.fvg[0].slice().sort((a, c) => a.k - c.k);
  for (const z of fv) {
    const k = z.k, j = k + 1; if (k < 3 || j >= b15.length - 1) continue;
    const D = b15[j], tau = barEnd(S, D), nm = nyMin(tau);
    const win = WINDOWS.findIndex((w) => nm >= w.from && nm < w.to); if (win < 0) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue; // D touche la zone
    if (b15[j + 1].t - tau > 5 * MIN) continue; // marché fermé juste après
    while (q < bms.length && bms[q].t <= tau) { if (bms[q].dir > 0) lastBull = bms[q].t; else lastBear = bms[q].t; q++; }
    const i = D.i1 + 1;
    // sens H4 connu à tau : dernière H4 fermée
    let m = -1; { let lo = 0, hi = b4h.length; while (lo < hi) { const x = (lo + hi) >> 1; if (bias[x].t <= tau) lo = x + 1; else hi = x; } m = lo - 1; }
    if (m < 0) continue;
    const st = bias[m];
    if (daily) { while (dq < daily.length && daily[dq].t <= tau) dDir = daily[dq++].dir; if (dDir !== z.dir) continue; } // M3
    if (useBias) {
      if (st.bias !== z.dir) continue;
      const lastSame = z.dir > 0 ? lastBull : lastBear;
      if (!(lastSame > st.since)) continue; // BMS dans le sens, après le passage
      if (why && st.why !== why) continue; // SW : passage déclenché par une prise de liquidité
    } else if (!(z.dir > 0 ? lastBull > lastBear : lastBear > lastBull)) continue;
    // objectifs encore intacts, y compris depuis la dernière fermeture H4
    let ext = z.dir > 0 ? -Infinity : Infinity;
    for (let x = b4h[m].i1 + 1; x < i; x++) ext = z.dir > 0 ? Math.max(ext, S.h[x]) : Math.min(ext, S.l[x]);
    const levels = (z.dir > 0 ? [...st.highs, ...st.bearFvg] : [...st.lows, ...st.bullFvg]).filter((x) => (z.dir > 0 ? x > ext : x < ext));
    const E = z.dir > 0 ? z.top : z.bot;
    const target = pickTarget(levels, E, z.dir); if (target === null) continue;
    const fvgLevels = new Set(z.dir > 0 ? st.bearFvg : st.bullFvg), lastSame = z.dir > 0 ? lastBull : lastBear;
    if (discount) { // M2 : entrée dans la moitié discount (achat) / premium (vente) de la zone extrême depuis le passage -> objectif
      let x0 = lowerT(S, st.since), ext2 = z.dir > 0 ? Infinity : -Infinity;
      for (; x0 < i; x0++) ext2 = z.dir > 0 ? Math.min(ext2, S.l[x0]) : Math.max(ext2, S.h[x0]);
      if (z.dir > 0 ? E > (ext2 + target) / 2 : E < (ext2 + target) / 2) continue;
    }
    const A = b15[k - 2], plan = entryPlan(z, A, target, z.dir); if (!plan) continue;
    const h1 = lastDoneBar(X.b1h, i), atr = h1 >= 0 ? X.atr1h[h1] : null;
    // caractéristiques connues à tau (descriptif seulement : elles ne changent aucune décision)
    const f = { why: st.why, biasAgeH: (tau - st.since) / 3600000, bmsAgeMin: (tau - lastSame) / MIN, targetType: fvgLevels.has(target) ? 'fvg' : 'sommet', zoneAtr: atr ? (z.top - z.bot) / atr : null, targetAtr: atr ? Math.abs(target - E) / atr : null };
    out.push({ tau, dir: z.dir, z, A, i, target, plan, atr, expiry: nextNyTime(tau, WINDOWS[win].expiry), exitAt: nextNyTime(tau, EXIT_MIN), win, f });
  }
  return out;
}

/** Stop suiveur : à la fermeture de chaque C d'un FVG M15 du sens, stop sous la mèche de sa bougie A. */
export function trailUpdates(X, dir) {
  const { S, b15 } = X;
  return X.fvg[0].filter((z) => z.dir === dir && z.k >= 2).map((z) => ({ t: barEnd(S, b15[z.k]), stop: dir > 0 ? b15[z.k - 2].l : b15[z.k - 2].h })).sort((a, c) => a.t - c.t);
}

/** Exécution : une chose à la fois, au plus 3 trades remplis par jour. opts : { trail, spread(price), swap } */
export function execute(X, sigs, { trail = false, spread = () => 0, swap = () => 0, fixedRR = null, beAt = null, reentryMin = null, tightAtr = null, retries = 0 } = {}) {
  const { S, b15 } = X, trades = [], perDay = new Map();
  // RE : FVG M15 triés par fermeture de C, pour trouver vite le premier FVG du sens formé après un stop
  const fvgByClose = reentryMin ? X.fvg[0].filter((z) => z.k >= 2).map((z) => ({ z, tc: barEnd(S, b15[z.k]) })).sort((a, c) => a.tc - c.tc) : [];
  const firstAfter = (t) => { let lo = 0, hi = fvgByClose.length; while (lo < hi) { const m = (lo + hi) >> 1; if (fvgByClose[m].tc <= t) lo = m + 1; else hi = m; } return lo; };
  const upd = { 1: trail ? trailUpdates(X, 1) : [], '-1': trail ? trailUpdates(X, -1) : [] };
  let busy = -Infinity;
  for (const s of sigs) {
    if (s.tau < busy) continue;
    const day = dayKey(s.tau);
    let i = s.i;
    busy = s.tau;
    if (tightAtr) { // T0/T1 : stop serré à tightAtr × ATR H1, puis réentrées au marché à la minute suivante (même distance)
      if (!s.atr) continue;
      const E = s.dir > 0 ? s.z.top : s.z.bot, dist = tightAtr * s.atr;
      if (Math.abs(s.target - E) / dist < MIN_RR) continue;
      let entry = E, stop = E - s.dir * dist, tries = 0;
      for (;;) {
        if ((perDay.get(day) || 0) >= MAX_TRADES_PER_DAY) break;
        const r = runOrder(S, { dir: s.dir, i, entry, stop, target: s.target, expiry: tries ? s.exitAt : s.expiry, exitAt: s.exitAt, spread: spread(E), swap, beAt });
        if (r.missed) { busy = Math.max(busy, r.until); break; }
        perDay.set(day, (perDay.get(day) || 0) + 1);
        trades.push({ ...r, dir: s.dir, tau: s.tau, day, step: tries ? 're' : 1, win: s.win, target: s.target, f: { ...s.f }, plannedRR: Math.abs(s.target - r.fill) / dist });
        busy = Math.max(busy, r.exitTime);
        if (r.reason !== 'stop' || tries >= retries) break;
        i = lowerT(S, r.exitTime) + 1; if (i >= S.n || S.t[i] >= s.exitAt) break;
        const px = S.o[i] + (s.dir > 0 ? spread(E) : 0);
        if (Math.abs(s.target - px) / dist < MIN_RR || (s.dir > 0 ? px >= s.target : px <= s.target)) break;
        entry = s.dir > 0 ? Infinity : -Infinity; stop = px - s.dir * dist; tries++; // au marché
      }
      continue;
    }
    for (let o = 0; o < s.plan.length; o++) {
      if ((perDay.get(day) || 0) >= MAX_TRADES_PER_DAY) break;
      const { entry, stop } = s.plan[o];
      const target = fixedRR ? entry + s.dir * fixedRR * Math.abs(entry - stop) : s.target; // M1 : objectif fixe
      const r = runOrder(S, { dir: s.dir, i, entry, stop, target, expiry: s.expiry, exitAt: s.exitAt, spread: spread(entry), swap, updates: upd[s.dir], beAt });
      if (r.missed) { busy = Math.max(busy, r.until); break; }
      perDay.set(day, (perDay.get(day) || 0) + 1);
      trades.push({ ...r, dir: s.dir, tau: s.tau, day, step: o + 1, win: s.win, target, f: { ...s.f }, plannedRR: Math.abs(target - entry) / Math.abs(entry - stop) });
      busy = Math.max(busy, r.exitTime);
      if (r.reason !== 'stop') break; // l'échelle ne continue qu'après un stop
      i = lowerT(S, r.exitTime);
    }
    // RE : réentrées rapides après un stop (même sens, même objectif, au moins 3R), enchaînées tant que la limite du jour le permet
    let last = trades[trades.length - 1];
    while (reentryMin && last && last.tau === s.tau && last.reason === 'stop' && (perDay.get(day) || 0) < MAX_TRADES_PER_DAY) {
      const until = last.exitTime + reentryMin * MIN;
      let q = firstAfter(last.exitTime - 1), hit = null;
      for (; q < fvgByClose.length && fvgByClose[q].tc <= until; q++) if (fvgByClose[q].z.dir === s.dir && fvgByClose[q].z.k - 2 >= 0) { hit = fvgByClose[q]; break; }
      if (!hit) break;
      const z = hit.z, A = b15[z.k - 2], entry = s.dir > 0 ? z.top : z.bot, stop = s.dir > 0 ? A.l : A.h;
      const rr = Math.abs(s.target - entry) / Math.abs(entry - stop);
      if (!(s.dir > 0 ? entry > stop && s.target > entry : entry < stop && s.target < entry) || rr < MIN_RR) break;
      const target = fixedRR ? entry + s.dir * fixedRR * Math.abs(entry - stop) : s.target;
      const r = runOrder(S, { dir: s.dir, i: lowerT(S, hit.tc), entry, stop, target, expiry: Math.min(until, s.exitAt), exitAt: s.exitAt, spread: spread(entry), swap, updates: upd[s.dir], beAt });
      if (r.missed) { busy = Math.max(busy, r.until); break; }
      perDay.set(day, (perDay.get(day) || 0) + 1);
      last = { ...r, dir: s.dir, tau: s.tau, day, step: 're', win: s.win, target, f: { ...s.f }, plannedRR: rr };
      trades.push(last);
      busy = Math.max(busy, r.exitTime);
    }
  }
  return trades;
}

/**
 * LD (preregistration-esdras-leftfvg-2026-09-27.md) : FVG M15 (D hors zone, fenêtres 7-11 h / 20-23 h) vers le FVG M15 opposé non testé
 * « à gauche » le plus proche (formé 8 à 192 bougies avant C, jamais touché jusqu'à D) ; objectif = son bord proche. Confirmations
 * facultatives : (a) le prix est entré dans un FVG H4 du sens encore valide dans les 16 dernières bougies M15 ; (b) dernier BMS H4 dans
 * le sens ; (c) prise du plus bas (haut) de la veille puis BMS M15 du sens dans les 32 dernières bougies. Entrée : échelle 3R de entryPlan.
 */
export function signalsLeft(X, { a = false, b = false, c = false } = {}) {
  const { S, b15, b4h, bD } = X, out = [];
  const f15 = X.fvg[0].slice().sort((p, q) => p.k - q.k), f4 = X.fvg[2];
  const h4b = b ? bmsOf(S, b4h) : [], m15b = c ? bmsOf(S, b15) : [];
  const dayIdx = new Map(); for (let d = 0; d < bD.length; d++) dayIdx.set(dayKey(bD[d].t), d);
  const firstK = (k) => { let lo = 0, hi = f15.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f15[m].k < k) lo = m + 1; else hi = m; } return lo; };
  let hq = 0, hDir = 0;
  for (const z of f15) {
    const k = z.k, j = k + 1; if (k < 34 || j >= b15.length - 1) continue;
    const D = b15[j], tau = barEnd(S, D), nm = nyMin(tau);
    const win = WINDOWS.findIndex((w) => nm >= w.from && nm < w.to); if (win < 0) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    if (b15[j + 1].t - tau > 5 * MIN) continue;
    const dir = z.dir, E = dir > 0 ? z.top : z.bot, i = D.i1 + 1;
    while (hq < h4b.length && h4b[hq].t <= tau) hDir = h4b[hq++].dir;
    // objectif : FVG opposé non testé à gauche le plus proche dans le sens du trade
    let target = null;
    for (let q = firstK(k - 192); q < f15.length && f15[q].k <= k - 8; q++) {
      const y = f15[q]; if (y.dir !== -dir || y.touch <= j) continue;
      const lvl = dir > 0 ? y.bot : y.top;
      if ((dir > 0 ? lvl > E : lvl < E) && (target === null || (dir > 0 ? lvl < target : lvl > target))) target = lvl;
    }
    if (target === null) continue;
    if (a) { // (a) entré dans un FVG H4 du sens encore valide
      const h = lastDoneBar(b4h, i);
      let lo = Infinity, hi = -Infinity; for (let m = j - 15; m <= j; m++) { lo = Math.min(lo, b15[m].l); hi = Math.max(hi, b15[m].h); }
      const ok = f4.some((y) => y.dir === dir && y.k < h && y.k > h - 400 && y.dead > h && (dir > 0 ? lo <= y.top && D.c > y.bot : hi >= y.bot && D.c < y.top));
      if (!ok) continue;
    }
    if (b && hDir !== dir) continue; // (b) tendance H4
    if (c) { // (c) prise du plus bas (haut) de la veille puis BMS M15 du sens
      const d = dayIdx.get(dayKey(tau)), prev = d > 0 ? bD[d - 1] : null; if (!prev) continue;
      let sw = -1; for (let m = j - 31; m <= j; m++) if (dir > 0 ? b15[m].l < prev.l : b15[m].h > prev.h) { sw = m; break; }
      if (sw < 0) continue;
      const tSw = barEnd(S, b15[sw]);
      if (!m15b.some((x) => x.dir === dir && x.t > tSw && x.t <= tau)) continue;
    }
    const A = b15[k - 2], plan = entryPlan(z, A, target, dir); if (!plan) continue;
    out.push({ tau, dir, z, A, i, target, plan, atr: null, expiry: nextNyTime(tau, WINDOWS[win].expiry), exitAt: nextNyTime(tau, EXIT_MIN), win, f: {} });
  }
  return out;
}

/**
 * LX (2026-09-28, règle dite par Esdras après ses premiers trades du simulateur) : « un FVG 15 min à gauche en haut, un BMS dans son sens,
 * ensuite un FVG 15 min haussier qu'on entre pour cibler le FVG 15 min baissier à gauche » (achat ; l'inverse pour une vente).
 * - BMS M15 (fermeture au-delà du dernier sommet/creux à 1 bougie) dans le sens du trade, bougie q.
 * - FVG d'entrée : le premier FVG M15 du sens formé après le BMS (bougie C entre q + 1 et q + 4, donc bougie B = celle du BMS ou
 *   après : « ensuite on a un FVG ») ; ordre limite à son bord proche.
 * - Objectif : parmi les FVG M15 opposés formés avant q (au plus `lookback` bougies avant) et pas entièrement remplis au moment de
 *   l'ordre (le prix n'est pas allé au-delà de leur bord lointain) et d'au moins 0,1 % du prix de hauteur (il ignore les FVG
 *   minuscules), le plus proche au-delà de l'entrée ; objectif = bord proche de sa partie encore vide (« pas besoin d'être vierge »).
 * - Stop (stopMode) : 'A' = mèche de la bougie A du FVG d'entrée (entrée au milieu du FVG si le bord ne donne pas 3R) ; 'edge' = bord
 *   lointain du FVG - 0,5 × sa hauteur ; 'mid' = entre les deux.
 * - L'ordre est posé à la fermeture de la plus tardive des bougies q et C, si c'est entre 7 h et 11 h ou entre 18 h et 23 h NY ; il peut
 *   se remplir après (ordre limite posé à l'avance), pendant `expiryH` heures ; sortie au plus tard à 17 h NY suivant. Au moins 3R.
 * - sweep (facultatif, descriptif) : la jambe du BMS a pris le plus bas (haut) de la veille dans les 32 bougies avant q.
 */
export const LX_WINDOWS = [{ from: 420, to: 660 }, { from: 1080, to: 1380 }];
export function bmsIdx(b) {
  const out = []; let hi = null, lo = null;
  for (let q = 2; q < b.length; q++) {
    const bar = b[q];
    if (hi !== null && bar.c > hi) { out.push({ q, dir: 1 }); hi = null; }
    if (lo !== null && bar.c < lo) { out.push({ q, dir: -1 }); lo = null; }
    const p = b[q - 1];
    if (p.h > b[q - 2].h && p.h > bar.h) hi = p.h;
    if (p.l < b[q - 2].l && p.l < bar.l) lo = p.l;
  }
  return out;
}
function sparse(arr, f) { // table pour le max / min d'un intervalle en O(1)
  const T = [Float64Array.from(arr)];
  for (let s = 1; (1 << s) <= arr.length; s++) { const p = T[s - 1], h = 1 << (s - 1), c = new Float64Array(arr.length - (1 << s) + 1); for (let x = 0; x < c.length; x++) c[x] = f(p[x], p[x + h]); T.push(c); }
  return (a, b) => { if (b < a) return null; const s = 31 - Math.clz32(b - a + 1); return f(T[s][a], T[s][b - (1 << s) + 1]); };
}
export function signalsLX(X, { stopMode = 'A', lookback = 288, expiryH = 8, minRR = MIN_RR, sweep = false, minTargetPct = 0.001 } = {}) {
  const { S, b15, bD } = X, out = [];
  const f15 = X.fvg[0].slice().sort((p, q) => p.k - q.k);
  const maxH = sparse(b15.map((b) => b.h), Math.max), minL = sparse(b15.map((b) => b.l), Math.min);
  const firstK = (k) => { let lo = 0, hi = f15.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f15[m].k < k) lo = m + 1; else hi = m; } return lo; };
  const dayIdx = new Map(); for (let d = 0; d < bD.length; d++) dayIdx.set(dayKey(bD[d].t), d);
  for (const { q, dir } of bmsIdx(b15)) {
    let z = null;
    for (let x = firstK(q + 1); x < f15.length && f15[x].k <= q + 4; x++) if (f15[x].dir === dir) { z = f15[x]; break; }
    if (!z || z.k < 2) continue;
    const j0 = Math.max(q, z.k), t0 = barEnd(S, b15[j0]);
    if (j0 + 1 >= b15.length) continue;
    const E = dir > 0 ? z.top : z.bot, A = b15[z.k - 2], H = z.top - z.bot;
    // l'ordre est posé dans une fenêtre : tout de suite si le setup s'y forme, sinon à l'ouverture de la fenêtre suivante (au plus
    // 12 h après), à condition que le prix n'ait touché ni l'entrée ni un objectif entre-temps (le setup est encore intact)
    let tau = t0, win = LX_WINDOWS.findIndex((w) => nyMin(t0) >= w.from && nyMin(t0) < w.to), jp = j0;
    if (win < 0) {
      const opens = LX_WINDOWS.map((w, x) => ({ x, t: nextNyTime(t0, w.from) })).sort((a, c) => a.t - c.t)[0];
      if (opens.t - t0 > 12 * 3600000) continue;
      tau = opens.t; win = opens.x;
      while (jp + 1 < b15.length && barEnd(S, b15[jp + 1]) <= tau) jp++;
      if (jp > j0) { const lo = minL(j0 + 1, jp), hi = maxH(j0 + 1, jp); if (dir > 0 ? lo <= E : hi >= E) continue; }
    }
    if (jp + 1 >= b15.length) continue;
    const stopA = dir > 0 ? A.l : A.h, stopE = dir > 0 ? z.bot - 0.5 * H : z.top + 0.5 * H;
    const stop = stopMode === 'A' ? stopA : stopMode === 'edge' ? stopE : (stopA + stopE) / 2;
    if (!(dir > 0 ? stop < E : stop > E)) continue;
    let target = null;
    for (let x = firstK(q - lookback); x < f15.length && f15[x].k < q; x++) {
      const y = f15[x]; if (y.dir !== -dir || y.top - y.bot < minTargetPct * E) continue;
      if (dir > 0) { const m = maxH(y.k + 1, jp); if (m !== null && m >= y.top) continue; const lvl = Math.max(y.bot, m ?? -Infinity); if (lvl > E && (target === null || lvl < target)) target = lvl; }
      else { const m = minL(y.k + 1, jp); if (m !== null && m <= y.bot) continue; const lvl = Math.min(y.top, m ?? Infinity); if (lvl < E && (target === null || lvl > target)) target = lvl; }
    }
    if (target === null) continue;
    // stop à la mèche A : entrée au bord si ça donne au moins 3R, sinon au milieu du FVG (« 50 % pour un grand FVG »)
    let entry = E, rr = Math.abs(target - E) / Math.abs(E - stop);
    if (stopMode === 'A' && rr < minRR) { const Mid = (z.top + z.bot) / 2; entry = Mid; rr = Math.abs(target - Mid) / Math.abs(Mid - stop); }
    if (rr < minRR) continue;
    let swept = null;
    { const d = dayIdx.get(dayKey(tau)), prev = d > 0 ? bD[d - 1] : null;
      if (prev) { const lo = minL(Math.max(0, q - 32), q), hi = maxH(Math.max(0, q - 32), q); swept = dir > 0 ? lo < prev.l : hi > prev.h; } }
    if (sweep && !swept) continue;
    out.push({ tau, dir, z, A, i: b15[jp].i1 + 1, target, plan: [{ entry, stop }], expiry: tau + expiryH * 3600000, exitAt: nextNyTime(tau, EXIT_MIN), win, f: { swept, rr, q } });
  }
  return out.sort((a, c) => a.tau - c.tau);
}

/**
 * LY, « version échelle » (2026-09-28, Esdras, séances à l'aveugle de juin 2017 et 2018) :
 * - zones au sens large : trois bougies A, B, C dont les CORPS de A et C ne se touchent pas (« les mèches peuvent se chevaucher, pas
 *   leurs corps », le volume imbalance d'ICT) ; zone = vrai vide [haut de A, bas de C] s'il existe, sinon [haut du corps de A, bas du
 *   corps de C] (achat ; l'inverse pour une vente) ;
 * - BMS M15 bougie q ; jambe = depuis le plus bas (haut) des 48 bougies avant q ; zones du sens formées dans la jambe (C entre le
 *   plus bas et q + 1), jamais retouchées depuis, fusionnées si elles se chevauchent, triées de la plus proche du prix à la plus loin ;
 * - échelle d'au plus 3 entrées limite : entrée k au bord proche de la zone k, stop k au bord proche de la zone k + 1 (« si ce FVG
 *   tient, le prix n'ira pas chercher le suivant »), dernier stop au bout de la jambe ; l'entrée suivante ne sert qu'après un stop ;
 * - objectifs en chaîne : FVG M15 opposés à gauche (formés avant q, au plus 288 bougies, au moins 0,1 % du prix, pas entièrement
 *   remplis), bord proche de leur partie vide ; chaque entrée vise le plus proche qui donne au moins 3R ; s'il est touché avant le
 *   remplissage, l'ordre reste et vise le suivant (encore au moins 3R) ;
 * - l'ordre est posé à la fermeture de q + 1, dans les fenêtres 7-11 h / 18-23 h NY (sinon à l'ouverture de la suivante, au plus 12 h
 *   après, si la première zone n'a pas été touchée entre-temps) ; valable 8 h ; sortie au plus tard à 17 h NY ; 3 trades par jour.
 */
export function wideZones(b) {
  const out = [], bt = (x) => Math.max(x.o, x.c), bb = (x) => Math.min(x.o, x.c);
  for (let k = 2; k < b.length; k++) {
    const A = b[k - 2], C = b[k];
    if (bb(C) > bt(A)) out.push({ k, dir: 1, bot: C.l > A.h ? A.h : bt(A), top: C.l > A.h ? C.l : bb(C) });
    if (bt(C) < bb(A)) out.push({ k, dir: -1, bot: C.h < A.l ? C.h : bt(C), top: C.h < A.l ? A.l : bb(A) });
  }
  return out;
}
// Options du mode quiz du Simulateur (2026-09-28, Esdras : « les entrées sont très loin du prix ») : minZonePct (hauteur minimale d'une
// zone, en part du prix), minRiskAtr (stop d'au moins x ATR M15), maxEntryAtr (1re entrée à au plus x ATR M15 du prix à la pose).
// Par défaut elles sont neutres : la règle testée (preregistration-esdras-ly) reste la même.
export function signalsLY(X, { lookback = 288, expiryH = 8, minRR = MIN_RR, minTargetPct = 0.001, rungs = 3, legBars = 48, minZonePct = 0, minRiskAtr = 0, maxEntryAtr = Infinity } = {}) {
  const { S, b15 } = X, out = [];
  const f15 = X.fvg[0].slice().sort((p, q) => p.k - q.k), zones = wideZones(b15);
  const maxH = sparse(b15.map((b) => b.h), Math.max), minL = sparse(b15.map((b) => b.l), Math.min);
  const firstK = (arr, k) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].k < k) lo = m + 1; else hi = m; } return lo; };
  for (const { q, dir } of bmsIdx(b15)) {
    const jc = q + 1; if (jc + 1 >= b15.length) continue;
    // bout de la jambe
    let L = q; for (let m = Math.max(0, q - legBars); m <= q; m++) if (dir > 0 ? b15[m].l < b15[L].l : b15[m].h > b15[L].h) L = m;
    const legEnd = dir > 0 ? b15[L].l : b15[L].h;
    // pose de l'ordre
    const t0 = barEnd(S, b15[jc]);
    let tau = t0, win = LX_WINDOWS.findIndex((w) => nyMin(t0) >= w.from && nyMin(t0) < w.to), jp = jc;
    if (win < 0) {
      const opens = LX_WINDOWS.map((w, x) => ({ x, t: nextNyTime(t0, w.from) })).sort((a, c) => a.t - c.t)[0];
      if (opens.t - t0 > 12 * 3600000) continue;
      tau = opens.t; win = opens.x;
      while (jp + 1 < b15.length && barEnd(S, b15[jp + 1]) <= tau) jp++;
    }
    if (jp + 1 >= b15.length) continue;
    // zones de la jambe encore vierges à la pose, fusionnées, de la plus proche à la plus lointaine
    let zs = [];
    for (let x = firstK(zones, L + 1); x < zones.length && zones[x].k <= jc; x++) {
      const z = zones[x]; if (z.dir !== dir || z.top - z.bot < minZonePct * b15[q].c) continue;
      if (dir > 0 ? z.bot <= legEnd : z.top >= legEnd) continue;
      if (z.k + 1 <= jp) { if (dir > 0 ? minL(z.k + 1, jp) <= z.top : maxH(z.k + 1, jp) >= z.bot) continue; }
      zs.push({ bot: z.bot, top: z.top, k: z.k });
    }
    zs.sort((a, c) => (dir > 0 ? c.top - a.top : a.bot - c.bot));
    const merged = [];
    for (const z of zs) { const p = merged[merged.length - 1]; if (p && (dir > 0 ? z.top >= p.bot : z.bot <= p.top)) { p.bot = Math.min(p.bot, z.bot); p.top = Math.max(p.top, z.top); } else merged.push({ ...z }); }
    if (!merged.length) continue;
    const near = (z) => (dir > 0 ? z.top : z.bot), atr = X.atr15[jp] || 0;
    if (maxEntryAtr < Infinity && !(atr > 0 && Math.abs(b15[jp].c - near(merged[0])) <= maxEntryAtr * atr)) continue;
    // objectifs à gauche, du plus proche au plus lointain
    const E0 = near(merged[0]), targets = [];
    for (let x = firstK(f15, q - lookback); x < f15.length && f15[x].k < q; x++) {
      const y = f15[x]; if (y.dir !== -dir || y.top - y.bot < minTargetPct * E0) continue;
      if (dir > 0) { const m = maxH(y.k + 1, jp); if (m !== null && m >= y.top) continue; const lvl = Math.max(y.bot, m ?? -Infinity); if (lvl > E0) targets.push(lvl); }
      else { const m = minL(y.k + 1, jp); if (m !== null && m <= y.bot) continue; const lvl = Math.min(y.top, m ?? Infinity); if (lvl < E0) targets.push(lvl); }
    }
    if (!targets.length) continue;
    targets.sort((a, c) => (dir > 0 ? a - c : c - a));
    const plan = [];
    for (let r = 0; r < Math.min(rungs, merged.length); r++) {
      const entry = near(merged[r]), stop = r + 1 < merged.length && r + 1 < rungs ? near(merged[r + 1]) : legEnd;
      if (!(dir > 0 ? stop < entry : stop > entry)) break;
      if (minRiskAtr > 0 && !(Math.abs(entry - stop) >= minRiskAtr * atr)) break;
      plan.push({ entry, stop });
    }
    if (!plan.length) continue;
    const ok = targets.some((t) => Math.abs(t - plan[0].entry) / Math.abs(plan[0].entry - plan[0].stop) >= minRR);
    if (!ok) continue;
    out.push({ tau, dir, i: b15[jp].i1 + 1, plan, targets, minRR, expiry: tau + expiryH * 3600000, exitAt: nextNyTime(tau, EXIT_MIN), win, f: { q, zones: merged.length } });
  }
  return out.sort((a, c) => a.tau - c.tau);
}
/** Exécution de LY : échelle d'entrées (la suivante après un stop), objectifs en chaîne, une chose à la fois, 3 trades remplis par jour. */
export function executeLY(X, sigs, { spread = () => 0, swap = () => 0 } = {}) {
  const { S } = X, trades = [], perDay = new Map();
  // un ordre pas encore rempli est annulé dès qu'un signal de l'autre sens apparaît (nouveau BMS contraire)
  const nextOpp = new Array(sigs.length).fill(Infinity);
  for (let x = sigs.length - 1, last = { 1: Infinity, '-1': Infinity }; x >= 0; x--) { nextOpp[x] = last[-sigs[x].dir]; last[sigs[x].dir] = sigs[x].tau; }
  let busy = -Infinity, lastTau = null;
  for (let x = 0; x < sigs.length; x++) {
    const s = sigs[x];
    if (s.tau < busy || s.tau === lastTau) continue; // une chose à la fois, et pas deux fois le même signal
    lastTau = s.tau;
    const expiry = Math.min(s.expiry, nextOpp[x]);
    const day = dayKey(s.tau);
    let i = s.i, reached = -1; busy = s.tau; // reached : indice du dernier objectif déjà touché
    rungs: for (let o = 0; o < s.plan.length; o++) {
      if ((perDay.get(day) || 0) >= MAX_TRADES_PER_DAY) break;
      const { entry, stop } = s.plan[o], risk = Math.abs(entry - stop);
      for (;;) {
        const ti = s.targets.findIndex((t, x) => x > reached && Math.abs(t - entry) / risk >= s.minRR);
        if (ti < 0) break rungs;
        const r = runOrder(S, { dir: s.dir, i, entry, stop, target: s.targets[ti], expiry, exitAt: s.exitAt, spread: spread(entry), swap, gapExit: true });
        if (r.missed === 'target-first') { reached = ti; i = lowerT(S, r.until); busy = Math.max(busy, r.until); continue; }
        if (r.missed) { busy = Math.max(busy, r.until); break rungs; }
        perDay.set(day, (perDay.get(day) || 0) + 1);
        trades.push({ ...r, dir: s.dir, tau: s.tau, day, step: o + 1, win: s.win, target: s.targets[ti], f: { ...s.f }, plannedRR: Math.abs(s.targets[ti] - entry) / risk });
        busy = Math.max(busy, r.exitTime);
        if (r.reason !== 'stop') break rungs;
        i = lowerT(S, r.exitTime);
        break;
      }
    }
  }
  return trades;
}
