// nightLab.js - outils de la recherche de nuit (data/backtest-input/preregistration-nuit-2026-09-26.md), purs et testés
// (test/nightLab.test.js). Séries M1 { t, o, h, l, c, n } en BID, TEMPS MOTEUR (UTC - 5 h fixe, comme loadM1). Un achat entre à l'ask
// (bid + spread) et sort au bid ; une vente entre au bid et sort à l'ask.
//
// Découpage des années : l'exploration ne voit que 2011-2018 (les données sont coupées au 1er janvier 2019 AVANT tout calcul) ; la
// validation (2019-2022) et le final (2023-2024 + 2026, 2025 à part) ne se chargent qu'avec NIGHT_PHASE=validation / final.
import { toRealNyHourMinute } from '../../src/backtest/nySession.js';
import { eng, loadM1, lower, refPrice, swapPerUnit } from './m1Data.js';
import { DEFAULT_SPREADS } from '../../src/backtest/transactionCosts.js';

export const MIN = 60000, HOUR = 3600000, DAY = 86400000, M15 = 15 * MIN;

export const PHASES = Object.freeze({
  explore: { load: 'hist', from: eng(2010, 10, 1), to: eng(2019), count: [[eng(2011), eng(2019)]], halves: [[eng(2011), eng(2015)], [eng(2015), eng(2019)]] },
  validation: { load: 'hist', from: eng(2018), to: eng(2023), count: [[eng(2019), eng(2023)]], halves: [[eng(2019), eng(2021)], [eng(2021), eng(2023)]] },
  final: { load: 'broker', from: eng(2022), to: Infinity, count: [[eng(2023), eng(2025)], [eng(2026), Infinity]], halves: [[eng(2023), eng(2025)], [eng(2026), Infinity]], descriptive: [[eng(2025), eng(2026)]] },
});

/** Refuse de charger une période cachée sans la déclarer (NIGHT_PHASE=validation|final). */
export function assertPhaseAllowed(phase, env = process.env) {
  if (!PHASES[phase]) throw new Error(`phase inconnue : ${phase}`);
  if (phase !== 'explore' && env.NIGHT_PHASE !== phase) throw new Error(`période cachée : ${phase} exige NIGHT_PHASE=${phase} (lecture unique, règles figées et commitées avant)`);
}

/** Coupe une série à [from, to). */
export function sliceSeries(S, from, to) {
  const i = lower(S.t, S.n, from), j = to === Infinity ? S.n : lower(S.t, S.n, to);
  const sub = (a) => a.subarray(i, j);
  return { t: sub(S.t), o: sub(S.o), h: sub(S.h), l: sub(S.l), c: sub(S.c), n: j - i };
}

/** Série M1 d'une phase, déjà coupée (l'exploration ne contient physiquement rien après le 31/12/2018). */
export function loadPhase(sym, phase, env = process.env) {
  assertPhaseAllowed(phase, env);
  const P = PHASES[phase];
  return sliceSeries(loadM1(P.load, sym), P.from, P.to);
}

/** Un trade compte-t-il dans la phase (et dans quel bloc) ? */
export const inBlocks = (t, blocks) => blocks.some(([a, b]) => t >= a && t < b);

/** Spread en prix au niveau de prix donné (convention du projet : spread d'aujourd'hui en % du prix). */
export const spreadAt = (sym, price, mult = 1) => mult * (DEFAULT_SPREADS[sym] ?? 0) * (price / refPrice(sym));

/** Swap en prix par unité pour une position (convention du projet : points d'aujourd'hui en % du prix). */
export const swapCost = (sym) => (dir, from, to, fill) => swapPerUnit(sym, dir > 0 ? 'bullish' : 'bearish', from, to) * (fill / refPrice(sym));

