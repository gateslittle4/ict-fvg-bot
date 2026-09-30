// fvgGauche.js - FVG « 15 min » vers FVG « à gauche » (data/backtest-input/preregistration-fvg-a-gauche-2026-09-29.md).
// Fonctions pures, testées dans test/fvgGauche.test.js. Vente décrite dans le pré-enregistrement ; l'achat est le miroir exact.
// Aucun regard vers l'avenir : la cible n'est choisie qu'avec des bougies clôturées jusqu'à l'instant de pose de l'ordre.
import { toRealNyHourMinute } from '../../src/backtest/nySession.js';
import { manage } from './stopOrderEntry.js';
import { lower } from './m1Data.js';

const MIN = 60000, M15 = 15 * MIN;
export const LOOKBACK = 480; // bougies M15 : durée maximale du projet (5 jours)
export const ORDER_BARS = 16; // durée de l'ordre : 4 h
export const WINDOW_MIN = [8 * 60 + 30, 11 * 60 + 30]; // pose de l'ordre : 08:30 <= heure de New York < 11:30
export const MIN_RR = 2;
export const STOP_FRAC = 0.1; // stop au-delà de la zone : 10 % de sa hauteur (convention fvg-edge du bot)
export const CONTROL_RR = 3;

/**
 * FVG de chaque bougie k (formé à sa clôture) : baissier Low[k-2] > High[k] (dir -1), haussier High[k-2] < Low[k] (dir +1).
 * `touch` = première bougie j > k qui touche la zone (baissier : High >= inf ; haussier : Low <= sup), cherchée sur LOOKBACK + 1
 * bougies seulement (une zone n'est utile comme cible que pendant LOOKBACK bougies), Infinity sinon.
 */
export function detectFvgs(bars) {
  const n = bars.length, out = new Array(n).fill(null);
  for (let k = 2; k < n; k++) {
    const a = bars[k - 2], c = bars[k];
    let f = null;
    if (a.low > c.high) f = { k, dir: -1, sup: a.low, inf: c.high };
    else if (a.high < c.low) f = { k, dir: 1, sup: c.low, inf: a.high };
    if (!f) continue;
    f.h = f.sup - f.inf;
    f.touch = Infinity;
    const last = Math.min(n - 1, k + LOOKBACK + 1);
    for (let j = k + 1; j <= last; j++) {
      if (f.dir < 0 ? bars[j].high >= f.inf : bars[j].low <= f.sup) { f.touch = j; break; }
    }
    out[k] = f;
  }
  return out;
}

/** Déclencheur de la bougie k ; `dir` -1 = vente (le FVG déclencheur est baissier). */
export function entryOf(Z) { return Z.dir < 0 ? Z.inf : Z.sup; }

/**
 * FVG « à gauche » : de sens OPPOSÉ, formé en kp entre k-LOOKBACK et k-3, jamais touché à la clôture de k (touch > k), et situé
 * DEVANT l'entrée dans le sens du trade (vente : son bord haut sous l'entrée ; achat : son bord bas au-dessus). Le plus proche de
 * l'entrée ; à égalité, la plus grande hauteur. Cible = son bord proche.
 */
export function pickTarget(fvgAt, k, dir, entry) {
  let best = null;
  for (let kp = k - 3; kp >= Math.max(0, k - LOOKBACK); kp--) {
    const f = fvgAt[kp];
    if (!f || f.dir === dir || f.touch <= k) continue;
    const edge = dir < 0 ? f.sup : f.inf;
    if (dir < 0 ? !(edge < entry) : !(edge > entry)) continue;
    const better = !best || (dir < 0 ? edge > best.target : edge < best.target) || (edge === best.target && f.h > best.f.h);
    if (better) best = { f, target: edge };
  }
  return best;
}

/** Ordre limite : entrée au bord proche de Z, stop au-delà de son bord lointain (+10 % de sa hauteur), cible donnée. */
export function buildOrder(Z, target) {
  const sell = Z.dir < 0;
  const entry = entryOf(Z);
  const stop = sell ? Z.sup + STOP_FRAC * Z.h : Z.inf - STOP_FRAC * Z.h;
  const risk = Math.abs(stop - entry);
  const distance = sell ? entry - target : target - entry;
  return { side: sell ? 'sell' : 'buy', entry, stop, target, risk, rrOk: distance >= MIN_RR * risk, targetR: distance / risk };
}

/** Pose autorisée si l'instant T (temps moteur) est entre 08:30 et 11:30 heure de New York réelle (heure d'été comprise). */
export function inWindow(T) {
  const { hour, minute } = toRealNyHourMinute(T);
  const m = hour * 60 + minute;
  return m >= WINDOW_MIN[0] && m < WINDOW_MIN[1];
}

