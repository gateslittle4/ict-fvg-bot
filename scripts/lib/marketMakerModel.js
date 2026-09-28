// marketMakerModel.js - règles de data/backtest-input/preregistration-market-maker-model-2026-09-25.md (fonctions pures, testées dans
// test/marketMakerModel.test.js). Market Maker Buy Model (et Sell Model en miroir), version mécanique.
// Entrée : une série M1 { t, o, h, l, c, n } (ms UTC, bid). Sortie : la liste des trades.
const MIN = 60000, M15 = 15 * MIN, H1 = 60 * MIN;
export const MMM_RULES = Object.freeze({ ocBars: 12, ocMaxAtr: 1.5, atrBars: 14, breakoutBars: 24, declineAtr: 3, mssMaxBars: 480, limitBars: 16, minRR: 2, minStopSpreads: 3, maxHoldMin: 7200 });

/** Bougies d'une période (ms) à partir des M1 : { t, o, h, l, c, i0, i1, n } (i0/i1 = indices M1 [début, fin)). */
export function buildBars(S, period) {
  const t = [], o = [], h = [], l = [], c = [], i0 = [], i1 = [];
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / period) * period;
    const k = t.length - 1;
    if (k >= 0 && t[k] === b) { if (S.h[i] > h[k]) h[k] = S.h[i]; if (S.l[i] < l[k]) l[k] = S.l[i]; c[k] = S.c[i]; i1[k] = i + 1; continue; }
    t.push(b); o.push(S.o[i]); h.push(S.h[i]); l.push(S.l[i]); c.push(S.c[i]); i0.push(i); i1.push(i + 1);
  }
  return { t, o, h, l, c, i0, i1, n: t.length };
}

/** Vue « achat » d'une série de bougies : pour le Sell Model, les prix sont inversés (hauts <-> bas), la structure devient celle d'un achat. */
function view(B, long) {
  if (long) return B;
  return { ...B, o: B.o.map((x) => -x), c: B.c.map((x) => -x), h: B.l.map((x) => -x), l: B.h.map((x) => -x) };
}

function atrAt(H, j, n) {
  if (j < n + 1) return null;
  let s = 0;
  for (let k = j - n; k < j; k++) s += Math.max(H.h[k] - H.l[k], Math.abs(H.h[k] - H.c[k - 1]), Math.abs(H.l[k] - H.c[k - 1]));
  return s / n;
}

const isSwingLow = (B, k) => k >= 2 && k + 2 < B.n && B.l[k] < B.l[k - 1] && B.l[k] < B.l[k - 2] && B.l[k] < B.l[k + 1] && B.l[k] < B.l[k + 2];
const isSwingHigh = (B, k) => k >= 2 && k + 2 < B.n && B.h[k] > B.h[k - 1] && B.h[k] > B.h[k - 2] && B.h[k] > B.h[k + 1] && B.h[k] > B.h[k + 2];
const firstAtOrAfter = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] >= x) hi = m; else lo = m + 1; } return lo; };

/**
 * Structure d'un modèle en vue « achat » (prix inversés pour une vente) à partir de la sortie de la consolidation.
 * @returns {{ ok: true, extreme, fvgK, entryView } | { ok: false, endTime }}
 */
function structure(Hv, Mv, b, ocl, atr, R) {
  const start = firstAtOrAfter(Mv.t, Hv.t[b]); // première M15 de la bougie H1 de sortie
  const need = ocl - R.declineAtr * atr;
  let ext = Infinity, extIdx = -1, reached = 'descente < 3 ATR en 5 jours';
  for (let i = start; i < Mv.n && i - start <= R.mssMaxBars; i++) {
    if (Mv.l[i] < ext) { ext = Mv.l[i]; extIdx = i; }
    if (ext > need) continue;
    if (reached === 'descente < 3 ATR en 5 jours') reached = 'pas de plus bas H1 balayé';
    // condition 3 : un plus bas fractal H1 formé après la sortie, confirmé, avant la bougie du plus bas extrême, et balayé par lui
    const extTime = Mv.t[extIdx];
    let swept = false;
    for (let k = b; k < Hv.n && Hv.t[k] < extTime; k++) {
      if (Hv.t[k] + 3 * H1 > Mv.t[i] + M15) break; // fractal pas encore confirmé (k+2 fini) au moment de cette M15
      if (isSwingLow(Hv, k) && Hv.l[k] > ext) { swept = true; break; }
    }
    if (!swept) continue;
    reached = 'pas de MSS M15';
    // condition 4 : clôture M15 au-dessus du dernier plus haut fractal M15 formé avant le plus bas extrême (confirmé à m+2 <= i)
    let sh = -1;
    for (let m = extIdx - 1; m >= start; m--) if (m + 2 <= i && isSwingHigh(Mv, m)) { sh = m; break; }
    if (sh < 0 || !(Mv.c[i] > Mv.h[sh])) continue;
    // condition 5 : dernier FVG haussier M15 avec k entre extIdx + 2 et i + 1
    let fvgK = -1;
    for (let k = Math.min(i + 1, Mv.n - 1); k >= extIdx + 2; k--) if (Mv.h[k - 2] < Mv.l[k]) { fvgK = k; break; }
    if (fvgK < 0) return { ok: false, stage: 'MSS sans FVG', endTime: Mv.t[Math.min(i + 1, Mv.n - 1)] + M15 };
    return { ok: true, extreme: ext, fvgK };
  }
  const last = Math.min(start + R.mssMaxBars, Mv.n - 1);
  return { ok: false, stage: reached, endTime: (Mv.t[last] ?? Hv.t[b]) + M15 };
}