// ---------- Heure de New York ----------
const dstShift = (t) => { const { hour } = toRealNyHourMinute(t); return hour !== new Date(t).getUTCHours() ? HOUR : 0; };
/** Heure locale de New York « naïve » (ms) : temps moteur + 1 h en heure d'été. */
export const nyLocal = (t) => t + dstShift(t);
/** Minute du jour à New York (0-1439). */
export const nyMin = (t) => { const x = nyLocal(t); return Math.floor((((x % DAY) + DAY) % DAY) / MIN); };
/** Journée de trading 18 h NY -> 18 h NY. */
export const dayKey = (t) => Math.floor((nyLocal(t) + 6 * HOUR) / DAY);
/** Jour de la semaine de la journée de trading (1 = lundi … 5 = vendredi). */
export const dayOfWeek = (t) => new Date((dayKey(t)) * DAY).getUTCDay();

// ---------- Bougies ----------
/**
 * Regroupe les minutes consécutives de même clé. Chaque bougie : { key, t (première minute), i0, i1, o, h, l, c }.
 * keyOf(t) : M15 = floor(t / 15 min) ; H1 = floor(t / 1 h) ; H4 = h4Key ; jour = dayKey.
 */
export function makeBars(S, keyOf) {
  const out = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const k = keyOf(S.t[i]);
    if (!cur || cur.key !== k) { if (cur) out.push(cur); cur = { key: k, t: S.t[i], i0: i, i1: i, o: S.o[i], h: S.h[i], l: S.l[i], c: S.c[i] }; }
    else { if (S.h[i] > cur.h) cur.h = S.h[i]; if (S.l[i] < cur.l) cur.l = S.l[i]; cur.c = S.c[i]; cur.i1 = i; }
  }
  if (cur) out.push(cur);
  return out;
}
export const m15Key = (t) => Math.floor(t / M15);
export const h1Key = (t) => Math.floor(t / HOUR);
/** H4 alignées sur 17 h / 21 h / 1 h / 5 h / 9 h / 13 h New York (comme un courtier en UTC+3). */
export const h4Key = (t) => Math.floor((nyLocal(t) + 7 * HOUR) / (4 * HOUR));

/** ATR simple (moyenne des vrais écarts des n dernières bougies, bougie j comprise) ; null tant qu'il manque de l'historique. */
export function atrSeries(bars, n = 14) {
  const out = new Array(bars.length).fill(null);
  let s = 0; const tr = new Array(bars.length).fill(0);
  for (let j = 1; j < bars.length; j++) {
    const b = bars[j], p = bars[j - 1].c;
    tr[j] = Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p));
    s += tr[j]; if (j > n) s -= tr[j - n];
    if (j >= n) out[j] = s / n;
  }
  return out;
}

/** Index de la dernière bougie TERMINÉE avant la minute i (bougie dont la dernière minute est < i), -1 sinon. */
export function lastDoneBar(bars, i) {
  let lo = 0, hi = bars.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].i1 < i) lo = m + 1; else hi = m; }
  return lo - 1;
}

// ---------- Exécution ----------
/**
 * Un trade simulé minute par minute.
 * spec : { dir: +1|-1, i: minute où l'ordre devient actif, entry: { type: 'market' } | { type: 'limit', price } | { type: 'stop', price },
 *   expiry: temps après lequel un ordre non rempli est annulé (défaut : pas d'expiration pour 'market'), stop: prix,
 *   target: prix | null, rr: objectif en multiple du risque réel (remplace target), exitAt: sortie forcée au marché (temps),
 *   spread: prix, swap: (dir, from, to, fill) => prix par unité, cancelIfTarget: annuler une limite si l'objectif est touché avant }.
 * Stop d'abord dans une même minute (y compris la minute de l'entrée) ; objectif à partir de la minute qui suit l'entrée ; un trou à
 * travers le stop sort à l'ouverture. Une exécution déjà au-delà du stop = pas de trade ('stop-crossed').
 * @returns {{ entryTime, fill, exitTime, exit, reason, risk, r, mfe, mae } | { missed: string }}
 */
