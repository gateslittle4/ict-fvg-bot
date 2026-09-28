// fvgContext.js - FVG M15 et leur contexte au moment d'une décision (recherche de nuit, famille A « l'œil d'Esdras » et famille B).
// Pur et testé (test/fvgContext.test.js). Série M1 { t, o, h, l, c, n } en BID, temps moteur (comme loadM1 / nightLab.js).
//
// FVG M15 : trois bougies a, b, c ; haussier si bas(c) > haut(a) (zone [haut(a), bas(c)]), baissier si haut(c) < bas(a) (zone
// [haut(c), bas(a)]). Formé à la clôture de c. Mort à la première clôture M15 au-delà du bord opposé (sous le bas de la zone pour un
// FVG haussier). « Qualifié » à une clôture j pour un sens : le FVG vivant du sens le plus récent (au plus 24 bougies) dont la zone
// contient le prix, ou que le prix dépasse du côté du trade d'au plus 0,5 ATR H1 — la définition de l'analyse de ses trades.
import { makeBars, m15Key, h1Key, h4Key, dayKey, nyMin, atrSeries, lastDoneBar, MIN, HOUR } from './nightLab.js';

export const MAX_AGE = 24;

/** Toutes les bougies et séries utiles, calculées une fois. */
export function buildContext(S) {
  const b15 = makeBars(S, m15Key), b1h = makeBars(S, h1Key), b4h = makeBars(S, h4Key), bD = makeBars(S, dayKey);
  const X = { S, b15, b1h, b4h, bD, atr15: atrSeries(b15, 14), atr1h: atrSeries(b1h, 14), atrD: atrSeries(bD, 14) };
  X.fvg = [findFvgs(b15), findFvgs(b1h), findFvgs(b4h)]; // M15, H1, H4
  X.byEnd15 = indexByEnd(X.fvg[0]);
  return X;
}

/** FVG d'une série de bougies, avec la bougie de leur mort (clôture au-delà du bord opposé) et leur premier contact. */
export function findFvgs(bars) {
  const out = [];
  for (let k = 2; k < bars.length; k++) {
    const a = bars[k - 2], c = bars[k];
    if (c.l > a.h) out.push({ k, dir: 1, bot: a.h, top: c.l });
    if (c.h < a.l) out.push({ k, dir: -1, bot: c.h, top: a.l });
  }
  for (const z of out) {
    z.dead = Infinity; z.touch = Infinity;
    for (let m = z.k + 1; m < bars.length; m++) {
      const b = bars[m];
      if (z.touch === Infinity && (z.dir > 0 ? b.l <= z.top : b.h >= z.bot)) z.touch = m;
      if (z.dir > 0 ? b.c < z.bot : b.c > z.top) { z.dead = m; break; }
      if (m - z.k > 400) break; // au-delà de 400 bougies on ne s'en sert plus
    }
  }
  return out;
}
function indexByEnd(list) { const m = new Map(); for (const z of list) { const a = m.get(z.k) || []; a.push(z); m.set(z.k, a); } return m; }

/** ATR H1 connu à la minute i (dernière H1 terminée). */
export const atrH1At = (X, i) => { const j = lastDoneBar(X.b1h, i); return j >= 0 ? X.atr1h[j] : null; };

/**
 * FVG M15 qualifié le plus récent pour `dir` à la clôture de la bougie M15 j, au prix `price` (null si aucun).
 * @returns {{ z, k, age, where: 'in'|'beyond' } | null}
 */
export function qualifyingFvg(X, j, dir, price) {
  const atr = atrH1At(X, X.b15[j].i1 + 1);
  if (!atr) return null;
  for (let k = j; k >= Math.max(2, j - MAX_AGE); k--) {
    const list = X.byEnd15.get(k); if (!list) continue;
    for (const z of list) {
      if (z.dir !== dir || z.dead <= j) continue;
      const inZone = price >= z.bot && price <= z.top;
      const beyond = dir > 0 ? price > z.top && price - z.top <= 0.5 * atr : price < z.bot && z.bot - price <= 0.5 * atr;
      if (inZone || beyond) return { z, k, age: j - k, where: inZone ? 'in' : 'beyond' };
    }
  }
  return null;
}

/** Le prix est-il dans un FVG vivant du sens sur H1 (idx 1) ou H4 (idx 2), formé dans les `look` dernières bougies ? */
function inHtfFvg(X, idx, i, dir, price, look = 40) {
  const bars = idx === 1 ? X.b1h : X.b4h;
  const j = lastDoneBar(bars, i), list = X.fvg[idx];
  let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].k < j - look) lo = m + 1; else hi = m; } // triés par k
  for (let q = lo; q < list.length && list[q].k <= j; q++) {
    const z = list[q];
    if (z.dir !== dir || z.dead <= j) continue;
    if (price >= z.bot && price <= z.top) return 1;
  }
  return 0;
}

/**
 * Caractéristiques d'une décision au prix de clôture de la bougie M15 j, pour le FVG qualifié q (voir qualifyingFvg). Tout est connu à
 * la clôture de j (aucun regard vers le futur). Distances en ATR H1, orientées dans le sens du trade (> 0 = en faveur).
 */