/** Exécution minute par minute (vrais prix, spread) : LIMIT au bord du FVG, stop, cible, 5 jours. */
function execute(S, M, setup, spreadAt, R) {
  const { long, entry, stop, target, fvgK } = setup;
  const s = spreadAt(entry);
  const risk = long ? entry - stop : stop - entry;
  if (!(risk > 0) || risk < R.minStopSpreads * s) return { trade: null, why: 'stop < 3 spreads', endTime: M.t[fvgK] + M15 };
  if ((long ? target - entry : entry - target) < R.minRR * risk) return { trade: null, why: 'cible < 2R', endTime: M.t[fvgK] + M15 };
  const from = M.t[fvgK] + M15, until = M.t[fvgK] + (R.limitBars + 1) * M15;
  let fill = -1;
  for (let j = firstAtOrAfter(S.t, from); j < S.n && S.t[j] < until; j++) {
    if (long ? S.l[j] <= entry - s : S.h[j] >= entry) { fill = j; break; }
    if (long ? S.l[j] <= stop : S.h[j] + s >= stop) return { trade: null, why: 'stop touché avant l\'entrée', endTime: S.t[j] + MIN }; // annulé
  }
  if (fill < 0) return { trade: null, why: 'LIMIT non rempli en 4 h', endTime: until };
  let exit = null, exitTime = null, reason = 'time', last = fill;
  for (let j = fill; j < S.n && S.t[j] < S.t[fill] + R.maxHoldMin * MIN; j++) {
    last = j;
    if (long ? S.l[j] <= stop : S.h[j] + s >= stop) {
      exit = long ? (j > fill && S.o[j] < stop ? S.o[j] : stop) : (j > fill && S.o[j] + s > stop ? S.o[j] + s : stop);
      exitTime = S.t[j]; reason = 'stop'; break;
    }
    if (j > fill && (long ? S.h[j] >= target : S.l[j] + s <= target)) { exit = target; exitTime = S.t[j]; reason = 'target'; break; }
  }
  if (exit === null) { exit = long ? S.c[last] : S.c[last] + s; exitTime = S.t[last]; }
  const pnl = long ? exit - entry : entry - exit;
  return { trade: { long, entry, stop, target, entryTime: S.t[fill], exitTime, exit, reason, r: pnl / risk, rr: Math.abs(target - entry) / risk }, endTime: exitTime + MIN };
}

/** Tous les trades du modèle sur une série M1. `spreadAt(prix)` = spread au niveau de prix. */
export function marketMakerTrades(S, spreadAt, rules = MMM_RULES, stats = null) {
  const count = (k) => { if (stats) stats[k] = (stats[k] || 0) + 1; };
  const R = { ...MMM_RULES, ...rules };
  const H = buildBars(S, H1), M = buildBars(S, M15);
  const views = { true: [H, M], false: [view(H, false), view(M, false)] };
  const trades = [];
  let j = R.atrBars + R.ocBars + 1;
  while (j + R.breakoutBars < H.n) {
    let hi = -Infinity, lo = Infinity;
    for (let k = j - R.ocBars; k < j; k++) { if (H.h[k] > hi) hi = H.h[k]; if (H.l[k] < lo) lo = H.l[k]; }
    const atr = atrAt(H, j, R.atrBars);
    if (!atr || hi - lo > R.ocMaxAtr * atr) { j++; continue; }
    let b = -1, long = null;
    for (let k = j; k < j + R.breakoutBars; k++) { if (H.c[k] < lo) { b = k; long = true; break; } if (H.c[k] > hi) { b = k; long = false; break; } }
    count('consolidations');
    if (b < 0) { j++; continue; }
    count('sorties');
    const [Hv, Mv] = views[long];
    const ocl = long ? lo : -hi; // bord de la consolidation du côté de la sortie, en vue « achat »
    const st = structure(Hv, Mv, b, ocl, atr, R);
    let endTime;
    if (!st.ok) { endTime = st.endTime; count(st.stage); }
    else {
      const setup = { long, fvgK: st.fvgK, entry: long ? M.l[st.fvgK] : M.h[st.fvgK], stop: long ? st.extreme : -st.extreme, target: long ? lo : hi };
      count('structures complètes (MSS + FVG)');
      const ex = execute(S, M, setup, spreadAt, R);
      if (ex.trade) trades.push(ex.trade); else count(ex.why);
      endTime = ex.endTime;
    }
    j = Math.max(j + 1, firstAtOrAfter(H.t, endTime) + R.ocBars);
  }
  return trades;
}