/**
 * Ordre limite posé à T sur une série M1 en BID : rempli quand le bid (vente) / l'ask (achat) atteint l'entrée ; annulé sans trade si
 * la cible est atteinte avant le remplissage, si la minute s'ouvre déjà au-delà du stop, ou après ORDER_BARS bougies. Une fois rempli :
 * `manage` (stop d'abord, trou à l'ouverture, sortie au marché après 5 jours). Renvoie aussi le contrôle « cible fixe 3 R ».
 * @returns {{ missed: string, endTime: number } | { r, fillTime, exitTime, reason, risk, endTime, control }}
 */
export function simulateOrder(S, o, T, { spread, swap }) {
  const buy = o.side === 'buy';
  const expiry = T + ORDER_BARS * M15;
  const end = lower(S.t, S.n, expiry);
  for (let i = lower(S.t, S.n, T); i < end; i++) {
    if (buy ? S.o[i] <= o.stop : S.o[i] + spread >= o.stop) return { missed: 'stop-crossed', endTime: S.t[i] };
    if (buy ? S.l[i] + spread <= o.entry : S.h[i] >= o.entry) {
      const fill = buy ? Math.min(o.entry, S.o[i] + spread) : Math.max(o.entry, S.o[i]);
      const risk = Math.abs(fill - o.stop);
      const res = manage(S, { buy, i, fill, stop: o.stop, target: o.target, spread, swap });
      const controlTarget = buy ? fill + CONTROL_RR * risk : fill - CONTROL_RR * risk;
      const control = manage(S, { buy, i, fill, stop: o.stop, target: controlTarget, spread, swap });
      return { ...res, endTime: res.exitTime, control };
    }
    if (buy ? S.h[i] >= o.target : S.l[i] + spread <= o.target) return { missed: 'target-first', endTime: S.t[i] };
  }
  return { missed: 'expired', endTime: expiry };
}

/**
 * Étude d'une paire : un seul trade à la fois (netting), déclencheurs pris à l'instant T (fin de la bougie k) dans [from, to).
 * @param {object} opts { from, to, spreadAt(price), swapFor(direction, from, to, fill) }
 */
export function runSymbol(S, bars, { from, to, spreadAt, swapFor }) {
  const fvgAt = detectFvgs(bars);
  const trades = [];
  const counters = { triggers: 0, hors_fenetre: 0, occupe: 0, sans_cible: 0, rr_trop_petit: 0, ordres: 0, remplis: 0 };
  let busyUntil = -Infinity;
  for (let k = 2; k < bars.length; k++) {
    const Z = fvgAt[k];
    if (!Z) continue;
    const T = bars[k].time + M15;
    if (T < from || T >= to) continue;
    counters.triggers++;
    if (!inWindow(T)) { counters.hors_fenetre++; continue; }
    if (T < busyUntil) { counters.occupe++; continue; }
    const pick = pickTarget(fvgAt, k, Z.dir, entryOf(Z));
    if (!pick) { counters.sans_cible++; continue; }
    const o = buildOrder(Z, pick.target);
    if (!o.rrOk) { counters.rr_trop_petit++; continue; }
    counters.ordres++;
    const res = simulateOrder(S, o, T, { spread: spreadAt(o.entry), swap: swapFor });
    busyUntil = res.endTime;
    if (res.missed) { counters[res.missed] = (counters[res.missed] || 0) + 1; continue; }
    counters.remplis++;
    trades.push({ time: res.fillTime, dir: Z.dir, r: res.r, rControl: res.control.r, targetR: o.targetR, reason: res.reason });
  }
  return { trades, counters };
}

/** Statistiques d'une liste de R. */
export function stats(rs) {
  const n = rs.length, sum = rs.reduce((a, x) => a + x, 0), mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, sum, mean, t: sd ? mean / (sd / Math.sqrt(n)) : 0, win: n ? rs.filter((x) => x > 0).length / n : 0 };
}

export const MIN_TRADES = 60, MIN_T = 2.6;
/** Verdict du temps 1 (pré-enregistrement) : pooled = US100 + US500 sur 2010-2022 ; h1 = 2010-2016, h2 = 2017-2022. */
export function trainVerdict({ pooled, h1, h2 }) {
  if (pooled.n < MIN_TRADES) return { status: 'NON CONCLUANT', text: `${pooled.n} trades à l'entraînement, il en faut ${MIN_TRADES}` };
  const ok = pooled.mean > 0 && pooled.t >= MIN_T && h1.sum > 0 && h2.sum > 0;
  const detail = `R moyen ${pooled.mean.toFixed(3)}, t ${pooled.t.toFixed(2)} (${MIN_T} exigé) ; 2010-2016 ${h1.sum.toFixed(1)} R, 2017-2022 ${h2.sum.toFixed(1)} R`;
  return ok ? { status: 'VALIDÉ', text: detail } : { status: 'ÉCHEC', text: detail };
}