export function simulate(S, spec) {
  const { dir, entry = { type: 'market' }, spread = 0, swap = () => 0 } = spec;
  const buy = dir > 0;
  let i = spec.i, fill = null;
  if (i >= S.n) return { missed: 'no-data' };
  if (entry.type === 'market') fill = buy ? S.o[i] + spread : S.o[i];
  else {
    const until = spec.expiry ?? Infinity;
    for (; i < S.n && S.t[i] < until; i++) {
      if (entry.type === 'limit') {
        if (buy ? S.l[i] + spread <= entry.price : S.h[i] >= entry.price) { fill = buy ? Math.min(entry.price, S.o[i] + spread) : Math.max(entry.price, S.o[i]); break; }
      } else if (buy ? S.h[i] + spread >= entry.price : S.l[i] <= entry.price) { fill = buy ? Math.max(entry.price, S.o[i] + spread) : Math.min(entry.price, S.o[i]); break; }
      if (spec.cancelIfTarget && spec.target != null && (buy ? S.h[i] >= spec.target : S.l[i] + spread <= spec.target)) return { missed: 'target-first' };
    }
    if (fill === null) return { missed: 'expired' };
  }
  const stop = spec.stop;
  if (buy ? fill <= stop : fill >= stop) return { missed: 'stop-crossed' };
  const risk = Math.abs(fill - stop);
  const target = spec.rr != null ? fill + dir * spec.rr * risk : spec.target ?? null;
  const exitAt = spec.exitAt ?? Infinity;
  let j = i, exit = null, reason = 'time', best = 0, worst = 0;
  for (; j < S.n; j++) {
    if (j > i && S.t[j] >= exitAt) { exit = buy ? S.o[j] : S.o[j] + spread; break; }
    const lowBid = S.l[j], highAsk = S.h[j] + spread;
    if (buy ? lowBid <= stop : highAsk >= stop) { exit = j > i ? (buy ? Math.min(S.o[j], stop) : Math.max(S.o[j] + spread, stop)) : stop; reason = 'stop'; break; }
    if (j > i && target != null && (buy ? S.h[j] >= target : S.l[j] + spread <= target)) { exit = target; reason = 'target'; break; }
    best = Math.max(best, buy ? S.h[j] - fill : fill - (S.l[j] + spread));
    worst = Math.min(worst, buy ? S.l[j] - fill : fill - highAsk);
  }
  if (exit === null) { j = S.n - 1; exit = buy ? S.c[j] : S.c[j] + spread; reason = 'end'; }
  const pnl = (buy ? exit - fill : fill - exit) + swap(dir, S.t[i], S.t[j], fill);
  return { entryTime: S.t[i], fill, exitTime: S.t[j], exit, reason, risk, r: pnl / risk, mfe: best / risk, mae: worst / risk };
}

// ---------- Statistiques ----------
export function stats(list, key = 'r') {
  const n = list.length;
  let s = 0; for (const x of list) s += x[key];
  const m = n ? s / n : 0;
  let v = 0, gp = 0, gl = 0, eq = 0, peak = 0, dd = 0;
  for (const x of list) { const r = x[key]; v += (r - m) ** 2; if (r > 0) gp += r; else gl -= r; eq += r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  const sd = n > 1 ? Math.sqrt(v / (n - 1)) : 0;
  return { n, sum: s, mean: m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? list.filter((x) => x[key] > 0).length / n : 0, pf: gl ? gp / gl : gp ? Infinity : 0, maxDD: dd };
}
export const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);

/** Verdict d'exploration du pré-enregistrement : >= 60 trades, R moyen > 0, t >= 2, deux moitiés positives. */
export function exploreVerdict(trades, halves = PHASES.explore.halves, key = 'r', timeKey = 'entryTime') {
  const all = stats(trades, key);
  const hs = halves.map(([a, b]) => stats(trades.filter((x) => x[timeKey] >= a && x[timeKey] < b), key));
  return { all, halves: hs, retained: all.n >= 60 && all.mean > 0 && all.t >= 2 && hs.every((h) => h.sum > 0) };
}