export function featuresAt(X, j, dir, q) {
  const { S, b15 } = X;
  const i = b15[j].i1 + 1, price = b15[j].c, tau = b15[j].t + 15 * MIN;
  const atr = atrH1At(X, i); if (!atr) return null;
  const z = q.z, h = z.top - z.bot, mid = b15[z.k - 1];
  const a15 = X.atr15[z.k - 1];
  // plus grand éloignement du prix hors de la zone entre la formation et j, en hauteurs de zone (« distance 2x »)
  let far = 0; for (let m = z.k + 1; m <= j; m++) far = Math.max(far, dir > 0 ? b15[m].h - z.top : z.bot - b15[m].l);
  // journée en cours (18 h NY) et veille
  const jd = lastDoneBar(X.bD, i), today = X.bD[jd + 1] && X.bD[jd + 1].i0 <= i - 1 ? X.bD[jd + 1] : null, prev = X.bD[jd];
  let dh = -Infinity, dl = Infinity; if (today) for (let m = today.i0; m < i; m++) { if (S.h[m] > dh) dh = S.h[m]; if (S.l[m] < dl) dl = S.l[m]; }
  const pos = today && dh > dl ? (price - dl) / (dh - dl) : 0.5;
  // Asie = 19 h - minuit NY de la journée ; prise de l'Asie ensuite
  let ah = -Infinity, al = Infinity, after = { h: -Infinity, l: Infinity };
  if (today) for (let m = today.i0; m < i; m++) { const nm = nyMin(S.t[m]); if (nm >= 19 * 60) { if (S.h[m] > ah) ah = S.h[m]; if (S.l[m] < al) al = S.l[m]; } else if (nm < 18 * 60) { if (S.h[m] > after.h) after.h = S.h[m]; if (S.l[m] < after.l) after.l = S.l[m]; } }
  const closeAgo = (ms) => { let lo = 0, hi = i; const x = tau - ms; while (lo < hi) { const m = (lo + hi) >> 1; if (S.t[m] < x) lo = m + 1; else hi = m; } return S.c[Math.max(0, lo - 1)]; };
  const dClose = (n) => (jd - n >= 0 ? X.bD[jd - n].c : null);
  const trend20 = dClose(0) != null && dClose(20) != null ? Math.sign(dClose(0) - dClose(20)) * dir : 0;
  const atrD = X.atrD[jd];
  let atrD60 = 0, nD = 0; for (let m = Math.max(0, jd - 59); m <= jd; m++) if (X.atrD[m]) { atrD60 += X.atrD[m]; nD++; }
  // midnight open (00:00 NY) de la journée
  let midOpen = null; if (today) for (let m = today.i0; m < i; m++) if (nyMin(S.t[m]) < 18 * 60) { midOpen = S.o[m]; break; }
  // FVG opposé vivant juste devant le prix (moins d'1 ATR)
  let oppAhead = 0; for (let k = j; k >= Math.max(2, j - MAX_AGE); k--) for (const o of X.byEnd15.get(k) || []) if (o.dir === -dir && o.dead > j && (dir > 0 ? o.bot >= price && o.bot - price < atr : o.top <= price && price - o.top < atr)) oppAhead = 1;
  let stack = 0; for (let k = j; k >= Math.max(2, j - MAX_AGE); k--) for (const o of X.byEnd15.get(k) || []) if (o.dir === dir && o.dead > j && Math.abs((o.top + o.bot) / 2 - price) < atr) stack++;
  return {
    atrH1: atr,
    age: q.age,
    inZone: q.where === 'in' ? 1 : 0,
    size: h / atr,
    impBody: Math.abs(mid.c - mid.o) / atr,
    impM15: a15 ? (mid.h - mid.l) / a15 : 1,
    farZones: h > 0 ? far / h : 0,
    farAtr: far / atr,
    touched: z.touch < j ? 1 : 0,
    long: dir > 0 ? 1 : 0,
    hourNy: nyMin(tau) / 60,
    formedHourNy: nyMin(b15[z.k].t + 15 * MIN) / 60,
    posDay: dir > 0 ? pos : 1 - pos,
    r1h: (dir * (price - closeAgo(HOUR))) / atr,
    r4h: (dir * (price - closeAgo(4 * HOUR))) / atr,
    trend20,
    sweepPrevDay: prev && today ? (dir > 0 ? (dl < prev.l ? 1 : 0) : (dh > prev.h ? 1 : 0)) : 0,
    sweepAsia: ah > -Infinity && after.h > -Infinity ? (dir > 0 ? (after.l < al ? 1 : 0) : (after.h > ah ? 1 : 0)) : 0,
    inH1Fvg: inHtfFvg(X, 1, i, dir, price),
    inH4Fvg: inHtfFvg(X, 2, i, dir, price),
    oppAhead,
    stack,
    vsMidnight: midOpen != null ? (dir * (price - midOpen)) / atr : 0,
    vol: atrD && nD ? atrD / (atrD60 / nD) : 1,
  };
}
