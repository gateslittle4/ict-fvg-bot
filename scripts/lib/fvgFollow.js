// fvgFollow.js - « Suivre le FVG le plus récent » (data/backtest-input/preregistration-fvg-suivi-2026-09-30.md). Fonctions pures, testées dans
// test/fvgFollow.test.js. Vente décrite dans le pré-enregistrement ; l'achat est le miroir exact.
// Aucun regard vers l'avenir : une zone n'est active qu'à la clôture de la bougie qui suit sa dernière bougie (la bougie de confirmation).
import { lower } from './m1Data.js';

export { stats, trainVerdict } from './fvgGauche.js';
const MIN = 60000, M15 = 15 * MIN;
export const ORDER_BARS = 16; // expiration d'un ordre : 4 h
export const STOP_FRAC = 0.1; // stop au-delà du bord lointain : 10 % de la hauteur de la partie non mangée
export const MIN_RISK_SPREADS = 3; // pas d'ordre si le risque est inférieur à 3 x le spread
export const MAX_HOLD_MIN = 480 * 15; // 5 jours

/**
 * Zones actives d'une série M15, triées par activation. FVG bruts (trois bougies contiguës) fusionnés quand ils se suivent dans le même sens ;
 * la bougie k1+1 (contiguë) peut en manger une partie : on garde la partie NON mangée, et pas de zone si tout est mangé.
 * @returns {Array<{ dir, k1, kT, T, remInf, remSup, h, entry, stop }>} dir -1 = vente (FVG baissier), +1 = achat
 */
export function buildZones(bars) {
  const n = bars.length, runs = [];
  let cur = null;
  for (let k = 2; k < n; k++) {
    const a = bars[k - 2], c = bars[k];
    const contigu = c.time - a.time === 2 * M15; // le trou de week-end / jour férié n'est pas un FVG
    const f = !contigu ? null : a.low > c.high ? { dir: -1, sup: a.low, inf: c.high } : a.high < c.low ? { dir: 1, sup: c.low, inf: a.high } : null;
    if (f && cur && cur.dir === f.dir && cur.k1 === k - 1) { cur.k1 = k; cur.inf = Math.min(cur.inf, f.inf); cur.sup = Math.max(cur.sup, f.sup); continue; }
    if (cur) runs.push(cur);
    cur = f ? { dir: f.dir, k0: k, k1: k, inf: f.inf, sup: f.sup } : null;
  }
  if (cur) runs.push(cur);
  const zones = [];
  for (const r of runs) {
    const nb = bars[r.k1 + 1];
    if (!nb || nb.time - bars[r.k1].time !== M15) continue;
    let remInf = r.inf, remSup = r.sup;
    if (r.dir < 0) { if (!(nb.high < r.sup)) continue; remInf = Math.max(r.inf, nb.high); }
    else { if (!(nb.low > r.inf)) continue; remSup = Math.min(r.sup, nb.low); }
    const h = remSup - remInf;
    if (!(h > 0)) continue;
    const entry = r.dir < 0 ? remInf : remSup;
    const stop = r.dir < 0 ? remSup + STOP_FRAC * h : remInf - STOP_FRAC * h;
    zones.push({ dir: r.dir, k1: r.k1, kT: r.k1 + 1, T: nb.time + M15, remInf, remSup, h, entry, stop });
  }
  return zones;
}

/**
 * Ordre limite posé à z.T sur une série M1 en BID : rempli quand le bid (vente) / l'ask (achat) atteint l'entrée ; annulé sans trade si la
 * minute s'ouvre déjà au-delà du stop, ou à `cancelAt` (nouvelle zone active, ou expiration).
 * @returns {{ missed: string } | { i: number, fill: number, fillTime: number }}
 */
export function simulateFollowOrder(S, z, cancelAt, { spread }) {
  const buy = z.dir > 0;
  const end = lower(S.t, S.n, Math.min(cancelAt, z.T + ORDER_BARS * M15));
  for (let i = lower(S.t, S.n, z.T); i < end; i++) {
    if (buy ? S.o[i] <= z.stop : S.o[i] + spread >= z.stop) return { missed: 'stop_franchi' };
    if (buy ? S.l[i] + spread <= z.entry : S.h[i] >= z.entry) {
      const fill = buy ? Math.min(z.entry, S.o[i] + spread) : Math.max(z.entry, S.o[i]);
      return { i, fill, fillTime: S.t[i] };
    }
  }
  return { missed: 'non_rempli' };
}

/**
 * Position ouverte à la minute i au prix fill : stop d'abord (un trou sort à l'ouverture), retournement (sortie au marché à l'ouverture de la
 * première minute >= flipT), sortie au marché après 5 jours. R = résultat net / risque réel.
 */
export function manageFollow(S, { buy, i, fill, stop, flipT, spread, swap = () => 0 }) {
  const until = S.t[i] + MAX_HOLD_MIN * MIN;
  let j = i, exit = null, reason = 'duree';
  for (; j < S.n && S.t[j] < until; j++) {
    if (flipT != null && j > i && S.t[j] >= flipT) { exit = buy ? S.o[j] : S.o[j] + spread; reason = 'retournement'; break; }
    const stopHit = buy ? S.l[j] <= stop : S.h[j] + spread >= stop;
    if (stopHit) { exit = j > i ? (buy ? Math.min(S.o[j], stop) : Math.max(S.o[j] + spread, stop)) : stop; reason = 'stop'; break; }
  }
  if (exit === null) { j = Math.min(j, S.n) - 1; exit = buy ? S.c[j] : S.c[j] + spread; }
  const risk = Math.abs(fill - stop);
  const pnl = (buy ? exit - fill : fill - exit) + swap(buy ? 'bullish' : 'bearish', S.t[i], S.t[j], fill);
  return { r: pnl / risk, fillTime: S.t[i], exitTime: S.t[j], reason, risk };
}

/** Étude d'une paire : un seul trade à la fois, zones prises à leur activation T dans [from, to). */
export function runSymbolFollow(S, bars, { from, to, spreadAt, swapFor }) {
  const zones = buildZones(bars);
  const trades = [];
  const counters = { zones: 0, risque_petit: 0, ordres: 0, remplis: 0, non_rempli: 0, stop_franchi: 0 };
  let flatFrom = -Infinity;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.T < from) continue;
    if (z.T >= to) break;
    if (z.T < flatFrom) continue; // une position est ouverte : cette zone est ignorée
    counters.zones++;
    const spread = spreadAt(z.entry);
    if (Math.abs(z.entry - z.stop) < MIN_RISK_SPREADS * spread) { counters.risque_petit++; continue; }
    counters.ordres++;
    const nextT = i + 1 < zones.length ? zones[i + 1].T : Infinity; // la zone suivante remplace cet ordre
    const sim = simulateFollowOrder(S, z, nextT, { spread });
    if (sim.missed) { counters[sim.missed]++; continue; }
    counters.remplis++;
    let j = i + 1;
    while (j < zones.length && !(zones[j].dir !== z.dir && zones[j].T > sim.fillTime)) j++;
    const pos = manageFollow(S, { buy: z.dir > 0, i: sim.i, fill: sim.fill, stop: z.stop, flipT: j < zones.length ? zones[j].T : null, spread, swap: swapFor });
    flatFrom = pos.exitTime;
    trades.push({ time: pos.fillTime, dir: z.dir, r: pos.r, reason: pos.reason, hold: pos.exitTime - pos.fillTime });
  }
  return { trades, counters };
}
