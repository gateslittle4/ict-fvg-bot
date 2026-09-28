// dipRule.js - piste D de la recherche de nuit (amendement 1 de data/backtest-input/preregistration-nuit-2026-09-26.md) : retour à la
// moyenne intrajournalier par ordre limite, et deux pistes simples de la séance de New York (écart d'ouverture, jour de la semaine).
// Pur et testé (test/dipRule.test.js). Série M1 en BID, temps moteur ; contexte X de fvgContext.buildContext.
import { atrH1At } from './fvgContext.js';
import { simulate, nyMin, dayKey, dayOfWeek, MIN } from './nightLab.js';
import { nextNyTime } from './eyeRule.js';

const inWindow = (nm, from, to) => (from < to ? nm >= from && nm < to : nm >= from || nm < to);

/**
 * « Limite au creux » : à chaque clôture M15 de la fenêtre [fromMin, toMin) NY, à plat, un ordre limite à d × ATR H1 du prix de clôture
 * (achat en dessous, vente au-dessus, ou les deux), valable 15 minutes puis remplacé à la clôture suivante. Touché : exec 'limit' =
 * rempli au niveau ; exec 'market' = entrée au marché à l'ouverture de la minute suivante. Stop à stopK × ATR au-delà de l'entrée
 * prévue, objectif rr × risque réel, sortie au marché à exitMin (heure NY). Les deux sens touchés dans la même minute : rien.
 */
export function dipTrades(X, { dirs = [1, -1], d, fromMin, toMin, exitMin, rr, stopK = 1, exec = 'limit', spreadAt, swap = () => 0, maxPerDay = 99 }) {
  const { S, b15 } = X, out = [];
  let busy = -Infinity; const perDay = new Map();
  for (let j = 0; j < b15.length - 1; j++) {
    const tau = b15[j].t + 15 * MIN;
    if (tau < busy) continue;
    const nm = nyMin(tau);
    if (!inWindow(nm, fromMin, toMin)) continue;
    const i0 = b15[j].i1 + 1;
    if (i0 >= S.n || S.t[i0] - tau > 5 * MIN) continue;
    const dk = dayKey(tau); if ((perDay.get(dk) || 0) >= maxPerDay) continue;
    const atr = atrH1At(X, i0); if (!atr) continue;
    const c = b15[j].c, sp = spreadAt(c), exitAt = nextNyTime(tau, exitMin);
    const until = Math.min(tau + 15 * MIN, exitAt);
    let hit = null;
    for (let k = i0; k < S.n && S.t[k] < until; k++) {
      const up = dirs.includes(-1) && S.h[k] >= c + d * atr, dn = dirs.includes(1) && S.l[k] + sp <= c - d * atr;
      if (up && dn) break;
      if (up || dn) { hit = { k, dir: dn ? 1 : -1 }; break; }
    }
    if (!hit) continue;
    const dir = hit.dir, L = c - dir * d * atr;
    let spec;
    if (exec === 'limit') spec = { dir, i: hit.k, entry: { type: 'limit', price: L }, expiry: S.t[hit.k] + MIN, stop: L - dir * stopK * atr, rr, exitAt, spread: sp, swap };
    else {
      const e = hit.k + 1; if (e >= S.n || S.t[e] >= exitAt) continue;
      const f0 = dir > 0 ? S.o[e] + sp : S.o[e];
      spec = { dir, i: e, stop: f0 - dir * stopK * atr, rr, exitAt, spread: sp, swap };
    }
    const r = simulate(S, spec);
    if (r.missed) continue;
    out.push({ ...r, dir, tau });
    perDay.set(dk, (perDay.get(dk) || 0) + 1);
    busy = r.exitTime + MIN;
  }
  return out;
}

/** Clôture de la séance cash (dernière minute avant 16 h 00 NY) de chaque journée de trading, et ouverture de 9 h 30 : index M1. */
export function cashSessions(S) {
  const map = new Map(); // dayKey -> { open930: i, close1600: i }
  for (let i = 0; i < S.n; i++) {
    const nm = nyMin(S.t[i]), dk = dayKey(S.t[i]);
    if (nm >= 570 && nm < 575) { const s = map.get(dk) || {}; if (s.open930 == null) s.open930 = i; map.set(dk, s); }
    if (nm >= 900 && nm < 960) { const s = map.get(dk) || {}; s.close1600 = i; map.set(dk, s); }
  }
  return map;
}

/**
 * Écart d'ouverture de 9 h 30 : si l'ouverture est à plus de g × ATR H1 de la clôture de 16 h 00 de la veille, pari que l'écart se
 * referme (dirs [1] = seulement les écarts à la baisse, achetés). Entrée au marché à 9 h 31, stop stopK × ATR, objectif = clôture de la
 * veille (au moins 0,5 R), sortie au marché à exitMin.
 */
export function gapTrades(X, sessions, { g, exitMin, stopK = 1, dirs = [1, -1], spreadAt, swap = () => 0 }) {
  const { S } = X, out = [];
  const keys = [...sessions.keys()].sort((a, b) => a - b);
  for (let q = 1; q < keys.length; q++) {
    const prev = sessions.get(keys[q - 1]), cur = sessions.get(keys[q]);
    if (!prev || !cur || prev.close1600 == null || cur.open930 == null) continue;
    const i = cur.open930 + 1; if (i >= S.n) continue;
    const pc = S.c[prev.close1600], op = S.o[cur.open930], atr = atrH1At(X, cur.open930);
    if (!atr || Math.abs(op - pc) < g * atr) continue;
    const dir = op < pc ? 1 : -1; if (!dirs.includes(dir)) continue;
    const sp = spreadAt(op), f0 = dir > 0 ? S.o[i] + sp : S.o[i], stop = f0 - dir * stopK * atr;
    if (dir * (pc - f0) < 0.5 * Math.abs(f0 - stop)) continue;
    const r = simulate(S, { dir, i, stop, target: pc, exitAt: nextNyTime(S.t[cur.open930], exitMin), spread: sp, swap });
    if (!r.missed) out.push({ ...r, dir, tau: S.t[cur.open930] });
  }
  return out;
}

/** Jour de la semaine : entrée au marché à 9 h 31 dans le sens `dir` le jour `dow` (1 = lundi), stop stopK × ATR H1, sortie à 16 h 00. */
export function weekdayTrades(X, sessions, { dow, dir, stopK = 1, spreadAt, swap = () => 0 }) {
  const { S } = X, out = [];
  for (const s of sessions.values()) {
    if (s.open930 == null || dayOfWeek(S.t[s.open930]) !== dow) continue;
    const i = s.open930 + 1; if (i >= S.n) continue;
    const atr = atrH1At(X, s.open930); if (!atr) continue;
    const sp = spreadAt(S.o[i]), f0 = dir > 0 ? S.o[i] + sp : S.o[i];
    const r = simulate(S, { dir, i, stop: f0 - dir * stopK * atr, target: null, exitAt: nextNyTime(S.t[s.open930], 960), spread: sp, swap });
    if (!r.missed) out.push({ ...r, dir, tau: S.t[s.open930] });
  }
  return out.sort((a, b) => a.entryTime - b.entryTime);
}
