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
export function runOrder(S, { dir, i, entry, stop, target, expiry, exitAt, spread = 0, swap = () => 0, updates = [], beAt = null }) {
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
    if (j > i && S.t[j] >= exitAt) { exit = buy ? S.o[j] : S.o[j] + spread; break; }
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
