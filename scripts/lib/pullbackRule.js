// pullbackRule.js - règle de data/backtest-input/preregistration-esdras-pullback-2026-09-26.md (repli dans la tendance, le matin), pure
// et testée (test/pullbackRule.test.js). Série M1 { t, o, h, l, c, n } en BID, TEMPS MOTEUR (UTC - 5 h fixe, comme loadM1).
import { toRealNyHourMinute } from '../../src/backtest/nySession.js';

const MIN = 60000, H = 3600000, DAY = 86400000;
export const RULE = Object.freeze({ fromMin: 3 * 60, lastMin: 10 * 60 + 45, lookLong: 4 * H, lookShort: H, rangeCut: 0.75, atrBars: 14, rr: 3, maxHold: 4 * H, maxPerDay: 3 });

/** Heure de New York réelle d'un temps moteur : { minute du jour, clé de journée de trading 18 h -> 18 h }. */
export function nyClock(t) {
  const { hour, minute } = toRealNyHourMinute(t);
  const local = t + (hour !== new Date(t).getUTCHours() ? H : 0); // heure d'été : New York = temps moteur + 1 h
  return { min: hour * 60 + minute, dayKey: Math.floor((local + 6 * H) / DAY) };
}

const lastAtOrBefore = (S, x) => { let a = 0, b = S.n; while (a < b) { const m = (a + b) >> 1; if (S.t[m] <= x) a = m + 1; else b = m; } return a - 1; };

/**
 * Tous les trades de la règle sur une série.
 * @param {(price:number) => number} spreadAt
 * @returns {Array<{ entryTime, exitTime, dir, fill, exit, atr, r, reason }>}
 */
export function pullbackTrades(S, spreadAt, rule = RULE) {
  const R = { ...RULE, ...rule };
  const trades = [];
  // bougies H1 (temps moteur aligné sur les heures pleines, comme New York) pour l'ATR
  const h1 = []; // { end, h, l, c }
  let curH = null, dayKey = null, dayHi = -Infinity, dayLo = Infinity, perDay = 0, busyUntil = -Infinity;
  for (let i = 0; i < S.n; i++) {
    const t = S.t[i];
    const hk = Math.floor(t / H) * H;
    if (!curH || curH.start !== hk) { if (curH) h1.push(curH); curH = { start: hk, end: hk + H, h: S.h[i], l: S.l[i], c: S.c[i] }; }
    else { if (S.h[i] > curH.h) curH.h = S.h[i]; if (S.l[i] < curH.l) curH.l = S.l[i]; curH.c = S.c[i]; }
    const clk = nyClock(t);
    if (clk.dayKey !== dayKey) { dayKey = clk.dayKey; dayHi = -Infinity; dayLo = Infinity; perDay = 0; }
    if (S.h[i] > dayHi) dayHi = S.h[i];
    if (S.l[i] < dayLo) dayLo = S.l[i];
    // clôture d'une bougie M15 : la minute suivante commence un nouveau quart d'heure (ou il n'y en a pas)
    const tau = t + MIN;
    if (tau % (15 * MIN) !== 0) continue;
    const tc = nyClock(tau);
    if (tc.min < R.fromMin || tc.min > R.lastMin || tau < busyUntil || perDay >= R.maxPerDay) continue;
    if (i + 1 >= S.n || S.t[i + 1] - tau > 5 * MIN) continue; // pas de cotation juste après : marché fermé
    const c = S.c[i];
    const j4 = lastAtOrBefore(S, tau - R.lookLong - MIN), j1 = lastAtOrBefore(S, tau - R.lookShort - MIN);
    if (j4 < 0 || j1 < 0) continue;
    const up4 = c > S.c[j4], dn4 = c < S.c[j4], dn1 = c < S.c[j1], up1 = c > S.c[j1];
    const pos = dayHi > dayLo ? (c - dayLo) / (dayHi - dayLo) : 0.5;
    let dir = 0;
    if (up4 && dn1 && pos <= R.rangeCut) dir = 1;
    else if (dn4 && up1 && pos >= 1 - R.rangeCut) dir = -1;
    if (!dir) continue;
    const done = h1.filter((b) => b.end <= tau).slice(-(R.atrBars + 1));
    if (done.length < R.atrBars + 1) continue;
    let tr = 0; for (let k = 1; k < done.length; k++) tr += Math.max(done[k].h - done[k].l, Math.abs(done[k].h - done[k - 1].c), Math.abs(done[k].l - done[k - 1].c));
    const atr = tr / R.atrBars;
    if (!(atr > 0)) continue;
    // exécution minute par minute depuis la minute i + 1
    const e = i + 1, s = spreadAt(S.o[e]);
    const fill = dir > 0 ? S.o[e] + s : S.o[e];
    const stop = fill - dir * atr, target = fill + dir * R.rr * atr, until = S.t[e] + R.maxHold;
    let k = e, exit = null, reason = 'time';
    for (; k < S.n; k++) {
      if (S.t[k] >= until) { exit = dir > 0 ? S.o[k] : S.o[k] + s; break; }
      const stopHit = dir > 0 ? S.l[k] <= stop : S.h[k] + s >= stop;
      if (stopHit) { exit = k > e ? (dir > 0 ? Math.min(S.o[k], stop) : Math.max(S.o[k] + s, stop)) : stop; reason = 'stop'; break; }
      if (k > e && (dir > 0 ? S.h[k] >= target : S.l[k] + s <= target)) { exit = target; reason = 'target'; break; }
    }
    if (exit === null) { k = S.n - 1; exit = dir > 0 ? S.c[k] : S.c[k] + s; }
    trades.push({ entryTime: S.t[e], exitTime: S.t[k], dir, fill, exit, atr, r: (dir * (exit - fill)) / atr, reason });
    perDay++;
    busyUntil = S.t[k] + MIN;
  }
  return trades;
}
