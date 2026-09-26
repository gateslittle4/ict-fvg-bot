// stopOrderEntry.js - les trois exécutions d'un signal FVG comparées par docs/PREREG_STOP_ORDER.md (fonctions pures, testées dans
// test/stopOrderEntry.test.js). Série M1 { t, o, h, l, c, n } en BID, temps moteur ; `spread` en prix ; un achat entre à l'ask
// (bid + spread) et sort au bid, une vente entre au bid et sort à l'ask. R = résultat net / risque réel |exécution - stop|.
import { orderProtection, stopEntryOrder, targetFromFill } from '../../src/execution/entryPolicy.js';

const MIN = 60000, M15 = 15 * MIN;
export const MAX_HOLD_MIN = 480 * 15; // 480 bougies M15, comme la durée max du FVG
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };

/**
 * Position ouverte à la minute `i` au prix `fill` : stop d'abord (y compris dans la minute d'entrée), objectif à partir de la minute
 * suivante, sortie au marché après MAX_HOLD_MIN. Un trou à travers le stop sort à l'ouverture de la minute.
 */
export function manage(S, { buy, i, fill, stop, target, spread, swap = () => 0 }) {
  const until = S.t[i] + MAX_HOLD_MIN * MIN;
  let j = i, exit = null, reason = 'time';
  for (; j < S.n && S.t[j] < until; j++) {
    const stopHit = buy ? S.l[j] <= stop : S.h[j] + spread >= stop;
    if (stopHit) { exit = j > i ? (buy ? Math.min(S.o[j], stop) : Math.max(S.o[j] + spread, stop)) : stop; reason = 'stop'; break; }
    if (j > i && target != null && (buy ? S.h[j] >= target : S.l[j] + spread <= target)) { exit = target; reason = 'target'; break; }
  }
  if (exit === null) { j = Math.min(j, S.n) - 1; exit = buy ? S.c[j] : S.c[j] + spread; }
  const risk = Math.abs(fill - stop);
  const pnl = (buy ? exit - fill : fill - exit) + swap(buy ? 'bullish' : 'bearish', S.t[i], S.t[j], fill);
  return { fillTime: S.t[i], fill, exitTime: S.t[j], exit, reason, risk, r: pnl / risk };
}

/**
 * 1) Premier contact (référence des anciennes études, non exécutable) : entrée au bord de la zone à la première minute de la bougie de
 * signal où le bid le touche ; un achat paie l'ask.
 * @param sig { direction, entryPrice, stopPrice, targetPrice, time (début de la bougie de signal) }
 */
export function firstContact(S, sig, { spread, swap }) {
  const buy = sig.direction === 'bullish';
  const end = lower(S.t, S.n, sig.time + M15);
  for (let i = lower(S.t, S.n, sig.time); i < end; i++) {
    if (buy ? S.l[i] <= sig.entryPrice : S.h[i] >= sig.entryPrice) {
      const fill = buy ? sig.entryPrice + spread : sig.entryPrice;
      return manage(S, { buy, i, fill, stop: sig.stopPrice, target: sig.targetPrice, spread, swap });
    }
  }
  return { missed: 'no-contact' };
}

/**
 * 2) Limite (le bot jusqu'au 23/09) : posée à la clôture de la bougie de signal au bord de la zone, valable maxAgeCandles bougies depuis
 * le signal, remplie quand l'ask (achat) / le bid (vente) touche le niveau (au niveau, ou mieux si la minute s'ouvre au-delà), perdue si
 * l'objectif est atteint avant. Stop et objectif du signal (orderProtection d'un ordre LIMIT : inchangés).
 */
export function limitEntry(S, sig, { spread, swap, maxAgeCandles }) {
  const buy = sig.direction === 'bullish';
  const { protection } = orderProtection({ suggestedSide: buy ? 'buy' : 'sell', entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice }, { spread, isLimit: true });
  const end = lower(S.t, S.n, sig.time + maxAgeCandles * M15);
  for (let i = lower(S.t, S.n, sig.time + M15); i < end; i++) {
    if (buy ? S.l[i] + spread <= sig.entryPrice : S.h[i] >= sig.entryPrice) {
      const fill = buy ? Math.min(sig.entryPrice, S.o[i] + spread) : Math.max(sig.entryPrice, S.o[i]);
      return manage(S, { buy, i, fill, stop: protection.stopPrice, target: protection.targetPrice, spread, swap });
    }
    if (buy ? S.h[i] >= sig.targetPrice : S.l[i] + spread <= sig.targetPrice) return { missed: 'target-first' };
  }
  return { missed: 'expired' };
}

/**
 * 3) Stop (docs/PREREG_STOP_ORDER.md) : posé à la clôture de la bougie de signal à l'extrême de la zone ± 1 tick (stopEntryOrder), actif
 * dès l'ouverture de la bougie suivante (déjà au-delà : exécuté à cette ouverture ; sinon au niveau quand l'ask / le bid le franchit),
 * annulé à `sessionEnd` s'il n'est pas déclenché. Stop de protection au niveau du signal, objectif = rr x risque réel.
 * @param sig { direction, zone, stopPrice, rrMultiple, time }
 */
export function stopEntry(S, sig, { spread, swap, tick = 0.01, sessionEnd }) {
  const order = stopEntryOrder(sig, { tick });
  const buy = order.side === 'buy';
  const end = lower(S.t, S.n, sessionEnd);
  for (let i = lower(S.t, S.n, sig.time + M15); i < end; i++) {
    const ask = (x) => x + spread;
    let fill = null;
    if (buy ? ask(S.o[i]) >= order.triggerPrice : S.o[i] <= order.triggerPrice) fill = buy ? ask(S.o[i]) : S.o[i];
    else if (buy ? ask(S.h[i]) >= order.triggerPrice : S.l[i] <= order.triggerPrice) fill = order.triggerPrice;
    if (fill === null) continue;
    const target = targetFromFill({ side: order.side, fill, stopPrice: order.stopPrice, rrMultiple: order.rrMultiple });
    if (target === null) return { missed: 'stop-crossed' }; // exécuté au-delà du stop de protection : pas de risque positif
    return { ...manage(S, { buy, i, fill, stop: order.stopPrice, target, spread, swap }), triggerPrice: order.triggerPrice };
  }
  return { missed: 'session-end' };
}
