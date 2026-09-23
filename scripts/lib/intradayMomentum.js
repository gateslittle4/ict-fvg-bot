// intradayMomentum.js - règles des trois stratégies de momentum intraday pré-enregistrées dans
// data/backtest-input/preregistration-intraday-momentum-2026-09-23.md (fonctions pures, testées dans test/intradayMomentum.test.js).
//   A. cassure du range d'ouverture 5 min (Zarattini & Aziz 2023)
//   B. « noise area » (Zarattini, Aziz & Barbon 2024)
//   C. dernière demi-heure dans le sens de la première (Gao, Han, Li & Zhou 2018)
// Barres M1 au bid, horodatées en ms UTC ; séance de New York 9:30-16:00, heure réelle (heure d'été comprise).

export const MIN = 60000;
export const DAY = 86400000;
export const SESSION_MINUTES = 390; // 9:30 -> 16:00
const OPEN_MINUTE = 9 * 60 + 30;

// --- Heure de New York réelle (règles US depuis 2007) ---
const sundayOf = (y, m, nth) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d) % 7) + 7 * (nth - 1); };
const dstCache = new Map();
export function nyOffsetMs(utc) {
  const y = new Date(utc).getUTCFullYear();
  if (!dstCache.has(y)) dstCache.set(y, [Date.UTC(y, 2, sundayOf(y, 2, 2), 7), Date.UTC(y, 10, sundayOf(y, 10, 1), 6)]);
  const [a, b] = dstCache.get(y);
  return (utc >= a && utc < b ? -4 : -5) * 3600000;
}

/**
 * Découpe une série M1 ({t,o,h,l,c,n}, typée) en séances de New York 9:30-16:00. Seules les séances qui ont une barre à 9:30
 * exactement sont gardées. Chaque séance : barres réelles (k = minutes depuis 9:30, t, o, h, l, c), `open` (ouverture de 9:30),
 * `close` (clôture de la dernière barre avant 16:00), `lastK`, et `cl[k]` = dernière clôture connue à la minute k (report avant).
 */
export function buildSessions(S) {
  const days = [];
  let cur = null;
  for (let i = 0; i < S.n; i++) {
    const utc = S.t[i];
    const local = utc + nyOffsetMs(utc);
    const dayNum = Math.floor(local / DAY);
    const k = Math.floor((local - dayNum * DAY) / MIN) - OPEN_MINUTE;
    if (k < 0 || k >= SESSION_MINUTES) continue;
    if (!cur || cur.dayNum !== dayNum) { cur = { dayNum, k: [], t: [], o: [], h: [], l: [], c: [] }; days.push(cur); }
    if (cur.k.length && k <= cur.k[cur.k.length - 1]) continue; // doublon / désordre : ignoré
    cur.k.push(k); cur.t.push(utc); cur.o.push(S.o[i]); cur.h.push(S.h[i]); cur.l.push(S.l[i]); cur.c.push(S.c[i]);
  }
  const out = [];
  for (const d of days) {
    if (d.k[0] !== 0) continue;
    d.date = new Date(d.dayNum * DAY).toISOString().slice(0, 10);
    d.open = d.o[0];
    d.close = d.c[d.c.length - 1];
    d.lastK = d.k[d.k.length - 1];
    d.closeTime = d.t[d.t.length - 1] + MIN;
    d.cl = new Float64Array(SESSION_MINUTES);
    let j = 0, last = d.o[0];
    for (let k = 0; k < SESSION_MINUTES; k++) { while (j < d.k.length && d.k[j] <= k) { last = d.c[j]; j++; } d.cl[k] = last; }
    out.push(d);
  }
  return out;
}

/** Index de la première barre réelle de la séance à la minute k ou après (-1 si aucune). */
export function barAtOrAfter(d, k) {
  let lo = 0, hi = d.k.length;
  while (hi > lo) { const m = (lo + hi) >> 1; if (d.k[m] >= k) hi = m; else lo = m + 1; }
  return lo < d.k.length ? lo : -1;
}

// Règlement minute par minute d'une position à stop/objectif fixes, depuis la barre `from` jusqu'à la fin de séance.
// Achat : stop et objectif lus sur le bid ; vente : déclenchés par l'ask (= bid + s). Stop d'abord dans une même minute.
function settleFixed(d, from, long, fill, stop, target, s) {
  for (let j = from; j < d.k.length; j++) {
    const stopHit = long ? d.l[j] <= stop : d.h[j] + s >= stop;
    if (stopHit) return { exit: long ? Math.min(d.o[j], stop) : Math.max(d.o[j] + s, stop), exitTime: d.t[j], reason: 'stop' };
    const tgtHit = target != null && (long ? d.h[j] >= target : d.l[j] + s <= target);
    if (tgtHit) return { exit: target, exitTime: d.t[j], reason: 'target' };
  }
  return { exit: long ? d.close : d.close + s, exitTime: d.closeTime - MIN, reason: 'close' };
}

/** A - cassure du range d'ouverture 5 min. Retourne null s'il n'y a pas de trade. `spreadAt(prix)` = spread au niveau de prix. */
export function orbTrade(d, spreadAt, { rr = 10, minStopSpreads = 3 } = {}) {
  let hi = -Infinity, lo = Infinity, last = -1;
  for (let j = 0; j < d.k.length && d.k[j] <= 4; j++) { if (d.h[j] > hi) hi = d.h[j]; if (d.l[j] < lo) lo = d.l[j]; last = j; }
  if (last < 0) return null;
  const o = d.o[0], c5 = d.c[last];
  if (c5 === o) return null; // doji : pas de trade
  const long = c5 > o;
  const e = barAtOrAfter(d, 5);
  if (e < 0) return null;
  const s = spreadAt(d.o[e]);
  const fill = long ? d.o[e] + s : d.o[e];
  const stop = long ? lo : hi;
  const R = long ? fill - stop : stop - fill;
  if (!(R > 0) || R < minStopSpreads * s) return null;
  const target = long ? fill + rr * R : fill - rr * R;
  const x = settleFixed(d, e, long, fill, stop, target, s);
  const pnl = long ? x.exit - fill : fill - x.exit;
  return { strategy: 'orb', dir: long ? 'buy' : 'sell', entryTime: d.t[e], exitTime: x.exitTime, fill, stop, target, R, exit: x.exit, reason: x.reason, r: pnl / R, ret: pnl / fill };
}

/** Contrôles de B : barres qui finissent à 10:00, 10:30, ..., 15:30 (k = 29, 59, ..., 359), exécution à la barre suivante. */
export const NOISE_CHECKS = Array.from({ length: 12 }, (_, i) => 29 + 30 * i);

/** B - « noise area ». `days[i]` = séance jouée ; il faut les `lookback` séances précédentes. Retourne la liste des trades du jour. */
export function noiseTrades(days, i, spreadAt, { lookback = 14 } = {}) {
  if (i < lookback) return [];
  const d = days[i];
  const prevClose = days[i - 1].close;
  const upBase = Math.max(d.open, prevClose), dnBase = Math.min(d.open, prevClose);
  // TWAP (remplace le VWAP, pas de volume) : moyenne des prix typiques des barres depuis 9:30, reportée minute par minute
  const twap = new Float64Array(SESSION_MINUTES);
  { let j = 0, sum = 0, n = 0, last = d.open; for (let k = 0; k < SESSION_MINUTES; k++) { while (j < d.k.length && d.k[j] <= k) { sum += (d.h[j] + d.l[j] + d.c[j]) / 3; n++; j++; } if (n) last = sum / n; twap[k] = last; } }
  const trades = [];
  let pos = null;
  for (const k of NOISE_CHECKS) {
    if (k > d.lastK) break;
    let sig = 0;
    for (let b = 1; b <= lookback; b++) { const p = days[i - b]; sig += Math.abs(p.cl[k] / p.open - 1); }
    sig /= lookback;
    const ub = upBase * (1 + sig), lb = dnBase * (1 - sig);
    const px = d.cl[k];
    const e = barAtOrAfter(d, k + 1);
    if (e < 0) break;
    const ob = d.o[e], s = spreadAt(ob);
    if (pos) {
      const out = pos.long ? px < Math.max(ub, twap[k]) : px > Math.min(lb, twap[k]);
      if (out) {
        const exit = pos.long ? ob : ob + s;
        const pnl = pos.long ? exit - pos.fill : pos.fill - exit;
        trades.push({ strategy: 'noise', dir: pos.long ? 'buy' : 'sell', entryTime: pos.time, exitTime: d.t[e], fill: pos.fill, exit, reason: 'stop', ret: pnl / pos.fill });
        pos = null;
      }
    }
    if (!pos) {
      if (px > ub) pos = { long: true, fill: ob + s, time: d.t[e] };
      else if (px < lb) pos = { long: false, fill: ob, time: d.t[e] };
    }
  }
  if (pos) {
    const s = spreadAt(d.close);
    const exit = pos.long ? d.close : d.close + s;
    const pnl = pos.long ? exit - pos.fill : pos.fill - exit;
    trades.push({ strategy: 'noise', dir: pos.long ? 'buy' : 'sell', entryTime: pos.time, exitTime: d.closeTime - MIN, fill: pos.fill, exit, reason: 'close', ret: pnl / pos.fill });
  }
  return trades;
}

/** C - dernière demi-heure dans le sens de la première (nuit comprise). Null si pas de trade (r1 = 0, pas de barre 15:30). */
export function lastHalfHourTrade(d, prevClose, spreadAt) {
  if (d.lastK < 360) return null;
  const r1 = d.cl[29] / prevClose - 1;
  if (!(r1 !== 0) || !Number.isFinite(r1)) return null;
  const e = barAtOrAfter(d, 360);
  if (e < 0 || d.k[e] > 364) return null;
  const ob = d.o[e], s = spreadAt(ob);
  const long = r1 > 0;
  const fill = long ? ob + s : ob;
  const exit = long ? d.close : d.close + s;
  const pnl = long ? exit - fill : fill - exit;
  return { strategy: 'lasthalf', dir: long ? 'buy' : 'sell', entryTime: d.t[e], exitTime: d.closeTime - MIN, fill, exit, reason: 'close', r1, ret: pnl / fill };
}

/** Écart-type des rendements journaliers (clôture à clôture) des `n` séances avant days[i] (null s'il en manque). */
export function dailyVol(days, i, n = 14) {
  if (i < n + 1) return null;
  const r = [];
  for (let j = i - n; j < i; j++) r.push(days[j].close / days[j - 1].close - 1);
  const m = r.reduce((a, x) => a + x, 0) / n;
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
}
